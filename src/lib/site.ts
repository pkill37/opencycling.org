export const siteTitle = "Free Indoor Bike Training | OpenCycling.org";
export const siteDescription =
  "Free indoor bike training in your browser: an open-source Zwift alternative with French routes, Bluetooth smart trainer support, and no account or subscription.";

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
