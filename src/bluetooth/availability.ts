export function bluetoothAvailability(
  context:
    | { isSecureContext: boolean; navigator: { bluetooth?: unknown } }
    | undefined = typeof window === "undefined" ? undefined : window,
) {
  if (!context)
    return { available: false, message: "Checking Bluetooth support…" };
  if (!context.isSecureContext)
    return {
      available: false,
      message:
        "Bluetooth requires HTTPS. Use a secure URL or the HTTPS development server.",
    };
  if (!context.navigator.bluetooth)
    return {
      available: false,
      message:
        "Web Bluetooth is unavailable in this browser. Try Chrome or Edge on a supported device, or use the simulator.",
    };
  return {
    available: true,
    message:
      "Web Bluetooth is available. Connect your FTMS trainer or cycling power meter.",
  };
}
export function bluetoothError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "NotFoundError")
      return "No trainer selected. The chooser was cancelled or no matching device was found. Wake your trainer and try again.";
    if (error.name === "SecurityError")
      return "Bluetooth access was blocked. Check site permissions and use HTTPS.";
    if (error.name === "NetworkError")
      return "GATT connection failed. Move closer, close other trainer apps, and reconnect.";
    return error.message;
  }
  return "Trainer connection failed. Reconnect or use the simulator.";
}
