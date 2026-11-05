"use client";
import Link from "next/link";
import { LandingIntro, LandingGuide } from "./LandingContent";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { defaultPhysicsConfig } from "@/game/physics/cycling";
import RouteSelection from "./RouteSelection";
import { bundledRoutes, loadBundledRoute } from "@/game/route/bundled";
import RouteMinimap from "./RouteMinimap";
import PhysicsSettings from "./PhysicsSettings";
import { RideEngine } from "@/game/loop/engine";
import { ZombiesMode, noZombies } from "@/game/modes/zombies";
import { SimulatorSource } from "@/bluetooth/sources/simulator-source";
import { BluetoothTrainerSource } from "@/bluetooth/sources/bluetooth-trainer-source";
import { bluetoothAvailability } from "@/bluetooth/availability";
import { requestScreenWakeLock } from "@/lib/wake-lock";
import type { CyclingRoute, RideSummary, RiderState } from "@/types";
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
  const [initialRoute, setInitialRoute] = useState<CyclingRoute | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void loadBundledRoute("alpe")
      .then((course) => {
        if (!cancelled) setInitialRoute(course);
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setError(
            error instanceof Error ? error.message : "Route loading failed.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);
  if (!initialRoute)
    return (
      <main className={styles.app}>
        <header className={styles.header}>
          <Link href="/" prefetch={false} className={styles.logo}>
            <span>◒</span> OpenCycling.org
          </Link>
          <span className={styles.local}>FREE TO PLAY · NO ACCOUNT NEEDED</span>
        </header>
        <section className={styles.home}>
          <div className={styles.intro}>
            <LandingIntro />
            <RouteSelection
              selected="alpe-d-huez-test"
              loading
              onSelect={() => {}}
            />
            <noscript>
              <p>Enable JavaScript to load a route and start a ride.</p>
            </noscript>
            {error ? (
              <>
                <p role="alert">{error}</p>
                <button
                  onClick={() => {
                    setError("");
                    setAttempt((value) => value + 1);
                  }}
                >
                  Retry loading route
                </button>
              </>
            ) : (
              <p role="status">Loading route…</p>
            )}
          </div>
          {!initialSetup && <LandingGuide />}
        </section>
      </main>
    );
  return (
    <LoadedOpenRide initialRoute={initialRoute} initialSetup={initialSetup} />
  );
}

function LoadedOpenRide({
  initialRoute,
  initialSetup,
}: {
  initialRoute: CyclingRoute;
  initialSetup: boolean;
}) {
  const [route, setRoute] = useState(initialRoute);
  const [routeLoading, setRouteLoading] = useState(false);
  const [loadingRouteKey, setLoadingRouteKey] = useState("alpe");
  const [routeError, setRouteError] = useState("");
  const loadRoute = useCallback(async (key: string) => {
    setRouteError("");
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
  const [activeEngine, setEngine] = useState(
      () => new RideEngine(initialRoute),
    ),
    [sim] = useState(() => new SimulatorSource()),
    [trainer] = useState(() => new BluetoothTrainerSource());
  const [phase, setPhase] = useState<"home" | "ride" | "summary">("home"),
    [setup, setSetup] = useState(initialSetup),
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
  const source = availability.available ? "bluetooth" : "simulator";
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
    [cps, setCps] = useState(false),
    [controlResistance, setControlResistance] = useState(false),
    [controlActive, setControlActive] = useState(false),
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
  const connect = (reconnect = false) => {
    setSetup(true);
    void trainer.connect(false, cps, reconnect);
  };
  const start = async () => {
    let hardwareControl = false;
    let controlWarning = "";
    if (controlResistance && source === "bluetooth") {
      if (
        !window.confirm(
          "Allow OpenCycling.org to change trainer resistance automatically with the route?",
        )
      )
        return;
      try {
        await trainer.requestControl();
        hardwareControl = true;
      } catch (error) {
        controlWarning = `Trainer control unavailable — virtual resistance only. ${error instanceof Error ? error.message : "The trainer rejected control."}`;
      }
    }
    activeEngine.dispose();
    const next = new RideEngine(route, { ...physics });
    next.attach(source === "simulator" ? sim : trainer);
    next.enableTrainerControl(hardwareControl);
    if (controlWarning) next.setControlWarning(controlWarning);
    if (source === "simulator") next.ingest(sim.sample());
    setEngine(next);
    setWorldLoading(true);
    setSnapshot({ ...next.state });
    setPaused(false);
    setCamera("Chase");
    setHud(true);
    setWarning(controlWarning);
    setControlActive(hardwareControl);
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
  const togglePause = useCallback(async () => {
    if (!activeEngine.paused) {
      activeEngine.setPaused(true);
      setPaused(true);
      setControlActive(false);
      return;
    }
    if (controlResistance && source === "bluetooth") {
      try {
        await trainer.requestControl();
        activeEngine.enableTrainerControl(true);
        setControlActive(true);
      } catch {
        setWarning("Trainer control unavailable — virtual resistance only.");
      }
    }
    activeEngine.setPaused(false);
    setPaused(false);
  }, [activeEngine, controlResistance, source, trainer, setWarning]);
  const toggleCamera = useCallback(() => {
    world.current?.toggleCamera();
    setCamera(world.current?.cameraName() ?? "Chase");
  }, []);
  const seekSimulator = useCallback(
    (distanceMeters: number) => {
      if (phase !== "ride" || source !== "simulator") return;
      activeEngine.seek(distanceMeters);
      setSnapshot({ ...activeEngine.state });
      setPaused(activeEngine.paused);
    },
    [activeEngine, phase, source],
  );
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
    const preparation = new AbortController();
    import("@/game/world/scene")
      .then(async ({ createWorld }) => {
        const { loadTerrain } = await import("@/game/route/terrain");
        const elevation = await loadTerrain(e.course);
        if (stopped) return;
        const { prepareTerrain } = await import("@/game/world/prepare-terrain");
        const prepared = await prepareTerrain(
          e.course,
          elevation,
          preparation.signal,
        );
        if (stopped) return;
        try {
          view = createWorld(
            element,
            e,
            () => zombiesSnapshot.current,
            () => showingSummary.current,
            elevation,
            prepared,
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
          if (!showingSummary.current) {
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
            if (e.warning.includes("Trainer control unavailable"))
              setControlActive(false);
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
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      stopped = true;
      preparation.abort();
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", visibility);
      view?.dispose();
      world.current = null;
    };
  }, [worldActive, activeEngine]);
  useEffect(() => {
    if (phase !== "ride") return;
    let active = true;
    let lock: WakeLockSentinel | undefined;
    const acquire = async () => {
      if (!active || document.visibilityState !== "visible" || lock) return;
      const next = await requestScreenWakeLock();
      if (!active) {
        if (next) void next.release();
        return;
      }
      lock = next;
      lock?.addEventListener(
        "release",
        () => {
          lock = undefined;
          void acquire();
        },
        { once: true },
      );
    };
    const visibility = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    void acquire();
    document.addEventListener("visibilitychange", visibility);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", visibility);
      const current = lock;
      lock = undefined;
      if (current) void current.release();
    };
  }, [phase]);
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
    canStart =
      hydrated && (source === "simulator" || trainer.state === "connected");
  const canControl =
    source === "bluetooth" &&
    trainer.kind === "bluetooth-ftms" &&
    trainer.controlCapabilities?.supported === true;
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
              <span>◒</span> OpenCycling.org
            </Link>
            <span className={styles.local}>
              FREE TO PLAY · NO ACCOUNT NEEDED
            </span>
          </header>
          <section className={styles.home}>
            <div className={styles.intro}>
              <LandingIntro />
              <RouteSelection
                selected={menuRoute?.id ?? route.id}
                loading={routeLoading}
                onSelect={(key) => void loadRoute(key)}
              />
            </div>
            <div className={styles.setup}>
              <noscript>
                <p>
                  Enable JavaScript to connect a trainer or start a simulated
                  ride.
                </p>
              </noscript>
              <h2 className={styles.eyebrow}>READY TO PLAY</h2>
              {(route.id === "marseille" || route.id === "paris") && (
                <a href={`/${route.id}.gpx`} download>
                  Download source GPX
                </a>
              )}

              {routeLoading && <p role="status">Loading route…</p>}
              {routeError && <p role="alert">{routeError}</p>}

              <div className={styles.setupControls}>
                <div className={styles.bluetoothControl}>
                  <button
                    className={styles.sourceButton}
                    aria-label="Connect smart trainer"
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
                    <span>
                      <strong>Bluetooth trainer</strong>
                      <small>
                        {!hydrated
                          ? "Checking support…"
                          : !availability.available
                            ? "Simulator · debugging"
                            : trainer.state === "connected"
                              ? trainer.label
                              : "FTMS / Cycling Power"}
                      </small>
                    </span>
                    <span className={styles.bluetoothAction}>
                      {!availability.available
                        ? "Unavailable"
                        : trainer.state === "connected"
                          ? "Connected"
                          : [
                                "connecting",
                                "requesting-device",
                                "discovering-services",
                                "subscribing",
                              ].includes(trainer.state)
                            ? "Connecting…"
                            : "Connect"}
                    </span>
                  </button>
                  {(!availability.available || trainer.state === "error") && (
                    <div className={styles.bluetoothIssue} role="status">
                      <strong>
                        {!availability.available
                          ? "Bluetooth is unavailable"
                          : "Trainer connection failed"}
                      </strong>
                      {!availability.available &&
                        availability.details.map((detail) => (
                          <span key={detail}>{detail}</span>
                        ))}
                      {trainer.error && <p role="alert">{trainer.error}</p>}
                      {trainer.diagnostics.length > 0 && (
                        <ol className={styles.bluetoothLog}>
                          {trainer.diagnostics.slice(-3).map((entry, index) => (
                            <li key={entry + "-" + index}>{entry}</li>
                          ))}
                        </ol>
                      )}
                      {availability.available && (
                        <button
                          className="button"
                          onClick={() => connect(true)}
                        >
                          Reconnect trainer
                        </button>
                      )}
                    </div>
                  )}
                  {setup && source === "bluetooth" && (
                    <details className={styles.connection}>
                      <summary>Bluetooth debug log</summary>
                      <div aria-live="polite">
                        <strong>
                          {trainer.label} · {trainer.state.replaceAll("-", " ")}
                        </strong>
                        <span>
                          {trainer.services.join(" + ") ||
                            "No services detected yet"}
                        </span>
                        <div>
                          {sample?.powerWatts ?? "—"} W ·{" "}
                          {sample?.cadenceRpm ?? "—"} rpm ·{" "}
                          {sample?.speedMetersPerSecond === undefined
                            ? "—"
                            : (sample.speedMetersPerSecond * 3.6).toFixed(
                                1,
                              )}{" "}
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
                          <ol className={styles.bluetoothLog}>
                            {trainer.diagnostics.map((entry, index) => (
                              <li key={entry + "-" + index}>{entry}</li>
                            ))}
                          </ol>
                        )}
                        <button
                          className="button"
                          onClick={() => connect(true)}
                        >
                          Reconnect
                        </button>
                      </div>
                    </details>
                  )}
                  <label className={styles.bluetoothOption}>
                    <input
                      type="checkbox"
                      checked={cps}
                      onChange={(e) => setCps(e.target.checked)}
                    />
                    <svg
                      className={styles.bluetoothOptionIcon}
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path d="m13 2-8 12h6l-1 8 8-12h-6l1-8Z" />
                    </svg>
                    <span>Prefer Cycling Power mode</span>
                  </label>
                </div>
                <div
                  className={styles.modeSelect}
                  role="group"
                  aria-label="Ride mode"
                >
                  <button
                    className={mode === "ride" ? styles.selected : ""}
                    aria-pressed={mode === "ride"}
                    onClick={() => setMode("ride")}
                  >
                    <strong>Open Ride</strong>
                  </button>
                  <button
                    className={mode === "zombies" ? styles.selected : ""}
                    aria-pressed={mode === "zombies"}
                    onClick={() => setMode("zombies")}
                  >
                    <strong>Zombies Mode</strong>
                  </button>
                  <button disabled>
                    <strong>Online</strong>
                    <small>Coming soon</small>
                  </button>
                </div>
                <button
                  className={`button ${styles.start}`}
                  disabled={
                    !canStart || routeLoading || !!routeError || !!worldError
                  }
                  onClick={start}
                >
                  Start <span>→</span>
                </button>
              </div>
              {canControl && (
                <label className={styles.controlConsent}>
                  <input
                    type="checkbox"
                    checked={controlResistance}
                    onChange={(event) =>
                      setControlResistance(event.target.checked)
                    }
                  />{" "}
                  <span>
                    <strong>Control trainer resistance</strong>
                    <small>
                      Optional. The trainer may change resistance automatically
                      with the route.
                    </small>
                  </span>
                </label>
              )}
              <PhysicsSettings value={physics} onChange={setPhysics} />
            </div>
            {!initialSetup && <LandingGuide />}
          </section>
        </>
      )}
      {phase === "ride" && (
        <>
          {hud && (
            <div className={styles.rideHud}>
              <RouteMinimap
                route={activeEngine.course}
                distanceMeters={snapshot.distanceMeters}
                onSeek={source === "simulator" ? seekSimulator : undefined}
              />
              <div className={styles.telemetry}>
                {source !== "simulator" && (
                  <div role="status" className={styles.controlStatus}>
                    {controlActive
                      ? "Trainer control active"
                      : warning.includes("Trainer control")
                        ? "Trainer control unavailable"
                        : "Virtual resistance only"}
                  </div>
                )}
                <div className={styles.power} role="group" aria-label="Power">
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
                  {source === "simulator" && (
                    <div className={styles.powerControls}>
                      <button
                        aria-label="Decrease power"
                        onClick={() => sim.decreasePower()}
                      >
                        −
                      </button>
                      <button onClick={() => sim.sprint()}>Sprint</button>
                      <button
                        aria-label="Increase power"
                        onClick={() => sim.increasePower()}
                      >
                        +
                      </button>
                    </div>
                  )}
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
            ◒ OpenCycling.org
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
