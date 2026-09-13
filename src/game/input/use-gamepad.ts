"use client";
import { useEffect, useEffectEvent, useState } from "react";
import { GamepadInput, type GamepadAction } from "./gamepad";

export interface GamepadConnection {
  state: "checking" | "waiting" | "connected" | "unsupported" | "blocked";
  name: string;
  message: string;
  inputActive: boolean;
}

export function useGamepad(
  onAction: (action: GamepadAction) => void,
  onDisconnect: () => void,
  context: string,
) {
  const [connection, setConnection] = useState<GamepadConnection>({
    state: "checking",
    name: "",
    message: "Checking gamepad support…",
    inputActive: false,
  });
  const [attempt, setAttempt] = useState(0);
  const action = useEffectEvent(onAction);
  const disconnect = useEffectEvent(onDisconnect);

  useEffect(() => {
    const input = new GamepadInput();
    let frame = 0;
    let active: { index: number; id: string } | undefined;
    const reset = () => input.reset();
    const publish = (next: GamepadConnection) =>
      setConnection((current) =>
        current.state === next.state &&
        current.name === next.name &&
        current.message === next.message &&
        current.inputActive === next.inputActive
          ? current
          : next,
      );
    const poll = (now: number) => {
      if (typeof navigator.getGamepads !== "function") {
        publish({
          state: "unsupported",
          name: "",
          inputActive: false,
          message:
            "Gamepad unavailable in this browser. Use keyboard or touch controls.",
        });
        return;
      }
      let pads: (Gamepad | null)[];
      try {
        pads = Array.from(navigator.getGamepads());
      } catch {
        if (active) {
          active = undefined;
          input.reset();
          disconnect();
        }
        publish({
          state: "blocked",
          name: "",
          inputActive: false,
          message:
            "Gamepad access blocked. Open the app directly over HTTPS or localhost.",
        });
        return;
      }
      const previous = pads.find(
        (pad) =>
          pad?.connected &&
          pad.mapping === "standard" &&
          pad.index === active?.index &&
          pad.id === active?.id,
      );
      if (active && !previous) {
        input.reset();
        disconnect();
      }
      const pad =
        previous ??
        pads.find((pad) => pad?.connected && pad.mapping === "standard") ??
        undefined;
      active = pad ? { index: pad.index, id: pad.id } : undefined;
      const unrecognized = pads.find((candidate) => candidate?.connected);
      publish(
        pad
          ? {
              state: "connected",
              name: pad.id,
              message:
                "Ready to ride. Press a button or move the left stick to test your controller.",
              inputActive:
                pad.buttons.some((button) => button.pressed) ||
                pad.axes.some((axis) => Math.abs(axis) > 0.5),
            }
          : unrecognized
            ? {
                state: "unsupported",
                name: unrecognized.id,
                inputActive: false,
                message:
                  "Controller layout unsupported. Try the controller’s standard / XInput mode, or use keyboard and touch controls.",
              }
            : {
                state: "waiting",
                name: "",
                inputActive: false,
                message:
                  "No gamepad detected. Already paired? Keep this page active, press a gamepad button, then release it.",
              },
      );
      const target = document.activeElement;
      const editing =
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName));
      if (document.hidden || !document.hasFocus() || editing) input.reset();
      else for (const next of input.read(pad, now)) action(next);
      frame = requestAnimationFrame(poll);
    };
    frame = requestAnimationFrame(poll);
    const rescan = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(poll);
    };
    window.addEventListener("blur", reset);
    window.addEventListener("focus", rescan);
    window.addEventListener("gamepadconnected", rescan);
    window.addEventListener("gamepaddisconnected", rescan);
    document.addEventListener("visibilitychange", reset);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("blur", reset);
      window.removeEventListener("focus", rescan);
      window.removeEventListener("gamepadconnected", rescan);
      window.removeEventListener("gamepaddisconnected", rescan);
      document.removeEventListener("visibilitychange", reset);
    };
  }, [context, attempt]);
  return { ...connection, retry: () => setAttempt((value) => value + 1) };
}
