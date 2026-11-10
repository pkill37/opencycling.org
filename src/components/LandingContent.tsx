import styles from "./OpenRide.module.css";

export function LandingIntro() {
  return (
    <>
      <h1>Free indoor bike training in your browser.</h1>
      <p>
        Ride French roads with a Bluetooth smart trainer or try the keyboard
        simulator. OpenCycling.org is a free, open-source Zwift alternative for
        indoor cycling with no account or subscription.
      </p>
      <div className={styles.introMeta} aria-label="OpenCycling benefits">
        <span>NO ACCOUNT</span>
        <span>RUNS LOCALLY</span>
        <span>OPEN SOURCE</span>
      </div>
    </>
  );
}

export function LandingGuide() {
  return (
    <section className={styles.guide} aria-labelledby="cycling-guide">
      <h2 id="cycling-guide">Frequently asked questions</h2>
      <details>
        <summary>What can I ride on OpenCycling.org?</summary>
        <p>
          Choose the Alpe d’Huez climb, Marseille or Paris, then explore a 3D
          cycling world powered by your effort. Follow your power, cadence,
          speed, distance and elevation as you ride. You can also import a GPX
          route during setup.
        </p>
      </details>
      <details>
        <summary>How do I connect a smart trainer?</summary>
        <p>
          OpenCycling.org reads power and cadence from compatible Bluetooth
          trainers using FTMS or Cycling Power Service. Open the site over HTTPS
          in a browser that supports Web Bluetooth, choose your course and
          connect your trainer. Resistance control is optional and requires your
          explicit consent; otherwise the connection remains read-only. Physical
          trainer compatibility depends on your device and browser.
        </p>
      </details>
      <details>
        <summary>Can I try virtual cycling without a trainer?</summary>
        <p>
          Yes. Start with the keyboard simulator and use the arrow keys to
          adjust simulated power. No trainer, subscription or account is
          required to try the routes. JavaScript and WebGL are required for the
          3D ride.
        </p>
      </details>
      <details>
        <summary>Is OpenCycling.org free, and do I need an account?</summary>
        <p>
          OpenCycling.org is free to play and open source. You can choose a
          route, connect a compatible trainer or use the simulator, and start
          riding without an account or subscription.
        </p>
      </details>
      <details>
        <summary>Is OpenCycling.org a free Zwift alternative?</summary>
        <p>
          Yes. OpenCycling.org is a free, open-source indoor cycling game with
          no subscription or account. It is an independent browser app, not
          affiliated with Zwift, and focuses on solo rides with French routes,
          Bluetooth trainer data and a keyboard simulator.
        </p>
      </details>
      <details>
        <summary>
          Can I use a Wahoo GPS bike computer with OpenCycling.org?
        </summary>
        <p>
          OpenCycling.org connects directly to compatible Bluetooth smart
          trainers and cycling power meters, not to Wahoo GPS bike computers. A
          Wahoo ELEMNT or other GPS bike computer may record an indoor ride
          separately when your trainer or power meter broadcasts to it; the
          exact setup depends on your Wahoo model and sensors.
        </p>
      </details>
      <details>
        <summary>What does my browser need to run OpenCycling.org?</summary>
        <p>
          The 3D ride requires JavaScript and WebGL. A trainer connection also
          requires HTTPS and Web Bluetooth support on your browser and device.
          The setup screen checks Bluetooth availability; you can use the
          simulator when Bluetooth is unavailable.
        </p>
      </details>
      <details>
        <summary>
          Does OpenCycling.org automatically change trainer resistance?
        </summary>
        <p>
          Only when you explicitly enable trainer control during setup. FTMS
          simulation-grade control is preferred, with resistance-level fallback;
          unsupported or CPS-only trainers remain read-only. Virtual physics
          continues if hardware control is unavailable.
        </p>
      </details>
      <details>
        <summary>Can I import my own GPX cycling route?</summary>
        <p>
          Yes. Open the route import option during setup and select a GPX file
          or an OpenCycling.org route package in JSON format, up to 20 MB. For
          GPX files, choose a track and segment, validate it, then review the
          preview before loading. Files are processed locally in your browser.
        </p>
      </details>
      <details>
        <summary>Why won’t my Bluetooth trainer connect?</summary>
        <p>
          Check the Bluetooth availability message in setup, wake your trainer
          and keep it nearby. Close other apps connected to the trainer, check
          site permissions and try connecting again. You can also review the
          connection details below the Bluetooth trainer control or use the
          simulator to try a ride.
        </p>
      </details>
      <details>
        <summary>What is Zombies Mode?</summary>
        <p>
          Zombies Mode adds a chase to your ride. Choose it during setup and
          keep riding to stay ahead of the horde. The ride ends if the zombies
          catch you, and the summary shows how long you survived.
        </p>
      </details>
      <details>
        <summary>Where does my ride data go?</summary>
        <p>
          Trainer telemetry and cycling simulation stay in your browser.
          OpenCycling.org has no backend and does not upload your Bluetooth
          device or ride data.
        </p>
        <p>
          Terrain:{" "}
          <a href="https://registry.opendata.aws/terrain-tiles/">Mapzen</a>
           · SRTM courtesy of USGS  · Copernicus/EU-DEM layers. Surrounding
          terrain only; road elevations are unchanged.
        </p>
      </details>
      <a href="/ride/">Set up a virtual cycling ride</a>
    </section>
  );
}
