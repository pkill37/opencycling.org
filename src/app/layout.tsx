import type { Metadata, Viewport } from "next";
import "@/styles/index.css";
import { siteTitle, siteDescription, siteUrl } from "@/lib/site";

export const viewport: Viewport = { themeColor: "#172b28" };
export const metadata: Metadata = {
  ...(siteUrl ? { metadataBase: siteUrl } : {}),
  title: { default: siteTitle, template: "%s | OpenCycling.org" },
  description: siteDescription,
  applicationName: "OpenCycling.org",
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "OpenCycling.org",
    title: siteTitle,
    description: siteDescription,
    ...(siteUrl
      ? {
          url: siteUrl,
          images: [
            {
              url: "/icon.svg",
              width: 64,
              height: 64,
              alt: "OpenCycling.org logo",
            },
          ],
        }
      : {}),
  },
  twitter: {
    card: "summary",
    title: siteTitle,
    description: siteDescription,
    ...(siteUrl ? { images: ["/icon.svg"] } : {}),
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
