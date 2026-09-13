export type GamepadAction =
  "increase" | "decrease" | "sprint" | "camera" | "hud" | "pause";

const buttons: Partial<Record<GamepadAction, number>> = {
  sprint: 0,
  camera: 2,
  hud: 3,
  pause: 9,
};

/** Reads standard-layout controllers, independent of their USB/Bluetooth transport. */
export class GamepadInput {
  private identity = "";
  private armed = false;
  private held = new Set<GamepadAction>();
  private repeatAt = 0;
  private direction: GamepadAction | undefined;

  reset() {
    this.identity = "";
    this.armed = false;
    this.held.clear();
    this.direction = undefined;
    this.repeatAt = 0;
  }

  read(
    pad:
      | Pick<
          Gamepad,
          "id" | "index" | "connected" | "mapping" | "axes" | "buttons"
        >
      | undefined,
    now: number,
  ): GamepadAction[] {
    if (!pad?.connected || pad.mapping !== "standard") {
      this.reset();
      return [];
    }
    const identity = `${pad.index}:${pad.id}`;
    if (identity !== this.identity) {
      this.reset();
      this.identity = identity;
    }
    const pressed = (index: number) => !!pad.buttons[index]?.pressed;
    const current = new Set<GamepadAction>();
    for (const [action, index] of Object.entries(buttons)) {
      if (pressed(index)) current.add(action as GamepadAction);
    }
    const axis = pad.axes[1] ?? 0;
    const up = pressed(12) || axis < -0.5;
    const down = pressed(13) || axis > 0.5;
    if (up !== down) current.add(up ? "increase" : "decrease");

    // Require neutral controls after connection, focus changes, or a new ride.
    if (!this.armed) {
      this.armed =
        !pad.buttons.some((button) => button.pressed) && Math.abs(axis) < 0.25;
      return [];
    }
    const actions = [...current].filter((action) => !this.held.has(action));
    const direction = current.has("increase")
      ? "increase"
      : current.has("decrease")
        ? "decrease"
        : undefined;
    if (direction !== this.direction) this.repeatAt = now + 400;
    else if (direction && now >= this.repeatAt) {
      actions.push(direction);
      this.repeatAt = now + 150;
    }
    this.direction = direction;
    this.held = current;
    return actions;
  }
}
