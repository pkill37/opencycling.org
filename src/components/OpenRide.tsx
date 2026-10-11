"use client";
import Link from "next/link";
import Image from "next/image";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { route } from "@/game/route/route";
import { RideEngine } from "@/game/loop/engine";
import { SimulatorSource } from "@/bluetooth/sources/simulator-source";
import { BluetoothTrainerSource } from "@/bluetooth/sources/bluetooth-trainer-source";
import { bluetoothAvailability } from "@/bluetooth/availability";
import type { RideSummary, RiderState } from "@/types";
import styles from "./OpenRide.module.css";
const time = (seconds: number) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
const subscribeToHydration = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;
const profilePoints = route.points.filter((_, i) => i % 16 === 0);
const profilePath = profilePoints
  .map((p, i) => `${i ? "L" : "M"}${i * 4},${(60 - (p.y - 1) * 2).toFixed(3)}`)
  .join(" ");
const presets = [100, 150, 200, 250, 300, 400, 500, 600, 800];
export default function OpenRide({
  initialSetup = false,
}: {
  initialSetup?: boolean;
}) {
  const [activeEngine, setEngine] = useState(() => new RideEngine()),
    [sim] = useState(() => new SimulatorSource()),
    [trainer] = useState(() => new BluetoothTrainerSource());
  const [phase, setPhase] = useState<"home" | "ride" | "summary">("home"),
    [setup, setSetup] = useState(initialSetup),
    [source, setSource] = useState<"simulator" | "bluetooth">("simulator");
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    getClientSnapshot,
    getServerSnapshot,
  );
  const availability = hydrated
    ? bluetoothAvailability()
    : {
        available: false,
        message: "Checking Bluetooth support…",
        details: ["Waiting for browser feature detection."],
      };
  const [, refresh] = useState(0);
  const [worldLoading, setWorldLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<RiderState>({
      ...activeEngine.state,
    }),
    [summary, setSummary] = useState<RideSummary>(),
    [paused, setPaused] = useState(false),
    [hud, setHud] = useState(true),
    [debug, setDebug] = useState(false),
    [camera, setCamera] = useState("Chase"),
    [fps, setFps] = useState(60),
    [worldError, setWorldError] = useState(""),
    [warning, setWarning] = useState(""),
    [debugScan, setDebugScan] = useState(false),
    [cps, setCps] = useState(false);
  const host = useRef<HTMLDivElement>(null),
    world = useRef<Awaited<
      ReturnType<typeof import("@/game/world/scene").createWorld>
    > | null>(null);
  useEffect(() => {
    const unsubscribe = trainer.subscribeChanges(() => refresh((x) => x + 1));
    return () => {
      unsubscribe();
      void trainer.disconnect();
    };
  }, [trainer]);
  useEffect(() => () => activeEngine.dispose(), [activeEngine]);
  useEffect(() => {
    if (phase !== "ride" || source !== "simulator") return;
    const unsubscribe = sim.subscribe(() => refresh((x) => x + 1));
    void sim.connect();
    return () => {
      unsubscribe();
      void sim.disconnect();
    };
  }, [phase, source, sim]);
  const chooseSimulator = () => {
    void trainer.disconnect();
    setSource("simulator");
    if (phase === "ride") {
      activeEngine.attach(sim);
      activeEngine.ingest(sim.sample());
    }
    setSetup(true);
  };
  const connect = (reconnect = false) => {
    setSource("bluetooth");
    setSetup(true);
    void trainer.connect(debugScan, cps, reconnect);
  };
  const start = () => {
    activeEngine.dispose();
    const next = new RideEngine();
    next.attach(source === "simulator" ? sim : trainer);
    if (source === "simulator") next.ingest(sim.sample());
    setEngine(next);
    setWorldLoading(true);
    setSnapshot({ ...next.state });
    setPaused(false);
    setCamera("Chase");
    setHud(true);
    setWarning("");
    setWorldError("");
    setPhase("ride");
  };
  const finish = useCallback(() => {
    activeEngine.setPaused(true);
    setSummary(activeEngine.summary());
    setPhase("summary");
  }, [activeEngine]);
  const togglePause = useCallback(() => {
    activeEngine.setPaused(!activeEngine.paused);
    setPaused(activeEngine.paused);
  }, [activeEngine]);
  const toggleCamera = useCallback(() => {
    world.current?.toggleCamera();
    setCamera(world.current?.cameraName() ?? "Chase");
  }, []);
  useEffect(() => {
    const e = activeEngine;
    let frame = 0,
      stopped = false,
      last = performance.now(),
      published = 0;
    let view: typeof world.current = null;
    if (!host.current || phase !== "ride") return;
    const element = host.current;
    import("@/game/world/scene")
      .then(async ({ createWorld, preloadWorldTextures }) => {
        await preloadWorldTextures();
        if (stopped) return;
        try {
          view = createWorld(element, e);
          world.current = view;
          setWorldLoading(false);
          last = performance.now();
        } catch (error) {
          setWorldLoading(false);
          setWorldError(
            `The 3D world could not start: ${error instanceof Error ? error.message : "WebGL unavailable"}. Enable hardware acceleration and reload.`,
          );
          e.setPaused(true);
          setPaused(true);
          return;
        }
        const tick = (now: number) => {
          if (stopped) return;
          const dt = Math.min((now - last) / 1000, 0.25);
          last = now;
          if (!document.hidden) e.advance(dt);
          if (!document.hidden) view?.render(dt);
          if (now - published > 100) {
            setSnapshot({ ...e.state });
            setPaused(e.paused);
            setWarning(e.warning);
            setFps(Math.round(1 / Math.max(dt, 0.001)));
            published = now;
            if (phase === "ride" && e.completed) {
              setSummary(e.summary());
              setPhase("summary");
              return;
            }
          }
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      })
      .catch((error: unknown) => {
        if (stopped) return;
        setWorldLoading(false);
        setWorldError(
          `The 3D world could not load: ${error instanceof Error ? error.message : "Download failed"}. Reload to try again.`,
        );
        e.setPaused(true);
        setPaused(true);
      });
    const visibility = () => {
      last = performance.now();
      if (document.hidden && phase === "ride") {
        e.setPaused(true);
        setPaused(true);
      }
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", visibility);
      view?.dispose();
      world.current = null;
    };
  }, [phase, activeEngine]);
  useEffect(() => {
    if (phase !== "ride") return;
    const key = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLSelectElement ||
        event.target instanceof HTMLTextAreaElement ||
        (event.target instanceof HTMLElement &&
          event.target.isContentEditable) ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        (event.target instanceof HTMLButtonElement &&
          (event.key === " " || event.key === "Enter"))
      )
        return;
      const k = event.key.toLowerCase();
      if (
        [
          "arrowup",
          "arrowdown",
          " ",
          "w",
          "s",
          "p",
          "c",
          "h",
          "escape",
          "f3",
          ...presets.map((_, i) => String(i + 1)),
        ].includes(k)
      )
        event.preventDefault();
      if (k === "p") togglePause();
      if (k === "c") toggleCamera();
      if (k === "h") setHud((x) => !x);
      if (k === "f3") setDebug((x) => !x);
      if (k === "escape") finish();
      if (source === "simulator") {
        if (k === "arrowup" || k === "w") sim.increasePower();
        if (k === "arrowdown" || k === "s") sim.decreasePower();
        if (k === " " && !event.repeat) sim.sprint();
        if (/^[1-9]$/.test(k)) sim.setPower(presets[Number(k) - 1]);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [phase, source, sim, togglePause, toggleCamera, finish]);
  const sample = trainer.last,
    canStart = source === "simulator" || trainer.state === "connected";
  const metric = (label: string, value: string, unit: string) => (
    <div className={styles.metric}>
      <span>{label}</span>
      <strong>
        {value}
        <small>{unit}</small>
      </strong>
    </div>
  );
  const profile = (
    <svg
      viewBox="0 0 400 65"
      role="img"
      aria-label="Cedar Valley elevation profile"
    >
      <path
        d={`M0,65 ${profilePath.replace(/^M/, "L")} L400,65 Z`}
        fill="currentColor"
        opacity=".25"
      />
      <path d={profilePath} fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
  return (
    <main className={styles.app}>
      {phase === "home" && (
        <Image
          src="/cedar-valley.webp"
          alt=""
          fill
          preload
          sizes="100vw"
          className={styles.poster}
        />
      )}
      {phase === "ride" && (
        <div
          ref={host}
          className={styles.world}
          aria-label="Cedar Valley 3D cycling world"
        />
      )}
      {phase === "home" && (
        <>
          <div className={styles.shade} />
          <header className={styles.header}>
            <Link href="/" prefetch={false} className={styles.logo}>
              <span>◒</span> openride
              <span className={styles.alpha}>MVP / 01</span>
            </Link>
            <span className={styles.local}>● NO ACCOUNTS. JUST A RIDE.</span>
          </header>
          <section className={styles.home}>
            <div className={styles.intro}>
              <div className={styles.eyebrow}>YOUR ROAD. YOUR RHYTHM.</div>
              <h1>
                A little power.
                <br />A world to ride.
              </h1>
              <p>
                Clip in. Find your pace. Take the scenic way home.
                <br />
                An open source cycling world, right in your browser.
              </p>
              <div className={styles.routeName}>
                <span className={styles.routeIcon}>↗</span>
                <div>
                  <small>EXPLORE THE FIRST ROUTE</small>
                  <h2>{route.name}</h2>
                </div>
              </div>
              <div className={styles.routeStats}>
                {metric(
                  "DISTANCE",
                  (route.distanceMeters / 1000).toFixed(2),
                  "km",
                )}
                {metric(
                  "ELEVATION GAIN",
                  route.elevationGainMeters.toFixed(0),
                  "m",
                )}
                {metric("TERRAIN", "Rolling", "")}
              </div>
              <div className={styles.profile}>
                {profile}
                <span>ONE LOOP · A QUIET ROAD THROUGH THE PINES</span>
              </div>
            </div>
            <div className={styles.setup}>
              <noscript>
                <p>
                  Enable JavaScript to connect a trainer or start a simulated
                  ride.
                </p>
              </noscript>
              <div className={styles.cardHeading}>
                <span className={styles.eyebrow}>LET’S GET MOVING</span>
                <span>01 / SETUP</span>
              </div>
              <h2>Choose your ride input</h2>
              <p>
                Real watts or a virtual warm-up.
                <br />
                The same open road awaits.
              </p>
              <button
                className={`${styles.sourceButton} ${source === "bluetooth" ? styles.selected : ""}`}
                onClick={() => connect()}
                disabled={
                  !availability.available ||
                  [
                    "connecting",
                    "requesting-device",
                    "discovering-services",
                    "subscribing",
                  ].includes(trainer.state)
                }
              >
                <span>⌁</span>
                <div>
                  <strong>Connect smart trainer</strong>
                  <small>Bluetooth · FTMS / Cycling Power</small>
                </div>
                <span>↗</span>
              </button>
              <button
                className={`${styles.sourceButton} ${source === "simulator" ? styles.selected : ""}`}
                onClick={chooseSimulator}
              >
                <span>⌨</span>
                <div>
                  <strong>Use simulator</strong>
                  <small>Keyboard or touch controls</small>
                </div>
                <span>{source === "simulator" ? "✓" : "↗"}</span>
              </button>
              <p className={styles.support}>{availability.message}</p>
              {!availability.available && (
                <div className={styles.connection} aria-live="polite">
                  <strong>Bluetooth diagnostics</strong>
                  {availability.details.map((detail) => (
                    <small key={detail}>{detail}</small>
                  ))}
                </div>
              )}
              {setup && source === "bluetooth" && (
                <div className={styles.connection} aria-live="polite">
                  <strong>
                    {trainer.label} · {trainer.state.replaceAll("-", " ")}
                  </strong>
                  <span>
                    {trainer.services.join(" + ") || "No services detected yet"}
                  </span>
                  <div>
                    {sample?.powerWatts ?? "—"} W · {sample?.cadenceRpm ?? "—"}{" "}
                    rpm ·{" "}
                    {sample?.speedMetersPerSecond === undefined
                      ? "—"
                      : (sample.speedMetersPerSecond * 3.6).toFixed(1)}{" "}
                    km/h raw
                  </div>
                  <span>
                    Last packet:{" "}
                    {sample
                      ? new Date(sample.timestampMs).toLocaleTimeString()
                      : "Waiting"}
                  </span>
                  {trainer.features.map((f) => (
                    <small key={f}>{f}</small>
                  ))}
                  {trainer.error && <p role="alert">{trainer.error}</p>}
                  {trainer.diagnostics.length > 0 && (
                    <details className={styles.diagnostics} open>
                      <summary>Bluetooth debug log</summary>
                      <ol>
                        {trainer.diagnostics.map((entry, index) => (
                          <li key={`${entry}-${index}`}>{entry}</li>
                        ))}
                      </ol>
                    </details>
                  )}
                  <button className="button" onClick={() => connect(true)}>
                    Reconnect
                  </button>
                </div>
              )}
              <details className={styles.advanced}>
                <summary>Connection options & controls</summary>
                <label>
                  <input
                    type="checkbox"
                    checked={cps}
                    onChange={(e) => setCps(e.target.checked)}
                  />{" "}
                  Prefer Cycling Power mode
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={debugScan}
                    onChange={(e) => setDebugScan(e.target.checked)}
                  />{" "}
                  Debug: show all Bluetooth devices
                </label>
                <p>
                  ↑ / W increase · ↓ / S decrease · 1–9 power presets · Space
                  sprint · C camera · H HUD · P pause · Esc finish · F3
                  diagnostics
                </p>
              </details>
              <button
                className={`button ${styles.start}`}
                disabled={!canStart || !!worldError}
                onClick={start}
              >
                Start ride <span>→</span>
              </button>
              <div className={styles.privacy}>
                LOCAL BY DESIGN · YOUR RIDE STAYS WITH YOU
              </div>
            </div>
          </section>
          <footer className={styles.footer}>
            <span>BUILT FOR THE SIMPLE JOY OF RIDING.</span>
            <span>
              CEDAR VALLEY / {route.distanceMeters.toFixed(0)} M OF POSSIBILITY
            </span>
          </footer>
        </>
      )}
      {phase === "ride" && (
        <>
          {hud && (
            <div className={styles.rideHud}>
              <div className={styles.topbar}>
                <span className={styles.logo}>◒ openride</span>
                <span>{route.name}</span>
                <span className={styles.live}>
                  {source === "simulator"
                    ? "● SIMULATOR"
                    : `● ${trainer.label}`}
                </span>
              </div>
              <div className={styles.telemetry}>
                <div className={styles.power}>
                  <span>POWER</span>
                  <strong>
                    {Math.round(snapshot.powerWatts)}
                    <small>W</small>
                  </strong>
                  <span>
                    {source === "simulator"
                      ? "VIRTUAL TRAINER"
                      : "LIVE TRAINER"}
                  </span>
                </div>
                <div className={styles.primaryMetrics}>
                  {metric(
                    "SPEED",
                    (snapshot.speedMetersPerSecond * 3.6).toFixed(1),
                    "km/h",
                  )}
                  {metric(
                    "CADENCE",
                    Math.round(snapshot.cadenceRpm).toString(),
                    "rpm",
                  )}
                  {metric(
                    "GRADIENT",
                    `${snapshot.gradient >= 0 ? "+" : ""}${(snapshot.gradient * 100).toFixed(1)}`,
                    "%",
                  )}
                </div>
              </div>
              <div className={styles.routeHud}>
                <div>
                  {metric(
                    "DISTANCE",
                    (snapshot.distanceMeters / 1000).toFixed(2),
                    "km",
                  )}
                  {metric("TIME", time(snapshot.elapsedSeconds), "")}
                  {metric(
                    "ELEVATION",
                    snapshot.elevationMeters.toFixed(0),
                    "m",
                  )}
                </div>
                <progress
                  aria-label="Route progress"
                  value={snapshot.distanceMeters}
                  max={route.distanceMeters}
                />
                <small>
                  {Math.round(
                    (snapshot.distanceMeters / route.distanceMeters) * 100,
                  )}
                  % COMPLETE{" "}
                  <span>
                    {(
                      (route.distanceMeters - snapshot.distanceMeters) /
                      1000
                    ).toFixed(2)}{" "}
                    km to go
                  </span>
                </small>
              </div>
            </div>
          )}
          {warning && (
            <div className={styles.warning} role="alert">
              {warning}
              <button className="button" onClick={() => connect(true)}>
                Reconnect
              </button>
              <button className="button" onClick={chooseSimulator}>
                Use simulator
              </button>
              {trainer.error && <small>{trainer.error}</small>}
            </div>
          )}
          {paused && (
            <div className={styles.pauseCard}>
              <span className={styles.eyebrow}>TAKE A BREATHER</span>
              <h2>Ride paused</h2>
              <button
                className={`button ${styles.start}`}
                onClick={togglePause}
              >
                Resume ride →
              </button>
            </div>
          )}
          <div className={styles.controls}>
            {source === "simulator" && (
              <div className={styles.controlGroup}>
                <button
                  aria-label="Decrease power"
                  onClick={() => sim.decreasePower()}
                >
                  −
                </button>
                <span>{sim.power} W</span>
                <button
                  aria-label="Increase power"
                  onClick={() => sim.increasePower()}
                >
                  +
                </button>
                <button onClick={() => sim.sprint()}>Sprint</button>
              </div>
            )}
            <div className={styles.controlGroup}>
              <button onClick={toggleCamera} aria-label="Change camera">
                ◉ <span>{camera}</span>
              </button>
              <button onClick={togglePause}>
                {paused ? "Resume" : "Pause"}
              </button>
              <button onClick={() => setHud((x) => !x)}>
                {hud ? "Hide HUD" : "Show HUD"}
              </button>
              <button onClick={finish}>Finish</button>
            </div>
          </div>
          {debug && (
            <pre className={styles.debug}>
              {fps} FPS / {(1000 / fps).toFixed(1)} ms{"\n"}
              {snapshot.speedMetersPerSecond.toFixed(2)} m/s ·{" "}
              {snapshot.distanceMeters.toFixed(1)} m{"\n"}
              {snapshot.powerWatts.toFixed(0)} W ·{" "}
              {(snapshot.gradient * 100).toFixed(2)}%{"\n"}
              {camera} · {source} · {trainer.state}
            </pre>
          )}
        </>
      )}
      {worldLoading && phase === "ride" && (
        <div className={styles.pauseCard} role="status">
          Loading Cedar Valley…
        </div>
      )}
      {worldError && (
        <div className={styles.warning} role="alert">
          {worldError}
        </div>
      )}
      {phase === "summary" && summary && (
        <section className={styles.summary}>
          <Link
            className={styles.logo}
            href="/"
            prefetch={false}
            onClick={() => setPhase("home")}
          >
            ◒ openride
          </Link>
          <div className={styles.eyebrow}>
            {activeEngine.completed
              ? "ONE LOOP. WELL RIDDEN."
              : "EVERY TURN COUNTS."}
          </div>
          <h1>{activeEngine.completed ? "You made it." : "Ride wrapped."}</h1>
          <p>
            {route.name} ·{" "}
            {activeEngine.completed ? "Route complete" : "Ride ended early"}
          </p>
          <div className={styles.summaryGrid}>
            {metric(
              "DISTANCE",
              (summary.distanceMeters / 1000).toFixed(2),
              "km",
            )}
            {metric("MOVING TIME", time(summary.elapsedSeconds), "")}
            {metric(
              "AVERAGE SPEED",
              (summary.averageSpeedMetersPerSecond * 3.6).toFixed(1),
              "km/h",
            )}
            {metric("AVERAGE POWER", summary.averagePowerWatts.toFixed(0), "W")}
            {metric("MAX POWER", summary.maxPowerWatts.toFixed(0), "W")}
            {metric(
              "ELEVATION GAIN",
              summary.elevationGainMeters.toFixed(1),
              "m",
            )}
          </div>
          <button
            className={`button ${styles.start}`}
            disabled={!canStart}
            onClick={start}
          >
            Ride again →
          </button>
          <button
            className="button"
            onClick={() => {
              setPhase("home");
              setSetup(true);
              setWarning("");
            }}
          >
            Back to setup
          </button>
          <p className={styles.privacy}>JUST YOU, YOUR WATTS, AND THE ROAD.</p>
        </section>
      )}
    </main>
  );
}
