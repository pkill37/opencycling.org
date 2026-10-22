import styles from "./OpenRide.module.css";

export function LandingIntro() {
  return (
    <>
      <h1>Free virtual cycling in your browser.</h1>
      <p>
        Ride French roads with your Bluetooth smart trainer or try the keyboard
        simulator. OpenRide is an open source indoor cycling game, free to play
        with no account needed.
      </p>
    </>
  );
}

export function LandingGuide() {
  return (
    <section className={styles.guide} aria-labelledby="cycling-guide">
      <h2 id="cycling-guide">Frequently asked questions</h2>
      <details>
        <summary>What can I ride in OpenRide?</summary>
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
          OpenRide reads power and cadence from compatible Bluetooth trainers
          using FTMS or Cycling Power Service. Open the site over HTTPS in a
          browser that supports Web Bluetooth, choose your course and connect
          your trainer. The connection is read-only: OpenRide does not change
          trainer resistance. Physical trainer compatibility depends on your
          device and browser.
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
        <summary>Is OpenRide free, and do I need an account?</summary>
        <p>
          OpenRide is free to play and open source. You can choose a route,
          connect a compatible trainer or use the simulator, and start riding
          without an account or subscription.
        </p>
      </details>
      <details>
        <summary>What does my browser need to run OpenRide?</summary>
        <p>
          The 3D ride requires JavaScript and WebGL. A trainer connection also
          requires HTTPS and Web Bluetooth support on your browser and device.
          The setup screen checks Bluetooth availability; you can use the
          simulator when Bluetooth is unavailable.
        </p>
      </details>
      <details>
        <summary>
          Does OpenRide automatically change trainer resistance?
        </summary>
        <p>
          No. OpenRide reads trainer telemetry without sending resistance
          commands. Your power and the virtual road gradient affect your speed
          in the game; adjust resistance on your trainer separately.
        </p>
      </details>
      <details>
        <summary>Can I import my own GPX cycling route?</summary>
        <p>
          Yes. Open the route import option during setup and select a GPX file
          or an OpenRide route package in JSON format, up to 20 MB. For GPX
          files, choose a track and segment, validate it, then review the
          preview before loading. Files are processed locally in your browser.
        </p>
      </details>
      <details>
        <summary>Why won’t my Bluetooth trainer connect?</summary>
        <p>
          Check the Bluetooth availability message in setup, wake your trainer
          and keep it nearby. Close other apps connected to the trainer, check
          site permissions and try connecting again. You can also review the
          Bluetooth diagnostics in setup or use the simulator to try a ride.
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
          OpenRide has no backend and does not upload your Bluetooth device or
          ride data.
        </p>
      </details>
      <a href="/ride/">Set up a virtual cycling ride</a>
    </section>
  );
}
