import type { Metadata } from "next";
import OpenRide from "@/components/OpenRide";
export const metadata: Metadata = {
  title: "Ride Cedar Valley",
  description:
    "Set up your smart trainer or keyboard simulator and start your Cedar Valley ride.",
  robots: { index: false, follow: true },
};

export default function Ride() {
  return <OpenRide initialSetup />;
}
