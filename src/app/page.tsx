import type { Metadata } from "next";
import { siteUrl } from "@/lib/site";
import OpenRide from "@/components/OpenRide";
export const metadata: Metadata = {
  ...(siteUrl ? { alternates: { canonical: siteUrl.href } } : {}),
};

export default function Home() {
  return <OpenRide />;
}
