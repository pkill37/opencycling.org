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
      <h2 id="cycling-guide">Turn your indoor ride into a virtual adventure</h2>
      <p>
        Choose the Alpe d’Huez climb, Marseille or Paris, then explore a 3D
        cycling world powered by your effort. Follow your power, cadence, speed,
        distance and elevation as you ride. You can also import a GPX route
        during setup.
      </p>
      <h3>How do I connect a smart trainer?</h3>
      <p>
        OpenRide reads power and cadence from compatible Bluetooth trainers
        using FTMS or Cycling Power Service. Open the site over HTTPS in a
        browser that supports Web Bluetooth, choose your course and connect your
        trainer. The connection is read-only: OpenRide does not change trainer
        resistance. Physical trainer compatibility depends on your device and
        browser.
      </p>
      <h3>Can I try virtual cycling without a trainer?</h3>
      <p>
        Yes. Start with the keyboard simulator and use the arrow keys to adjust
        simulated power. No trainer, subscription or account is required to try
        the routes. JavaScript and WebGL are required for the 3D ride.
      </p>
      <h3>Where does my ride data go?</h3>
      <p>
        Trainer telemetry and cycling simulation stay in your browser. OpenRide
        has no backend and does not upload your Bluetooth device or ride data.
      </p>
      <a href="/ride/">Set up a virtual cycling ride</a>
    </section>
  );
}
