import * as U from "../constants";
import { bluetoothAvailability, bluetoothError } from "../availability";
import type {
  TrainerSource,
  TrainerConnectionState,
  TrainerTelemetrySample,
  TrainerControlCapabilities,
  TrainerControlSource,
  SimulationParameters,
} from "../types";
import {
  clampResistance,
  controlFailure,
  encodeRequestControl,
  encodeSetSimulationParameters,
  encodeSetTargetResistance,
  parseControlResponse,
  parseTrainerControlCapabilities,
  parseResistanceRange,
} from "../ftms-control";
import { parseIndoorBikeData } from "../parsers/parse-indoor-bike-data";
import {
  parseCyclingPowerMeasurement,
  type CrankSample,
} from "../parsers/parse-cycling-power-measurement";
export class BluetoothTrainerSource
  implements TrainerSource, TrainerControlSource
{
  readonly id = "bluetooth";
  label = "Smart trainer";
  kind: "bluetooth-ftms" | "bluetooth-cps" = "bluetooth-ftms";
  state: TrainerConnectionState = "idle";
  error = "";
  services: string[] = [];
  features: string[] = [];
  diagnostics: string[] = [];
  last?: TrainerTelemetrySample;
  controlCapabilities: TrainerControlCapabilities = {
    supported: false,
    supportsSimulationParameters: false,
    supportsResistanceLevel: false,
  };
  controlStatusMessage = "";
  private device?: BluetoothDevice;
  private chars: BluetoothRemoteGATTCharacteristic[] = [];
  private callbacks = new Set<(s: TrainerTelemetrySample) => void>();
  private listeners = new Map<
    BluetoothRemoteGATTCharacteristic,
    EventListener
  >();
  private generation = 0;
  private changeCallbacks = new Set<() => void>();
  private controlPoint?: BluetoothRemoteGATTCharacteristic;
  private statusCharacteristic?: BluetoothRemoteGATTCharacteristic;
  private statusListener?: EventListener;
  private controlQueue = Promise.resolve();
  private controlEnabled = false;
  private controlGeneration = 0;
  private pendingControlCancellations = new Set<() => void>();
  subscribeChanges(callback: () => void) {
    this.changeCallbacks.add(callback);
    return () => {
      this.changeCallbacks.delete(callback);
    };
  }
  private notifyChanges() {
    this.changeCallbacks.forEach((callback) => callback());
  }
  private log(message: string) {
    this.diagnostics = [
      ...this.diagnostics.slice(-19),
      `${new Date().toLocaleTimeString()}: ${message}`,
    ];
    this.notifyChanges();
  }
  getState() {
    return this.state;
  }
  private setState(state: TrainerConnectionState) {
    this.state = state;
    this.log(`State -> ${state.replaceAll("-", " ")}`);
  }
  subscribe(cb: (s: TrainerTelemetrySample) => void) {
    this.callbacks.add(cb);
    return () => {
      this.callbacks.delete(cb);
    };
  }
  private lost = () => {
    this.generation++;
    this.cleanup();
    this.error = "Trainer disconnected. Reconnect, or switch to the simulator.";
    this.log("GATT server disconnected event received.");
    this.setState("disconnected");
  };
  private cleanup() {
    this.controlGeneration++;
    for (const cancel of this.pendingControlCancellations) cancel();
    this.pendingControlCancellations.clear();
    for (const [char, listener] of this.listeners)
      char.removeEventListener("characteristicvaluechanged", listener);
    this.listeners.clear();
    if (this.statusCharacteristic && this.statusListener)
      this.statusCharacteristic.removeEventListener(
        "characteristicvaluechanged",
        this.statusListener,
      );
    this.statusCharacteristic = undefined;
    this.statusListener = undefined;
    this.chars = [];
    this.controlPoint = undefined;
    this.controlEnabled = false;
    this.controlStatusMessage = "";
    this.controlCapabilities = {
      supported: false,
      supportsSimulationParameters: false,
      supportsResistanceLevel: false,
    };
  }
  async disconnect() {
    this.generation++;
    this.cleanup();
    this.device?.removeEventListener("gattserverdisconnected", this.lost);
    this.device?.gatt?.disconnect();
    this.setState("disconnected");
  }
  async requestControl() {
    if (!this.controlCapabilities.supported || !this.controlPoint)
      throw new Error("Trainer control is unavailable.");
    const generation = this.controlGeneration;
    await this.sendControl(encodeRequestControl(), 0x00);
    if (generation !== this.controlGeneration)
      throw new Error("Trainer control session changed.");
    this.controlEnabled = true;
  }
  async setSimulationParameters(parameters: SimulationParameters) {
    if (
      !this.controlEnabled ||
      !this.controlCapabilities.supportsSimulationParameters
    )
      throw new Error("Simulation-grade control is unavailable.");
    await this.sendControl(encodeSetSimulationParameters(parameters), 0x11);
  }
  async setTargetResistance(level: number) {
    if (
      !this.controlEnabled ||
      !this.controlCapabilities.supportsResistanceLevel
    )
      throw new Error("Resistance-level control is unavailable.");
    await this.sendControl(
      encodeSetTargetResistance(
        clampResistance(level, this.controlCapabilities),
      ),
      0x04,
    );
  }
  async releaseControl() {
    this.controlGeneration++;
    this.controlEnabled = false;
    if (!this.controlPoint) return;
    try {
      await this.sendControl(Uint8Array.of(0x08, 0x01), 0x08);
    } catch (error) {
      this.log(`Control cleanup failed: ${bluetoothError(error)}`);
    }
  }
  private sendControl(payload: Uint8Array, request: number) {
    const generation = this.generation;
    const controlGeneration = this.controlGeneration;
    const run = async () => {
      if (
        generation !== this.generation ||
        controlGeneration !== this.controlGeneration ||
        !this.controlPoint
      )
        throw new Error("Trainer connection changed during control command.");
      const characteristic = this.controlPoint;
      const response = new Promise<void>((resolve, reject) => {
        let settled = false;
        const cleanupResponse = () => {
          characteristic.removeEventListener(
            "characteristicvaluechanged",
            listener,
          );
          clearTimeout(timer);
          this.pendingControlCancellations.delete(cancel);
        };
        const finish = (error?: Error) => {
          if (settled) return;
          settled = true;
          cleanupResponse();
          if (error) reject(error);
          else resolve();
        };
        const listener: EventListener = () => {
          try {
            const value = characteristic.value;
            if (!value) return;
            const result = parseControlResponse(value);
            if (result.request !== request) return;
            if (result.result !== 0x01)
              finish(new Error(controlFailure(result.result)));
            else finish();
          } catch (error) {
            finish(error instanceof Error ? error : new Error(String(error)));
          }
        };
        const cancel = () =>
          finish(
            new Error("Trainer connection changed during control command."),
          );
        this.pendingControlCancellations.add(cancel);
        characteristic.addEventListener("characteristicvaluechanged", listener);
        const timer = setTimeout(
          () =>
            finish(new Error("Timed out waiting for FTMS control response.")),
          5000,
        );
        const bytes = payload.buffer.slice(
          payload.byteOffset,
          payload.byteOffset + payload.byteLength,
        ) as ArrayBuffer;
        void characteristic.writeValueWithResponse(bytes).catch((error) => {
          finish(error instanceof Error ? error : new Error(String(error)));
        });
      });
      await response;
      this.log(`FTMS control command 0x${request.toString(16)} accepted.`);
    };
    const next = this.controlQueue.then(run, run);
    this.controlQueue = next.catch(() => {});
    return next;
  }
  async connect(debug = false, preferCps = false, reconnect = false) {
    const available = bluetoothAvailability();
    this.diagnostics = [...available.details];
    this.log("Starting Bluetooth trainer connection.");
    if (!available.available) {
      this.error = available.message;
      this.setState("unsupported");
      return;
    }
    await this.disconnect();
    const generation = ++this.generation;
    this.error = "";
    this.services = [];
    this.features = [];
    this.last = undefined;
    try {
      if (!reconnect || !this.device) {
        this.setState("requesting-device");
        this.log(
          debug
            ? "Opening chooser with acceptAllDevices and FTMS/CPS optional services."
            : "Opening chooser filtered to FTMS and Cycling Power services.",
        );
        this.device = await navigator.bluetooth.requestDevice(
          debug
            ? {
                acceptAllDevices: true,
                optionalServices: [U.FTMS_SERVICE, U.CYCLING_POWER_SERVICE],
              }
            : {
                filters: [
                  { services: [U.FTMS_SERVICE] },
                  { services: [U.CYCLING_POWER_SERVICE] },
                ],
                optionalServices: [U.FTMS_SERVICE, U.CYCLING_POWER_SERVICE],
              },
        );
      }
      if (generation !== this.generation) return;
      this.label = this.device.name || "Unnamed trainer";
      this.log(`Selected device: ${this.label}`);
      this.device.addEventListener("gattserverdisconnected", this.lost);
      this.setState("connecting");
      const server = await this.device.gatt?.connect();
      if (!server) throw new Error("This device has no GATT server.");
      this.log("GATT server connected.");
      if (generation !== this.generation) {
        server.disconnect();
        return;
      }
      this.setState("discovering-services");
      const failures: string[] = [];
      for (const protocol of preferCps ? ["cps"] : ["ftms", "cps"]) {
        let characteristic: BluetoothRemoteGATTCharacteristic | undefined;
        let listener: EventListener | undefined;
        try {
          const ftms = protocol === "ftms";
          this.log(`Looking for ${ftms ? "FTMS" : "Cycling Power"} service.`);
          const service = await server.getPrimaryService(
            ftms ? U.FTMS_SERVICE : U.CYCLING_POWER_SERVICE,
          );
          if (generation !== this.generation) return;
          this.services.push(
            ftms ? "Fitness Machine (FTMS)" : "Cycling Power (CPS)",
          );
          this.log(`Found ${ftms ? "FTMS" : "Cycling Power"} service.`);
          try {
            const feature = await (
              await service.getCharacteristic(
                ftms ? U.FITNESS_MACHINE_FEATURE : U.CYCLING_POWER_FEATURE,
              )
            ).readValue();
            this.features.push(
              `${protocol.toUpperCase()}: ${Array.from(
                new Uint8Array(
                  feature.buffer,
                  feature.byteOffset,
                  feature.byteLength,
                ),
              )
                .map((x) => x.toString(16).padStart(2, "0"))
                .join(" ")}`,
            );
            if (ftms && feature.byteLength >= 8) {
              const featureView = new DataView(
                feature.buffer,
                feature.byteOffset,
                feature.byteLength,
              );
              this.controlCapabilities =
                parseTrainerControlCapabilities(featureView);
            }
            this.log(`Read ${protocol.toUpperCase()} feature bytes.`);
          } catch {
            this.features.push(
              `${protocol.toUpperCase()}: feature read unavailable`,
            );
            this.log(`${protocol.toUpperCase()} feature read unavailable.`);
          }
          this.log(
            `Looking for ${ftms ? "Indoor Bike Data" : "Cycling Power Measurement"} characteristic.`,
          );
          characteristic = await service.getCharacteristic(
            ftms ? U.INDOOR_BIKE_DATA : U.CYCLING_POWER_MEASUREMENT,
          );
          if (generation !== this.generation) return;
          let crank: CrankSample | undefined;
          let lastCrankMovementMs = Date.now();
          let lastCadence: number | undefined;
          listener = () => {
            if (generation !== this.generation) return;
            try {
              const value = characteristic?.value;
              if (!value) return;
              let sample: TrainerTelemetrySample;
              if (ftms) sample = parseIndoorBikeData(value);
              else {
                const result = parseCyclingPowerMeasurement(
                  value,
                  Date.now(),
                  crank,
                );
                sample = result.sample;
                // Notifications may repeat the same crank event between revolutions.
                // Hold cadence briefly, then report zero when the crank stops.
                if (result.crank && crank) {
                  if (result.crank.revolutions !== crank.revolutions) {
                    lastCrankMovementMs = sample.timestampMs;
                    lastCadence = sample.cadenceRpm;
                  } else {
                    sample.cadenceRpm =
                      sample.timestampMs - lastCrankMovementMs > 2000
                        ? 0
                        : lastCadence;
                  }
                }
                crank = result.crank ?? crank;
              }
              const firstPacket = !this.last;
              this.last = { ...this.last, ...sample };
              this.error = "";
              if (firstPacket)
                this.log(
                  `First ${protocol.toUpperCase()} telemetry packet received.`,
                );
              this.callbacks.forEach((cb) => cb(sample));
              this.notifyChanges();
            } catch (error) {
              this.error = bluetoothError(error);
              this.notifyChanges();
            }
          };
          characteristic.addEventListener(
            "characteristicvaluechanged",
            listener,
          );
          this.listeners.set(characteristic, listener);
          this.setState("subscribing");
          this.log(`Starting ${protocol.toUpperCase()} notifications.`);
          await characteristic.startNotifications();
          if (generation !== this.generation) {
            characteristic.removeEventListener(
              "characteristicvaluechanged",
              listener,
            );
            return;
          }
          this.chars.push(characteristic);
          if (ftms) this.kind = "bluetooth-ftms";
          else if (!this.chars.some((c) => c.uuid === U.INDOOR_BIKE_DATA))
            this.kind = "bluetooth-cps";
          this.log(`${protocol.toUpperCase()} notifications active.`);
          if (ftms) {
            try {
              this.controlPoint = await service.getCharacteristic(
                U.FITNESS_MACHINE_CONTROL_POINT,
              );
              await this.controlPoint.startNotifications();
              this.log("FTMS control point discovered and subscribed.");
              try {
                this.statusCharacteristic = await service.getCharacteristic(
                  U.FITNESS_MACHINE_STATUS,
                );
                this.statusListener = () => {
                  const value = this.statusCharacteristic?.value;
                  if (!value || value.byteLength < 1) return;
                  // 0xFF is Control Permission Lost in FTMS 1.0.1.
                  if (value.getUint8(0) === 0xff) {
                    this.controlGeneration++;
                    this.controlEnabled = false;
                    this.controlCapabilities = {
                      ...this.controlCapabilities,
                      supported: false,
                    };
                    this.controlStatusMessage =
                      "Trainer control permission was lost; using virtual resistance only.";
                    this.log(this.controlStatusMessage);
                  }
                };
                this.statusCharacteristic.addEventListener(
                  "characteristicvaluechanged",
                  this.statusListener,
                );
                await this.statusCharacteristic.startNotifications();
              } catch {
                if (this.statusCharacteristic && this.statusListener)
                  this.statusCharacteristic.removeEventListener(
                    "characteristicvaluechanged",
                    this.statusListener,
                  );
                this.statusCharacteristic = undefined;
                this.statusListener = undefined;
                this.log("FTMS status notifications unavailable.");
              }
              if (this.controlCapabilities.supportsResistanceLevel) {
                try {
                  const range = await service.getCharacteristic(
                    U.SUPPORTED_RESISTANCE_LEVEL_RANGE,
                  );
                  this.controlCapabilities = {
                    ...this.controlCapabilities,
                    resistanceRange: parseResistanceRange(
                      await range.readValue(),
                    ),
                  };
                } catch {
                  this.log(
                    "Resistance range unavailable; using safe default range.",
                  );
                }
              }
            } catch (error) {
              this.controlPoint = undefined;
              this.controlCapabilities = {
                supported: false,
                supportsSimulationParameters: false,
                supportsResistanceLevel: false,
              };
              this.log(`FTMS control unavailable: ${bluetoothError(error)}`);
            }
          }
        } catch (error) {
          if (characteristic && listener) {
            characteristic.removeEventListener(
              "characteristicvaluechanged",
              listener,
            );
            this.listeners.delete(characteristic);
          }
          const failure = `${protocol.toUpperCase()}: ${bluetoothError(error)}`;
          failures.push(failure);
          this.log(failure);
        }
      }
      if (generation !== this.generation) return;
      if (!this.chars.length)
        throw new Error(
          `No readable trainer telemetry. Indoor Bike Data or Cycling Power notifications are required. ${failures.join(" ")}`,
        );
      this.setState("connected");
    } catch (error) {
      if (generation !== this.generation) return;
      this.cleanup();
      this.device?.removeEventListener("gattserverdisconnected", this.lost);
      this.device?.gatt?.disconnect();
      this.error = bluetoothError(error);
      this.log(`Connection failed: ${this.error}`);
      this.setState("error");
    }
  }
}
