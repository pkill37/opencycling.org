# Running and verifying OpenRide

- Install: `npm install`
- Development: `npm run dev` (localhost), or `npm run dev:https` (accept/trust the local development certificate).
- Core tests: `npm test`
- Type checking: `npm run typecheck`
- Static production build: `npm run build`; deploy **out/** to any HTTPS static host. No runtime server is needed.
- Browser checks: `npx playwright install chromium`, then `npm run build` and `npm run test:e2e`. Tests serve the export on port 4173.

The trainer connection is read-only. The app never requests resistance control or uploads data. Web Bluetooth availability is detected in the browser; simulator mode works without it. Some operating system/browser combinations do not provide Web Bluetooth even on HTTPS.

## Hardware compatibility record

No physical trainer was available in the implementation environment. The rows below are pending manual testing; mocked GATT tests are not proof of hardware interoperability.

| Browser/version | OS      | Device name        | Advertised services | Connected path | Power   | Cadence | Speed   | Disconnect behavior | Notes                  |
| --------------- | ------- | ------------------ | ------------------- | -------------- | ------- | ------- | ------- | ------------------- | ---------------------- |
| Pending         | Pending | FTMS smart trainer | Pending             | Pending        | Pending | Pending | Pending | Pending             | Real hardware required |
| Pending         | Pending | FTMS indoor bike   | Pending             | Pending        | Pending | Pending | Pending | Pending             | Real hardware required |
| Pending         | Pending | BLE power meter    | Pending             | Pending        | Pending | Pending | Pending | Pending             | Real hardware required |

## Manual checklist

1. Open the HTTPS app in a browser exposing `navigator.bluetooth`. Verify no device prompt appears before clicking Connect.
2. Wake the trainer, click Connect, and select it. Check state transitions, name, services, feature bytes, power/cadence/speed preview and last packet time. Missing fields should show a dash.
3. Start riding; change effort. Confirm virtual speed responds to power and slope, independently of the trainer speed diagnostic.
4. Pause/resume. Switch cameras; toggle HUD and F3. Check phone portrait/landscape touch controls and desktop keyboard presets.
5. Disconnect/power off the trainer. Confirm warning after 3 seconds without power, deceleration, and pause after 10 seconds. Reconnect manually and resume. Try simulator fallback.
6. Cancel the chooser, deny access, select an unsupported device via debug scan, and connect while another app owns the trainer. Confirm useful errors and simulator availability.
7. Test a CPS-only device and the explicit Cycling Power option. Check cadence while pedaling, stopping, restarting and across event counter rollovers.
8. Complete one lap. Confirm distance equals route length, rider stops, and summary shows plausible time-weighted average power and elevation gain. Restart and return to setup.
9. Background the tab and return. It should remain paused and exclude background time.
10. Measure F3 frame rates on actual desktop and weaker/mobile devices. Target 60 FPS desktop, at least 30 FPS weaker devices; this is not yet a hardware-verified guarantee.

Simulator: ↑/W +25 W, ↓/S −25 W, 1–9 = 100/150/200/250/300/400/500/600/800 W, Space +300 W for 1.5 s. C camera, H HUD, P pause, Esc finish, F3 debug. Touch controls provide equivalent basic riding actions.

## USB and Bluetooth gamepads

Connect the controller by USB, or pair it in your operating system’s Bluetooth settings. Open OpenRide over HTTPS or localhost, focus the page, and press a controller button to make it visible to the browser. Release the controls before riding. The **Gamepad controller** card in setup shows the device name, connection state, and live input feedback. Bluetooth and USB setup buttons show instructions for each method; **Check connection** retries discovery and API access. During a ride, **Gamepad · Connected / Not connected** shows the current state and expands to the same device card.

An already paired Bluetooth controller may remain invisible until you press a button with the page active. Detection runs automatically and refreshes on connection/disconnection events or when the page regains focus. USB and Bluetooth use the same browser API, which does not expose the active transport; the setup buttons select instructions, not a detected connection type.

OpenRide uses the [browser Gamepad API](https://www.w3.org/TR/gamepad/) and requires a browser-recognized `standard` mapping. Gamepads do not use the smart trainer Bluetooth chooser. Unrecognized layouts and blocked/unavailable API access show a fallback message. With multiple controllers, the first standard controller is used and retained until disconnected.

| Control                        | Action                                   |
| ------------------------------ | ---------------------------------------- |
| D-pad or left stick up/down    | Simulator power ±25 W; hold to repeat    |
| Bottom face button (A / Cross) | Simulator sprint, +300 W for 1.5 seconds |
| Left face button (X / Square)  | Cycle camera                             |
| Top face button (Y / Triangle) | Toggle HUD                               |
| Menu / Options (Start)         | Start/restart a ride, or pause/resume    |

Power and sprint do not change live trainer telemetry. Button actions fire once per press; the stick has a dead zone. Input is suspended while the page is hidden, unfocused, or a text field is being edited. Controls must be released after returning to the page or changing ride/source. Disconnecting the active controller pauses a ride; reconnect and press Menu / Options to resume, or use keyboard/touch controls. Finish remains available on screen or with Esc.

Automated tests use simulated gamepad snapshots. Physical USB and Bluetooth hardware verification is still pending: test each transport, button mapping, held inputs, unplug/reconnect, tab switching, and use alongside a live trainer on your OS/browser.
