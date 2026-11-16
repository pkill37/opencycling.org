import type { PhysicsConfig } from "@/types";
import type { SimulationParameters, TrainerControlCapabilities } from "./types";

export const FTMS_CONTROL_RESPONSE = 0x80;
export const FTMS_CONTROL_RESULT = {
  success: 0x01,
  unsupported: 0x02,
  invalidParameter: 0x03,
  operationFailed: 0x04,
  controlNotPermitted: 0x05,
} as const;

const signed16 = (value: number) =>
  Math.max(-32768, Math.min(32767, Math.round(value)));
const u8 = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

export function encodeRequestControl() {
  return Uint8Array.of(0x00);
}
export function encodeSetSimulationParameters(
  parameters: SimulationParameters,
) {
  const bytes = new ArrayBuffer(7);
  const view = new DataView(bytes);
  view.setUint8(0, 0x11);
  view.setInt16(1, signed16(parameters.windSpeedMetersPerSecond * 1000), true);
  view.setInt16(3, signed16(parameters.gradePercent * 100), true);
  view.setUint8(5, u8(parameters.rollingResistanceCoefficient * 10000));
  view.setUint8(6, u8(parameters.windResistanceCoefficient * 100));
  return new Uint8Array(bytes);
}
export function encodeSetTargetResistance(level: number) {
  const bytes = new ArrayBuffer(3);
  const view = new DataView(bytes);
  view.setUint8(0, 0x04);
  view.setInt16(1, signed16(level * 10), true);
  return new Uint8Array(bytes);
}
export function parseControlResponse(value: DataView) {
  if (value.byteLength < 3 || value.getUint8(0) !== FTMS_CONTROL_RESPONSE)
    throw new Error("Invalid FTMS control-point response.");
  return { request: value.getUint8(1), result: value.getUint8(2) };
}
export function parseTrainerControlCapabilities(value: DataView) {
  if (value.byteLength < 8)
    return {
      supported: false,
      supportsSimulationParameters: false,
      supportsResistanceLevel: false,
    } satisfies TrainerControlCapabilities;
  const targetFeatures = value.getUint32(4, true);
  return {
    supported: Boolean(targetFeatures & ((1 << 2) | (1 << 13))),
    supportsSimulationParameters: Boolean(targetFeatures & (1 << 13)),
    supportsResistanceLevel: Boolean(targetFeatures & (1 << 2)),
  } satisfies TrainerControlCapabilities;
}
export function parseResistanceRange(value: DataView) {
  if (value.byteLength < 6) throw new Error("Invalid resistance range.");
  return {
    min: value.getInt16(0, true) / 10,
    max: value.getInt16(2, true) / 10,
    step: Math.max(0.1, value.getUint16(4, true) / 10),
  };
}
export function controlFailure(result: number) {
  return result === FTMS_CONTROL_RESULT.unsupported
    ? "Trainer does not support this control command."
    : result === FTMS_CONTROL_RESULT.invalidParameter
      ? "Trainer rejected the control parameter."
      : result === FTMS_CONTROL_RESULT.controlNotPermitted
        ? "Trainer control is not permitted."
        : "Trainer control command failed.";
}
export function clampResistance(
  level: number,
  capabilities: TrainerControlCapabilities,
) {
  const range = capabilities.resistanceRange ?? { min: 0, max: 100, step: 0.1 };
  const clamped = Math.max(range.min, Math.min(range.max, level));
  const steps = Math.min(
    Math.floor((range.max - range.min) / range.step),
    Math.round((clamped - range.min) / range.step),
  );
  return range.min + steps * range.step;
}
export function resistanceForGrade(
  gradient: number,
  speed: number,
  config: PhysicsConfig,
  capabilities: TrainerControlCapabilities,
) {
  const mass = config.riderMassKg + config.bikeMassKg;
  const force = Math.max(
    0,
    mass * config.gravity * Math.sin(Math.atan(gradient)) +
      config.crr * mass * config.gravity * Math.cos(Math.atan(gradient)) +
      0.5 * config.airDensity * config.cda * speed * speed,
  );
  const range = capabilities.resistanceRange ?? { min: 0, max: 100, step: 0.1 };
  return clampResistance(
    range.min + (force / config.maxDriveForce) * (range.max - range.min),
    capabilities,
  );
}
