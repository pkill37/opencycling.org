import { test } from "node:test";
import assert from "node:assert/strict";
import { prepareTerrain } from "../src/game/world/prepare-terrain";
import { route } from "./fixtures/loop-route";

test("terrain preparation terminates workers on completion, cancellation and errors", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "Worker");
  const workers: StubWorker[] = [];
  class StubWorker {
    terminated = false;
    onmessage?: (event: { data: { tiles: [] } }) => void;
    onerror?: (event: { preventDefault: () => void }) => void;
    constructor() {
      workers.push(this);
    }
    postMessage() {}
    terminate() {
      this.terminated = true;
    }
  }
  Object.defineProperty(globalThis, "Worker", {
    configurable: true,
    value: StubWorker,
  });
  try {
    const controller = new AbortController();
    const pending = prepareTerrain(route, undefined, controller.signal);
    controller.abort();
    assert.equal(await pending, undefined);
    assert.equal(workers[0].terminated, true);
    const completed = prepareTerrain(
      route,
      undefined,
      new AbortController().signal,
    );
    workers[1].onmessage?.({ data: { tiles: [] } });
    assert.deepEqual(await completed, []);
    assert.equal(workers[1].terminated, true);
    const failed = prepareTerrain(
      route,
      undefined,
      new AbortController().signal,
    );
    let prevented = false;
    workers[2].onerror?.({
      preventDefault: () => {
        prevented = true;
      },
    });
    assert.equal(await failed, undefined);
    assert.equal(workers[2].terminated, true);
    assert.equal(prevented, true);
    await prepareTerrain(route, undefined, controller.signal);
    assert.equal(workers.length, 3);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "Worker", descriptor);
    else Reflect.deleteProperty(globalThis, "Worker");
  }
});
