import type { Metadata } from "next";
import OpenRide from "@/components/OpenRide";
export const metadata: Metadata = {
  title: "Set up a ride",
  description:
    "Choose a route, review its data and dynamics, and connect your smart trainer or keyboard simulator.",
  robots: { index: false, follow: true },
};

export default function Ride() {
  return <OpenRide initialSetup />;
}
