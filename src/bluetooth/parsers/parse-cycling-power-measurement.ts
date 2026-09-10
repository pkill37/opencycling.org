import type { TrainerTelemetrySample } from "../types";
import { PacketReader } from "./reader";
export interface CrankSample {
  revolutions: number;
  eventTime: number;
}
export function parseCyclingPowerMeasurement(
  data: DataView,
  timestampMs = Date.now(),
  previous?: CrankSample,
): { sample: TrainerTelemetrySample; crank?: CrankSample } {
  const r = new PacketReader(data),
    flags = r.u16();
  if (flags & 0xe000) throw new Error("Unsupported Cycling Power flags.");
  const sample: TrainerTelemetrySample = {
    source: "cycling-power",
    timestampMs,
    powerWatts: r.i16(),
  };
  if (flags & 1) r.skip(1);
  if (flags & 4) r.skip(2);
  if (flags & 16) r.skip(6);
  let crank: CrankSample | undefined;
  if (flags & 32) {
    crank = { revolutions: r.u16(), eventTime: r.u16() };
    if (previous) {
      const rev = (crank.revolutions - previous.revolutions + 65536) % 65536,
        ticks = (crank.eventTime - previous.eventTime + 65536) % 65536;
      if (ticks > 0 && rev > 0) {
        const rpm = (rev * 60 * 1024) / ticks;
        if (rpm <= 250) sample.cadenceRpm = rpm;
      } else if (rev === 0) sample.cadenceRpm = 0;
    }
  }
  if (flags & 64) r.skip(4);
  if (flags & 128) r.skip(4);
  if (flags & 256) r.skip(3);
  if (flags & 512) r.skip(2);
  if (flags & 1024) r.skip(2);
  if (flags & 2048) r.skip(2);
  return { sample, crank };
}
