export const siteTitle = "OpenRide — Open source virtual cycling";
export const siteDescription =
  "Ride Cedar Valley in your browser. Connect a Bluetooth smart trainer or use the keyboard simulator. An open source virtual cycling world with no account required.";

export function parseSiteUrl(value: string | undefined): URL | undefined {
  if (!value?.trim()) return undefined;
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "SITE_URL must be an HTTP(S) origin without credentials, a path, query, or fragment.",
    );
  }
  return url;
}

export const siteUrl = parseSiteUrl(process.env.SITE_URL);
