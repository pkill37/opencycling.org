import type { TrainerTelemetrySample } from "../types";
import { PacketReader } from "./reader";
export function parseIndoorBikeData(
  data: DataView,
  timestampMs = Date.now(),
): TrainerTelemetrySample {
  const r = new PacketReader(data),
    flags = r.u16();
  if (flags & 0xe000)
    throw new Error(
      "Unsupported Indoor Bike Data flags. Try Cycling Power mode or simulator mode.",
    );
  const s: TrainerTelemetrySample = { source: "ftms", timestampMs };
  if (!(flags & 1)) s.speedMetersPerSecond = r.u16() / 360;
  if (flags & 2) r.skip(2);
  if (flags & 4) s.cadenceRpm = r.u16() / 2;
  if (flags & 8) r.skip(2);
  if (flags & 16) r.skip(3);
  if (flags & 32) r.skip(2);
  if (flags & 64) s.powerWatts = r.i16();
  if (flags & 128) r.skip(2);
  if (flags & 256) r.skip(5);
  if (flags & 512) s.heartRateBpm = r.u8();
  if (flags & 1024) r.skip(1);
  if (flags & 2048) r.skip(2);
  if (flags & 4096) r.skip(2);
  return s;
}
