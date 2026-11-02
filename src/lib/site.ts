export const siteTitle =
  "OpenCycling.org — Free Virtual Cycling & Indoor Training";
export const siteDescription =
  "Free, open source virtual cycling in your browser. Ride Alpe d’Huez, Paris or Marseille with a Bluetooth smart trainer, or try the keyboard simulator.";

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
