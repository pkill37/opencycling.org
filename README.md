# OpenCycling.org

Free, open-source indoor cycling in your browser. Ride with a Bluetooth trainer or the keyboard simulator, race local AI riders, replay your best ride, or escape a zombie horde. No account, subscription, or backend is required.

## Features

- Alpe d’Huez, Marseille and Paris previews, plus local GPX and route-package imports.
- Open Ride, Ghost and Zombies modes, with four AI cyclists and a live leaderboard.
- A synchronized **1 → 2 → 3 → START** countdown, procedural 3D scenery, and orbitable chase/first-person cameras.
- FTMS trainer telemetry with Cycling Power Service fallback; optional route resistance and 21 in-game gear steps.
- Zombies that chase players and AI, feeding animations, and proximity-based growls with a mute control.
- Ride summaries, plus best-ride ghosts saved locally in your browser.

**Bundled routes are unverified previews**, not surveyed reconstructions. See the [route pipeline](docs/routes/pipeline.md) for accuracy limits and source status.

## Run locally

Use Node.js 22, matching CI:

```sh
npm ci
npm run dev:https
```

Open the URL printed by Next.js and trust the local development certificate. Real trainer connections require a secure context and a browser that implements Web Bluetooth. The setup screen reports availability; browsers without Web Bluetooth automatically use the simulator. `npm run dev` is also available for localhost development.

1. Select a bundled course, or import a GPX/route package and review its preview.
2. Connect your trainer when Web Bluetooth is available. Trainer data is read-only by default.
3. Choose a mode and press **Start**. Everyone starts together after the road loads and the countdown completes.

To shift gears, enable **Control trainer resistance** during setup, or click **Enable trainer gears** on the road and confirm. These are app-defined resistance steps, starting at neutral gear 11; they do not use trainer-native shifting protocols. Hardware compatibility still needs [manual verification](docs/trainer-compatibility.md).

## Controls

| Control | Action |
| --- | --- |
| `↑` / `W`, `↓` / `S` | Simulator power ±25 W; on-screen buttons are also available |
| `1`–`9` | Simulator presets: 100, 150, 200, 250, 300, 400, 500, 600, 800 W |
| `[` / `]` | Easier / harder trainer gear, while trainer control is active |
| `C`; drag / scroll | Switch camera; orbit / zoom |
| `P`, `H`, `Esc` | Pause/resume, toggle HUD, end ride |
| `M` | Toggle zombie sound; the zombie HUD also has a mute button |
| `F3` | Debug overlay |

Complete a course to unlock its saved ghost. In Zombies mode, caught AI riders stop racing and appear as **EATEN**; the ride ends if the player is caught. Sound starts after the countdown and stops while paused, hidden, or finished.

## Development and deployment

```sh
npm run check                  # Lint, types, formatting and unit tests
npx playwright install chromium
npm run test:e2e               # Build and run browser tests
npm run build                 # Export the static site to out/
npm start                     # Preview out/ on port 3000
```

Deploy `out/` to HTTPS static hosting. Set `SITE_URL` to your public HTTP(S) origin before building to generate canonical/social URLs and a populated sitemap. See [hosting](docs/deployment/hosting.md) for configuration and release checks.

## Documentation

Start with the [documentation index](docs/README.md) for architecture, tests, trainer compatibility, route processing, terrain, source attribution, and deployment. Developer instructions are in [AGENTS.md](AGENTS.md).

## License

Copyright (c) 2026 Fabio Maia. Original code and content are licensed under [MIT](LICENSE). Third-party dependencies, route sources, and terrain data retain their own terms; see [NOTICE.md](NOTICE.md).
