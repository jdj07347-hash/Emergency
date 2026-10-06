import type { Metadata } from "next";
import { ControlCenter } from "@/components/control/control-center";
import { requireControl } from "@/lib/server/demo-auth";
import { getRecentBundles, listHospitals, listResponders } from "@/lib/server/queries";

export const metadata: Metadata = { title: "Live Command Center" };

// Manual assessment runs dispatch + hospital coordination inside a Server Action.
export const maxDuration = 60;

export default async function ControlPage() {
  await requireControl();
  const [bundles, responders, hospitals] = await Promise.all([getRecentBundles(), listResponders(), listHospitals()]);
  return <ControlCenter bundles={bundles} responders={responders} hospitals={hospitals} />;
}
