export interface BluetoothAvailability {
  available: boolean;
  message: string;
  details: string[];
}

export function bluetoothAvailability(
  context:
    | {
        isSecureContext: boolean;
        navigator: { bluetooth?: unknown; userAgent?: string };
      }
    | undefined = typeof window === "undefined" ? undefined : window,
): BluetoothAvailability {
  if (!context)
    return {
      available: false,
      message: "Checking Bluetooth support…",
      details: ["Waiting for browser feature detection."],
    };
  const browser = browserName(context.navigator.userAgent ?? "");
  const details = [
    `Browser: ${browser}`,
    `Secure context: ${context.isSecureContext ? "yes" : "no"}`,
    `navigator.bluetooth: ${context.navigator.bluetooth ? "present" : "missing"}`,
  ];
  if (!context.isSecureContext)
    return {
      available: false,
      message:
        "Bluetooth requires HTTPS. Use a secure URL or the HTTPS development server.",
      details,
    };
  if (!context.navigator.bluetooth)
    return {
      available: false,
      message:
        browser === "Firefox" || browser === "Safari"
          ? `${browser} does not implement Web Bluetooth. Use Chrome or Edge for smart trainer connections, or use the simulator.`
          : "Web Bluetooth is unavailable in this browser. Try Chrome or Edge on a supported device, or use the simulator.",
      details,
    };
  return {
    available: true,
    message:
      "Web Bluetooth is available. Connect your FTMS trainer or cycling power meter.",
    details,
  };
}

function browserName(userAgent: string) {
  if (/firefox|fxios/i.test(userAgent)) return "Firefox";
  if (/edg\//i.test(userAgent)) return "Edge";
  if (/chrome|crios|chromium/i.test(userAgent)) return "Chrome";
  if (/safari/i.test(userAgent)) return "Safari";
  return userAgent ? "Unknown browser" : "Unknown";
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
