import type { Metadata, Viewport } from "next";
import "@/styles/index.css";
import { siteTitle, siteDescription, siteUrl } from "@/lib/site";

export const viewport: Viewport = { themeColor: "#172b28" };
export const metadata: Metadata = {
  ...(siteUrl ? { metadataBase: siteUrl } : {}),
  title: { default: siteTitle, template: "%s | OpenRide" },
  description: siteDescription,
  applicationName: "OpenRide",
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "OpenRide",
    title: siteTitle,
    description: siteDescription,
    ...(siteUrl
      ? {
          url: siteUrl,
          images: [
            {
              url: "/cedar-valley.webp",
              width: 1440,
              height: 1000,
              alt: "Illustrative virtual cycling landscape",
            },
          ],
        }
      : {}),
  },
  twitter: {
    card: siteUrl ? "summary_large_image" : "summary",
    title: siteTitle,
    description: siteDescription,
    ...(siteUrl ? { images: ["/cedar-valley.webp"] } : {}),
  },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
