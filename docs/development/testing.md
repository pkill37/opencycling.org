# Testing

[Documentation index](../README.md)

CI uses Node.js 22 and installs dependencies with `npm ci`.

## Core checks

```sh
npm run check
```

This runs zero-warning ESLint, strict TypeScript, Prettier checks and unit tests. To narrow a failure:

```sh
npx tsx --test tests/bluetooth.test.ts
npm run typecheck
npm run lint
npm run format:check
```

Unit tests cover parsers and mocked GATT, telemetry freshness, physics, route validation, AI progression, countdown timing, zombie contacts/audio, rider geometry and scenery placement. README.md is intentionally excluded from Prettier; format other changed documentation explicitly.

ESLint 9 is retained because the React plugin bundled with the lint configuration was incompatible with ESLint 10. Hook dependencies, unused variables, explicit `any` and strict equality are enforced as errors.

## Browser checks

```sh
npx playwright install chromium
npm run test:e2e
```

The script builds a fresh static export, serves `out/` on `127.0.0.1:4173`, and runs Playwright with one worker and SwiftShader flags. Linux CI installs Chromium with `npx playwright install --with-deps chromium`.

Filter a run through the package script:

```sh
npm run test:e2e -- --grep 'Zombies Mode'
```

If the export is already current, run `npx playwright test` directly to avoid another build. Rebuild after application changes. Browser coverage includes static metadata/crawler behavior, no landing-page canvas, simulator and mocked Bluetooth flows, local modes, synchronized starts, sound controls and AI elimination.

Screenshots and diagnostics go to ignored `test-results/`; browser runs can clear previous results. Local LCP, CLS and decoded-script measurements are diagnostics, not field performance claims. The static spec checks a 750 KB decoded-script budget and CLS at or below 0.1.

## Manual verification

- Use the [trainer checklist](../trainer-compatibility.md) for real devices. Mocked GATT does not establish hardware compatibility or resistance feel.
- Run the [world audit and visual sweep](world-validation.md) after changing terrain, roads or scenery.
- Verify phone portrait/landscape layouts, audio playback/muting and frame rates on representative devices.
- Complete [deployment checks](../deployment/hosting.md) against the actual public host. Passing local tests does not validate geographic accuracy, source reuse terms or production indexing.
