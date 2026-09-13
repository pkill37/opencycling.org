"use client";
import { useState } from "react";
import type { GamepadConnection as Connection } from "@/game/input/use-gamepad";
import styles from "./GamepadConnection.module.css";

function ConnectionIcon({ kind }: { kind: "bluetooth" | "usb" | "gamepad" }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === "bluetooth" ? (
        <path d="m7 7 10 10-5 5V2l5 5L7 17" />
      ) : kind === "usb" ? (
        <>
          <path d="M12 20V3m-3 3 3-3 3 3M12 15l-5-4V8m5 10 5-5V9" />
          <circle cx="12" cy="21" r="1" />
          <circle cx="7" cy="7" r="1" />
          <path d="M16 6h2v2h-2z" />
        </>
      ) : (
        <>
          <path d="M8 6h8c3 0 4 3 5 10 1 5-3 4-6 0H9c-3 4-7 5-6 0C4 9 5 6 8 6Z" />
          <path d="M6 11h4m-2-2v4m7-2h.01m3 2h.01" />
        </>
      )}
    </svg>
  );
}

export default function GamepadConnection({
  connection,
}: {
  connection: Connection & { retry: () => void };
}) {
  const [method, setMethod] = useState<"bluetooth" | "usb">("bluetooth");
  const connected = connection.state === "connected";
  const labels = {
    checking: "Checking",
    waiting: "Waiting for controller",
    connected: "Connected",
    unsupported: "Unsupported",
    blocked: "Access blocked",
  };
  return (
    <section
      className={styles.card}
      aria-label="Gamepad connection"
      data-connected={connected}
    >
      <div className={styles.heading}>
        <span className={styles.icon}>
          <ConnectionIcon kind="gamepad" />
        </span>
        <div>
          <h3>Gamepad controller</h3>
          <span className={styles.transports}>USB / Bluetooth</span>
        </div>
        <span className={styles.badge} aria-live="polite">
          <span aria-hidden="true">●</span> {labels[connection.state]}
        </span>
      </div>
      {connection.name && <p className={styles.device}>{connection.name}</p>}
      <p className={styles.message} aria-live="polite">
        {connection.message}
      </p>
      {connected && (
        <div className={styles.activity} data-active={connection.inputActive}>
          <span aria-hidden="true">●</span>{" "}
          {connection.inputActive ? "Input received" : "Waiting for input"}
        </div>
      )}
      {!connected && (
        <>
          <div
            className={styles.methods}
            role="group"
            aria-label="Connection setup method"
          >
            <button
              type="button"
              aria-pressed={method === "bluetooth"}
              onClick={() => setMethod("bluetooth")}
            >
              <ConnectionIcon kind="bluetooth" /> Bluetooth
            </button>
            <button
              type="button"
              aria-pressed={method === "usb"}
              onClick={() => setMethod("usb")}
            >
              <ConnectionIcon kind="usb" /> USB
            </button>
          </div>
          <p className={styles.instructions}>
            {method === "bluetooth"
              ? "Pair your controller in your device’s Bluetooth settings. If it’s already connected there, press any controller button here to wake it up."
              : "Plug your controller into a USB port with a data cable, then press any controller button. Try another cable or port if it doesn’t appear."}
          </p>
          <button
            type="button"
            className={styles.check}
            onClick={connection.retry}
          >
            Check connection
          </button>
          <p className={styles.note}>
            Detection is automatic for both USB and Bluetooth. Pair Bluetooth
            controllers in system settings; the smart trainer chooser is for
            cycling sensors.
          </p>
        </>
      )}
      <details className={styles.controls}>
        <summary>Controller controls & help</summary>
        <dl>
          <div>
            <dt>D-pad / left stick ↑↓</dt>
            <dd>Power ±25 W</dd>
          </div>
          <div>
            <dt>A / Cross</dt>
            <dd>Sprint</dd>
          </div>
          <div>
            <dt>X / Square</dt>
            <dd>Camera</dd>
          </div>
          <div>
            <dt>Y / Triangle</dt>
            <dd>Show / hide HUD</dd>
          </div>
          <div>
            <dt>Menu / Options</dt>
            <dd>Start / pause / resume</dd>
          </div>
        </dl>
        <p>
          Power and sprint control the simulator. Release controls after
          connecting or returning to this tab. Disconnecting pauses the ride.
        </p>
        <p>
          USB and Bluetooth use the same controls. Your browser doesn’t report
          which connection type is active.
        </p>
      </details>
    </section>
  );
}
