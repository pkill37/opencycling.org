"use client";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { route as demoRoute } from "@/game/route/route";
import { defaultPhysicsConfig } from "@/game/physics/cycling";
import RouteImport from "./RouteImport";
import RouteSelection from "./RouteSelection";
import { bundledRoutes, loadBundledRoute } from "@/game/route/bundled";
import RouteMinimap from "./RouteMinimap";
import PhysicsSettings from "./PhysicsSettings";
import { RideEngine } from "@/game/loop/engine";
import { ZombiesMode, noZombies } from "@/game/modes/zombies";
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
const presets = [100, 150, 200, 250, 300, 400, 500, 600, 800];
type GameMode = "ride" | "zombies";
export default function OpenRide({
  initialSetup = false,
}: {
  initialSetup?: boolean;
}) {
  const [route, setRoute] = useState(demoRoute);
  const [routeLoading, setRouteLoading] = useState(!initialSetup);
  const [loadingRouteKey, setLoadingRouteKey] = useState("alpe");
  const [routeError, setRouteError] = useState("");
  const loadRoute = useCallback(async (key: string) => {
    setRouteError("");
    if (key === "demo") {
      setRoute(demoRoute);
      return;
    }
    const course = bundledRoutes.find((entry) => entry.key === key);
    if (!course) return;
    setLoadingRouteKey(key);
    setRouteLoading(true);
    try {
      setRoute(await loadBundledRoute(key));
    } catch (error) {
      setRouteError(
        error instanceof Error ? error.message : "Route loading failed.",
      );
    } finally {
      setRouteLoading(false);
    }
  }, []);
  useEffect(() => {
    if (initialSetup) return;
    let cancelled = false;
    void loadBundledRoute("alpe")
      .then((next) => {
        if (!cancelled) setRoute(next);
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setRouteError(
            error instanceof Error ? error.message : "Route loading failed.",
          );
      })
      .finally(() => {
        if (!cancelled) setRouteLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initialSetup]);
  const [physics, setPhysics] = useState({ ...defaultPhysicsConfig });
  const low = route.points.reduce((v, p) => Math.min(v, p.y), Infinity);
  const high = route.points.reduce((v, p) => Math.max(v, p.y), -Infinity);
  const stride = Math.max(1, Math.floor(route.points.length / 400));
  const profilePath = route.points
    .filter((_, i) => i % stride === 0 || i === route.points.length - 1)
    .map(
      (p, i) =>
        `${i ? "L" : "M"}${((p.distanceMeters / route.distanceMeters) * 400).toFixed(2)},${(60 - ((p.y - low) / Math.max(1, high - low)) * 55).toFixed(2)}`,
    )
    .join(" ");
  const [activeEngine, setEngine] = useState(() => new RideEngine()),
    [sim] = useState(() => new SimulatorSource()),
    [trainer] = useState(() => new BluetoothTrainerSource());
  const [phase, setPhase] = useState<"home" | "ride" | "summary">("home"),
    [setup, setSetup] = useState(initialSetup),
    [source, setSource] = useState<"simulator" | "bluetooth">("simulator"),
    [mode, setMode] = useState<GameMode>("ride");
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
    [cps, setCps] = useState(false),
    [zombies, setZombies] = useState(noZombies),
    [summaryReason, setSummaryReason] = useState<
      "finished" | "caught" | "ended"
    >("ended");
  const host = useRef<HTMLDivElement>(null),
    world = useRef<Awaited<
      ReturnType<typeof import("@/game/world/scene").createWorld>
    > | null>(null),
    zombiesMode = useRef<ZombiesMode | null>(null),
    zombiesSnapshot = useRef(noZombies);
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
    const next = new RideEngine(route, { ...physics });
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
    setSummaryReason("ended");
    if (mode === "zombies") {
      zombiesMode.current = new ZombiesMode(next.state.distanceMeters);
      zombiesSnapshot.current = zombiesMode.current.snapshot;
      setZombies(zombiesSnapshot.current);
    } else {
      zombiesMode.current = null;
      zombiesSnapshot.current = noZombies;
      setZombies(noZombies);
    }
    setPhase("ride");
  };
  const finish = useCallback(() => {
    activeEngine.setPaused(true);
    setSummaryReason("ended");
    setSummary(activeEngine.summary());
    setPhase("summary");
  }, [activeEngine, setPhase]);
  const togglePause = useCallback(() => {
    activeEngine.setPaused(!activeEngine.paused);
    setPaused(activeEngine.paused);
  }, [activeEngine]);
  const toggleCamera = useCallback(() => {
    world.current?.toggleCamera();
    setCamera(world.current?.cameraName() ?? "Chase");
  }, []);
  const worldActive = phase !== "home";
  const showingSummary = useRef(false);
  useEffect(() => {
    showingSummary.current = phase === "summary";
  }, [phase]);
  useEffect(() => {
    const e = activeEngine;
    let frame = 0,
      stopped = false,
      last = performance.now(),
      published = 0;
    let view: typeof world.current = null;
    if (!host.current || !worldActive) return;
    const element = host.current;
    import("@/game/world/scene")
      .then(({ createWorld }) => {
        if (stopped) return;
        try {
          view = createWorld(
            element,
            e,
            () => zombiesSnapshot.current,
            () => showingSummary.current,
          );
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
          if (!document.hidden && !showingSummary.current) {
            e.advance(dt);
            zombiesMode.current?.advance(dt, e.state);
          }
          if (!document.hidden) view?.render(dt);
          if (now - published > 100 && !showingSummary.current) {
            zombiesSnapshot.current =
              zombiesMode.current?.snapshot ?? noZombies;
            setSnapshot({ ...e.state });
            setZombies(zombiesSnapshot.current);
            setPaused(e.paused);
            setWarning(e.warning);
            setFps(Math.round(1 / Math.max(dt, 0.001)));
            published = now;
            if (zombiesSnapshot.current.caught) {
              e.setPaused(true);
              setSummaryReason("caught");
              setSummary(e.summary());
              setPhase("summary");
              showingSummary.current = true;
            }
            if (!showingSummary.current && e.completed) {
              e.setPaused(true);
              setSummaryReason("finished");
              setSummary(e.summary());
              setPhase("summary");
              showingSummary.current = true;
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
      if (document.hidden && !showingSummary.current) {
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
  }, [worldActive, activeEngine]);
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
  const menuRoute = routeLoading
    ? bundledRoutes.find((entry) => entry.key === loadingRouteKey)
    : undefined;
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
      aria-label={`${route.name} elevation profile`}
    >
      <path
        d={`M0,65 ${profilePath.replace(/^M/, "L")} L400,65 Z`}
        fill="currentColor"
        opacity=".25"
      />
      <path d={profilePath} fill="none" stroke="currentColor" strokeWidth="2" />
      {phase === "ride" && (
        <line
          x1={(snapshot.distanceMeters / route.distanceMeters) * 400}
          x2={(snapshot.distanceMeters / route.distanceMeters) * 400}
          y1="0"
          y2="65"
          stroke="currentColor"
          strokeWidth="2"
        />
      )}
    </svg>
  );
  return (
    <main className={styles.app}>
      {worldActive && (
        <div
          ref={host}
          className={styles.world}
          aria-label={`${route.name} 3D cycling world`}
        />
      )}
      {phase === "ride" && mode === "zombies" && zombies.threat !== "safe" && (
        <div
          className={`${styles.zombieOverlay} ${
            zombies.threat === "danger"
              ? styles.zombieOverlayDanger
              : zombies.threat === "caught"
                ? styles.zombieOverlayCaught
                : styles.zombieOverlayWarning
          }`}
          aria-hidden="true"
        />
      )}
      {phase === "home" && (
        <>
          <header className={styles.header}>
            <Link href="/" prefetch={false} className={styles.logo}>
              <span>◒</span> openride
            </Link>
            <span className={styles.local}>
              FREE TO PLAY · NO ACCOUNT NEEDED
            </span>
          </header>
          <section className={styles.home}>
            <div className={styles.intro}>
              <div className={styles.eyebrow}>PICK A ROAD. MAKE IT YOURS.</div>
              <h1>Your next ride starts here.</h1>
              <p>
                Three French roads. Your power. One open source cycling game.
              </p>
              <RouteSelection
                selected={menuRoute?.id ?? route.id}
                loading={routeLoading}
                onSelect={(key) => void loadRoute(key)}
              />
              <div className={styles.selectionHeading}>
                <span className={styles.eyebrow}>SELECTED COURSE</span>
                <span>01 / CHOOSE YOUR ROAD</span>
              </div>
              <div className={styles.routeName}>
                <div>
                  <small>
                    {routeLoading
                      ? "LOADING COURSE…"
                      : route.id === demoRoute.id
                        ? "PRACTICE COURSE"
                        : "GPX PREVIEW"}
                  </small>
                  <h2>{menuRoute?.title ?? route.name}</h2>
                </div>
              </div>
              <div className={styles.routeStats}>
                {metric(
                  "DISTANCE",
                  menuRoute?.distance ??
                    (route.distanceMeters / 1000).toFixed(2),
                  "km",
                )}
                {metric(
                  "ELEVATION GAIN",
                  menuRoute?.gain ?? route.elevationGainMeters.toFixed(0),
                  "m",
                )}
              </div>
              {!routeLoading && (
                <div className={styles.profile}>
                  {profile}
                  <span>{route.metadata?.context}</span>
                </div>
              )}
              <p>
                {routeLoading
                  ? "Preparing your course…"
                  : route.metadata?.quality}
              </p>
              <details>
                <summary>Sources & route diagnostics</summary>
                <p>{route.metadata?.attribution}</p>
                {route.metadata?.warnings.map((w) => (
                  <p key={w}>{w}</p>
                ))}
                <p>
                  Direction follows input order.{" "}
                  {route.loop ? "One closed lap" : "Point to point"}. Gain is
                  the sum of positive differences in the loaded elevation
                  profile; bundled previews may use documented smoothing.
                </p>
              </details>
            </div>
            <div className={styles.setup}>
              <noscript>
                <p>
                  Enable JavaScript to connect a trainer or start a simulated
                  ride.
                </p>
              </noscript>
              <div className={styles.cardHeading}>
                <span className={styles.eyebrow}>READY TO PLAY</span>
                <span>02 / SETUP</span>
              </div>
              <h2>Make it your ride.</h2>
              <label>
                Route{" "}
                <select
                  aria-label="Route"
                  disabled={routeLoading}
                  value={
                    route.id === demoRoute.id
                      ? "demo"
                      : route.id === "alpe-d-huez-test"
                        ? "alpe"
                        : route.id === "marseille" || route.id === "paris"
                          ? route.id
                          : "import"
                  }
                  onChange={(e) => void loadRoute(e.target.value)}
                >
                  <option value="demo">Synthetic training loop (demo)</option>
                  {route.id !== demoRoute.id &&
                    route.id !== "alpe-d-huez-test" &&
                    route.id !== "marseille" &&
                    route.id !== "paris" && (
                      <option value="import">{route.name}</option>
                    )}
                  <option value="alpe">Alpe d’Huez (GPX test ascent)</option>
                  <option value="marseille">
                    Marseille Corniche (flat GPX preview)
                  </option>
                  <option value="paris">Paris 2023 finale (GPX preview)</option>
                </select>
              </label>
              {(route.id === "marseille" || route.id === "paris") && (
                <a href={`/${route.id}.gpx`} download>
                  Download source GPX
                </a>
              )}

              {routeLoading && <p role="status">Loading route…</p>}
              {routeError && <p role="alert">{routeError}</p>}

              <p>Ride with your trainer or jump in with keyboard controls.</p>
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
              <div className={styles.modeSelect} aria-label="Ride mode">
                <button
                  className={mode === "ride" ? styles.selected : ""}
                  aria-pressed={mode === "ride"}
                  onClick={() => setMode("ride")}
                >
                  <strong>Open Ride</strong>
                  <small>Ride at your own pace</small>
                </button>
                <button
                  className={mode === "zombies" ? styles.selected : ""}
                  aria-pressed={mode === "zombies"}
                  onClick={() => setMode("zombies")}
                >
                  <strong>Zombies Mode</strong>
                  <small>Stay ahead of the horde</small>
                </button>
              </div>
              <button
                className={`button ${styles.start}`}
                disabled={
                  !canStart || routeLoading || !!routeError || !!worldError
                }
                onClick={start}
              >
                Start ride <span>→</span>
              </button>
              <p className={styles.support}>{availability.message}</p>
              {!availability.available && (
                <details className={styles.connection}>
                  <summary>Bluetooth diagnostics</summary>
                  {availability.details.map((detail) => (
                    <p key={detail}>{detail}</p>
                  ))}
                </details>
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
              <RouteImport onSelect={setRoute} />
              <PhysicsSettings value={physics} onChange={setPhysics} />
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
              <div className={styles.privacy}>
                LOCAL BY DESIGN · YOUR RIDE STAYS WITH YOU
              </div>
            </div>
          </section>
          <footer className={styles.footer}>
            <span>THREE ROADS. NO LEADERBOARD. JUST YOU.</span>
            <span>OPEN SOURCE · RUNS IN YOUR BROWSER</span>
          </footer>
        </>
      )}
      {phase === "ride" && (
        <>
          {hud && (
            <div className={styles.rideHud}>
              <RouteMinimap
                route={activeEngine.course}
                distanceMeters={snapshot.distanceMeters}
              />
              <div className={styles.topbar}>
                <span className={styles.logo}>◒ openride</span>
                <span>{route.name}</span>
                <span className={styles.live}>
                  {mode === "zombies" ? "☣ ZOMBIES · " : ""}
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
                {profile}
                <small>
                  {snapshot.braking ? "AUTO BRAKING" : "CORNER MODEL"} · target{" "}
                  {((snapshot.targetSpeedMetersPerSecond ?? 30) * 3.6).toFixed(
                    0,
                  )}{" "}
                  km/h · braking loss{" "}
                  {((snapshot.brakingEnergyJoules ?? 0) / 1000).toFixed(1)} kJ
                </small>
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
              {mode === "zombies" && (
                <div
                  className={`${styles.zombieHud} ${
                    zombies.threat === "danger"
                      ? styles.zombieDanger
                      : zombies.threat === "warning"
                        ? styles.zombieWarning
                        : zombies.threat === "caught"
                          ? styles.zombieCaught
                          : styles.zombieSafe
                  }`}
                >
                  <span>ZOMBIES</span>
                  <strong>
                    {Number.isFinite(zombies.nearestGapMeters)
                      ? Math.max(0, Math.round(zombies.nearestGapMeters))
                      : "—"}
                    <small>m</small>
                  </strong>
                  <small>
                    {zombies.threat === "caught"
                      ? "CAUGHT"
                      : zombies.threat === "danger"
                        ? "SPRINT NOW"
                        : zombies.threat === "warning"
                          ? "CLOSING FAST"
                          : "BEHIND YOU"}
                  </small>
                  <span>Score {zombies.score}</span>
                </div>
              )}
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
          Loading {route.name}…
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
            {summaryReason === "caught"
              ? "THE HORDE CAUGHT YOU."
              : activeEngine.completed
                ? "ONE LOOP. WELL RIDDEN."
                : "EVERY TURN COUNTS."}
          </div>
          <h1>
            {summaryReason === "caught"
              ? "Caught by zombies."
              : activeEngine.completed
                ? "You made it."
                : "Ride wrapped."}
          </h1>
          <p>
            {route.name} · {mode === "zombies" ? "Zombies Mode · " : ""}
            {summaryReason === "caught"
              ? `Survived ${time(zombies.survivedSeconds)}`
              : activeEngine.completed
                ? "Route complete"
                : "Ride ended early"}
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
