# AGENTS.md

## Commands

- Install with `npm ci` for CI parity; docs also allow `npm install` for local setup.
- Use `npm run dev:https` for real Web Bluetooth work; `npm run dev` is only enough for simulator-only work on localhost.
- Core verification is `npm run check`, which runs `lint -> typecheck -> format:check -> unit tests`.
- Unit tests are Node test files run by `tsx --test tests/*.test.ts`; run one file with `npx tsx --test tests/bluetooth.test.ts`.
- E2E tests require Chromium once with `npx playwright install chromium`; `npm run test:e2e` builds first, then serves `out/` on `127.0.0.1:4173`.
- CI uses Node 22, `npm ci`, `npm run check`, `npx playwright install --with-deps chromium`, then `npm run test:e2e`.

## App Shape

- This is a backend-free Next.js 16 App Router static export: `next.config.ts` has `output: "export"`, trailing slashes, and unoptimized images. Do not add server actions, runtime Node APIs, databases, auth, WebSockets, or backend assumptions.
- `src/app/page.tsx` and `src/app/ride/page.tsx` both render the OpenCycling.org client experience; `/ride/` starts at setup and is marked `noindex`.
- `SITE_URL` is optional, but if set it must be only an HTTP(S) origin with no path/query/fragment; it controls canonical/social/sitemap metadata. Without it, sitemap output is intentionally empty.
- Production preview is `npm start`, which serves the exported `out/` directory on port 3000; Bluetooth still needs HTTPS in real hosting.

## Runtime Boundaries

- Keep simulation deterministic and outside Three.js: trainer/simulator telemetry -> `RideEngine`/physics -> route lookup -> renderer/HUD.
- Three.js code belongs under `src/game/world` and should render current state only; it must not own cycling physics or route progression.
- Bluetooth is browser-only and read-only. FTMS is primary, CPS is fallback; do not add native BLE bridges, Electron, ANT+, vendor SDKs, cloud services, or resistance-control writes.
- The 3D world is dynamically imported after starting a ride so the landing page has no WebGL context and stays small; avoid eager Three.js imports in the initial page path.

## Tests And Artifacts

- Playwright config forces one worker and SwiftShader flags; tests write screenshots and diagnostics to `test-results/`, which is ignored.
- E2E tests assert no landing-page canvas, static metadata/crawler behavior, simulator controls, and mocked Web Bluetooth. Update focused specs when changing these flows.
- Physical trainer compatibility is not proven by automated tests; `docs/COMPATIBILITY.md` is the manual checklist and hardware record.

## Style Constraints

- ESLint treats hook deps, unused vars, explicit `any`, strict equality, `no-var`, and `prefer-const` as errors; TypeScript also has `noUnusedLocals` and `noUnusedParameters`.
- Use the `@/*` path alias for `src/*` imports where helpful.
- README.md is intentionally excluded from Prettier; do not assume `npm run format` will rewrite it.
