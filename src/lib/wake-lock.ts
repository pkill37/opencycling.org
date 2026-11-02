/**
 * Requesting a screen wake lock is best effort: unsupported browsers and
 * browsers that deny the request must still be able to run the ride.
 */
export async function requestScreenWakeLock() {
  if (typeof navigator === "undefined" || !("wakeLock" in navigator))
    return undefined;
  try {
    return await navigator.wakeLock.request("screen");
  } catch {
    return undefined;
  }
}
