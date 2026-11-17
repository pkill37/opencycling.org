import { test } from "node:test";
import assert from "node:assert/strict";
import { ZombieAudio, zombieSoundLevel } from "../src/game/audio/zombie-audio";
import { ZombiesMode } from "../src/game/modes/zombies";

class Param {
  value = 0;
  setValueAtTime(value: number) {
    this.value = value;
  }
  setTargetAtTime(value: number) {
    this.value = value;
  }
  linearRampToValueAtTime(value: number) {
    this.value = value;
  }
  exponentialRampToValueAtTime(value: number) {
    this.value = value;
  }
  cancelScheduledValues() {}
}
class Node {
  gain = new Param();
  frequency = new Param();
  Q = new Param();
  buffer?: { getChannelData(): Float32Array };
  type = "";
  onended?: () => void;
  starts = 0;
  stops = 0;
  connect(node: Node) {
    return node;
  }
  disconnect() {}
  start() {
    this.starts++;
  }
  stop() {
    this.stops++;
  }
}
class Context {
  state = "suspended";
  sampleRate = 8000;
  currentTime = 0;
  destination = new Node();
  sources: Node[] = [];
  gains: Node[] = [];
  async resume() {
    this.state = "running";
  }
  async close() {
    this.state = "closed";
  }
  createGain() {
    const node = new Node();
    this.gains.push(node);
    return node;
  }
  createBiquadFilter() {
    return new Node();
  }
  createBufferSource() {
    const node = new Node();
    this.sources.push(node);
    return node;
  }
  createOscillator() {
    const node = new Node();
    this.sources.push(node);
    return node;
  }
  createBuffer(_channels: number, length: number) {
    const samples = new Float32Array(length);
    return { getChannelData: () => samples };
  }
}
const snapshot = () => new ZombiesMode().snapshot;

test("growls get louder with proximity and disappear beyond hearing range", () => {
  assert.ok(zombieSoundLevel(10, 1) > zombieSoundLevel(80, 1));
  assert.ok(zombieSoundLevel(80, 4) > zombieSoundLevel(80, 1));
  for (const gap of [-100, 0, 20, 80, 220])
    assert.ok(zombieSoundLevel(gap, 4) >= 0 && zombieSoundLevel(gap, 4) <= 1);
  assert.equal(zombieSoundLevel(220, 4), 0);
  assert.equal(zombieSoundLevel(Infinity, 1), 0);
  assert.equal(zombieSoundLevel(10, 0), 0);
});

test("audio stays lazy and silent until unlocked and the race starts", async () => {
  const context = new Context();
  let creations = 0;
  const audio = new ZombieAudio(() => {
    creations++;
    return context as unknown as AudioContext;
  });
  audio.update(snapshot(), true);
  assert.equal(creations, 0);
  assert.equal(await audio.unlock(), true);
  audio.update(snapshot(), false);
  assert.equal(context.sources.length, 0);
  audio.update(snapshot(), true);
  assert.ok(context.sources.every((source) => source.starts === 1));
  assert.ok(context.sources.length > 0);
  assert.ok(context.gains[0].gain.value > 0);
  const noise = context.sources[0].buffer!.getChannelData();
  assert.ok(noise.some((sample) => Math.abs(sample) > 0.1));
  const count = context.sources.length;
  audio.update(snapshot(), true);
  assert.equal(context.sources.length, count);
  await audio.dispose();
});

test("mute, pause, catch and disposal silence active voices without timers", async () => {
  const context = new Context();
  const audio = new ZombieAudio(() => context as unknown as AudioContext);
  await audio.unlock();
  audio.update(snapshot(), true);
  audio.setMuted(true);
  assert.equal(context.gains[0].gain.value, 0);
  const count = context.sources.length;
  audio.update(snapshot(), true);
  assert.equal(context.sources.length, count);
  audio.setMuted(false);
  audio.update(snapshot(), true);
  assert.ok(context.sources.length > count);
  audio.update(snapshot(), false);
  assert.equal(context.gains[0].gain.value, 0);
  audio.update(snapshot(), true);
  audio.update({ ...snapshot(), caught: true }, true);
  assert.equal(context.gains[0].gain.value, 0);
  await audio.dispose();
  assert.equal(context.state, "closed");
  assert.ok(context.sources.every((source) => source.stops >= 2));
});

test("feeding triggers a new growl and unavailable audio never prevents riding", async () => {
  const context = new Context();
  const audio = new ZombieAudio(() => context as unknown as AudioContext);
  await audio.unlock();
  audio.update(snapshot(), true);
  const count = context.sources.length;
  audio.update({ ...snapshot(), eatenRiderIds: ["ari"] }, true);
  assert.ok(context.sources.length > count);
  await audio.dispose();
  const unavailable = new ZombieAudio(() => {
    throw new Error("Audio unavailable");
  });
  assert.equal(await unavailable.unlock(), false);
  unavailable.update(snapshot(), true);
  await unavailable.dispose();
});
