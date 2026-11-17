import type { ZombiesSnapshot } from "../modes/zombies";

export function zombieSoundLevel(gapMeters: number, count: number) {
  if (!Number.isFinite(gapMeters) || count <= 0) return 0;
  const proximity = Math.max(0, Math.min(1, 1 - gapMeters / 180));
  return proximity * (0.12 + proximity * 0.88) * Math.min(1, 0.7 + count * 0.1);
}

type Voice = { stop(): void };

/** Synthesized growls: no downloads, timers, microphone or audio on the landing page. */
export class ZombieAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private noise?: AudioBuffer;
  private voices = new Set<Voice>();
  private muted = false;
  private nextGroanAt = 0;
  private lastEatenCount = 0;
  private voiceIndex = 0;
  private playing = false;
  constructor(private createContext = () => new AudioContext()) {}

  async unlock() {
    try {
      if (!this.context || this.context.state === "closed") {
        const context = this.createContext();
        this.context = context;
        this.master = context.createGain();
        this.master.gain.value = 0;
        this.master.connect(context.destination);
        this.noise = context.createBuffer(
          1,
          Math.ceil(context.sampleRate * 2.4),
          context.sampleRate,
        );
        const samples = this.noise.getChannelData(0);
        let seed = 4817;
        for (let i = 0; i < samples.length; i++) {
          seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
          samples[i] = (((seed >>> 0) / 0xffffffff) * 2 - 1) * 0.65;
        }
      }
      if (this.context.state !== "running") await this.context.resume();
      return this.context.state === "running";
    } catch {
      return false;
    }
  }
  setMuted(muted: boolean) {
    this.muted = muted;
    if (muted) this.stop();
  }
  update(snapshot: ZombiesSnapshot, running: boolean) {
    const context = this.context;
    if (
      !running ||
      !snapshot.active ||
      snapshot.caught ||
      this.muted ||
      !context ||
      context.state !== "running"
    ) {
      if (this.playing) this.stop();
      return;
    }
    const level = zombieSoundLevel(
      snapshot.nearestGapMeters,
      snapshot.zombies.length,
    );
    if (!this.master || !level) {
      if (this.playing) this.stop();
      return;
    }
    this.playing = true;
    this.master.gain.setTargetAtTime(level * 0.2, context.currentTime, 0.12);
    const feeding = snapshot.eatenRiderIds.length > this.lastEatenCount;
    this.lastEatenCount = snapshot.eatenRiderIds.length;
    if (feeding || context.currentTime >= this.nextGroanAt) {
      this.groan(feeding);
      this.nextGroanAt = context.currentTime + 2.2 + (1 - level) * 2.5;
    }
  }
  private groan(feeding: boolean) {
    const context = this.context,
      master = this.master;
    if (!context || !master || !this.noise || this.voices.size >= 2) return;
    const now = context.currentTime;
    const duration = feeding ? 1.15 : 2.1;
    const voice = context.createGain();
    voice.gain.setValueAtTime(0, now);
    voice.gain.linearRampToValueAtTime(0.65, now + 0.18);
    voice.gain.exponentialRampToValueAtTime(0.001, now + duration);
    voice.connect(master);
    const throat = context.createBiquadFilter();
    throat.type = "bandpass";
    throat.frequency.setValueAtTime(
      feeding ? 470 : 310 + (this.voiceIndex % 3) * 80,
      now,
    );
    throat.frequency.linearRampToValueAtTime(
      feeding ? 180 : 230,
      now + duration,
    );
    throat.Q.value = 2.5;
    throat.connect(voice);
    const rasp = context.createBufferSource();
    rasp.buffer = this.noise;
    const raspGain = context.createGain();
    raspGain.gain.value = 1.8;
    rasp.connect(raspGain).connect(throat);
    const growl = context.createOscillator();
    growl.type = "sawtooth";
    growl.frequency.setValueAtTime(
      (feeding ? 85 : 64) - (this.voiceIndex++ % 4) * 5,
      now,
    );
    growl.frequency.linearRampToValueAtTime(feeding ? 42 : 36, now + duration);
    const growlGain = context.createGain();
    growlGain.gain.value = 1.6;
    growl.connect(growlGain).connect(throat);
    let ended = false;
    const cleanup = () => {
      if (ended) return;
      ended = true;
      for (const node of [voice, throat, rasp, raspGain, growl, growlGain])
        node.disconnect();
      this.voices.delete(handle);
    };
    const handle: Voice = {
      stop: () => {
        for (const source of [rasp, growl]) {
          try {
            source.stop();
          } catch {
            /* Already ended. */
          }
        }
        cleanup();
      },
    };
    this.voices.add(handle);
    rasp.onended = cleanup;
    rasp.start(now);
    growl.start(now);
    rasp.stop(now + duration);
    growl.stop(now + duration);
  }
  stop() {
    this.playing = false;
    this.nextGroanAt = 0;
    for (const voice of [...this.voices]) voice.stop();
    if (this.context && this.master && this.context.state !== "closed") {
      // Clear preceding exponential targets too, including when the graph is idle.
      this.master.gain.cancelScheduledValues(0);
      this.master.gain.value = 0;
    }
  }
  async dispose() {
    this.stop();
    const context = this.context;
    this.context = undefined;
    this.master = undefined;
    this.noise = undefined;
    this.lastEatenCount = 0;
    if (context && context.state !== "closed")
      await context.close().catch(() => {});
  }
}
