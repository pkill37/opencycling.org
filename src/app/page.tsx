import type { Metadata } from "next";
import { siteDescription, siteUrl } from "@/lib/site";
import OpenRide from "@/components/OpenRide";
export const metadata: Metadata = {
  ...(siteUrl ? { alternates: { canonical: siteUrl.href } } : {}),
};

export default function Home() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      ...(siteUrl
        ? [{ "@type": "WebSite", name: "OpenCycling.org", url: siteUrl.href }]
        : []),
      {
        "@type": "WebApplication",
        name: "OpenCycling.org",
        description: siteDescription,
        applicationCategory: "GameApplication",
        operatingSystem: "Web browser",
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        browserRequirements: "Requires JavaScript and WebGL",
        ...(siteUrl ? { url: siteUrl.href } : {}),
      },
    ],
  };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
        }}
      />
      <OpenRide />
    </>
  );
}
