# Trainer compatibility

[Documentation index](README.md) · [Setup and controls](../README.md)

Trainer telemetry remains read-only unless the rider explicitly enables resistance control. FTMS simulation-grade control is preferred, with target resistance as fallback; CPS-only and unsupported FTMS devices stay read-only. Web Bluetooth availability is detected in the browser; simulator mode works without it. HTTPS alone does not guarantee Web Bluetooth support; the setup screen reports availability.

## Hardware compatibility record

No physical trainer was available in the implementation environment. The rows below are pending manual testing; mocked GATT tests are not proof of hardware interoperability.

| Browser/version | OS      | Device name        | Advertised services | Connected path | Power   | Cadence | Speed   | Disconnect behavior | Notes                  |
| --------------- | ------- | ------------------ | ------------------- | -------------- | ------- | ------- | ------- | ------------------- | ---------------------- |
| Pending         | Pending | FTMS smart trainer | Pending             | Pending        | Pending | Pending | Pending | Pending             | Real hardware required |
| Pending         | Pending | FTMS indoor bike   | Pending             | Pending        | Pending | Pending | Pending | Pending             | Real hardware required |
| Pending         | Pending | BLE power meter    | Pending             | Pending        | Pending | Pending | Pending | Pending             | Real hardware required |

Record these control fields during hardware validation: target-setting feature bits, control-point indication support, simulation parameters, target resistance, advertised resistance range, pause/reset behavior, and whether another trainer application can take control.

## Manual checklist

1. Open the HTTPS app in a browser exposing `navigator.bluetooth`. Verify no device prompt appears before clicking Connect.
2. Wake the trainer, click Connect, and select it. Check state transitions, name, services, feature bytes, power/cadence/speed preview and last packet time. Missing fields should show a dash.
3. Start riding; change effort. Confirm virtual speed responds to power and slope, independently of the trainer speed diagnostic.
4. Pause/resume. Switch cameras; toggle HUD and F3. Check phone portrait/landscape touch controls and desktop keyboard presets.
5. Disconnect/power off the trainer. Confirm warning after 3 seconds without power, deceleration, and pause after 10 seconds. Reconnect manually and resume. Browsers without Web Bluetooth use the simulator.
6. Cancel the chooser, deny access, select an unsupported device via debug scan, and connect while another app owns the trainer. Confirm useful errors and simulator availability.
7. Test a CPS-only device and the explicit Cycling Power option. Check cadence while pedaling, stopping, restarting and across event counter rollovers.
8. With an FTMS trainer, confirm the setup checkbox is off by default. Enable it, confirm consent, verify simulation-grade commands and resistance-level fallback, and reject a command to confirm virtual-only continuation.
9. Start once without the control checkbox. Confirm gears explain why they are disabled, then click **Enable trainer gears** on the road. Declining must keep the ride read-only; accepting must enable shifting without restarting.
10. Use Easier/Harder and `[`/`]` while pedaling. Confirm gear 11 is neutral, higher gears feel harder, route changes still affect load, and both limits remain usable. Verify shifting is disabled without consent and while paused; resume preserves the gear and a new ride resets it. Record gear range and feel for the device.
11. Pause, finish, disconnect, reconnect, and compete with another trainer application while control is active. Confirm commands stop and a fresh control session is required.
12. Complete the selected course. Confirm distance equals route length, rider stops, and summary shows plausible time-weighted average power and elevation gain. Restart and return to setup.
13. Background the tab and return. Confirm hidden time does not advance the countdown, race or audio.
14. Measure F3 frame rates on actual desktop and weaker/mobile devices. Target 60 FPS desktop, at least 30 FPS weaker devices; this is not yet a hardware-verified guarantee.

Keyboard controls and game modes are listed in the [project README](../README.md#controls). Trainer gears are app-defined FTMS resistance steps, not trainer-native virtual shifting.
