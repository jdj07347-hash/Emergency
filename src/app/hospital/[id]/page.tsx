import type { Metadata } from "next";
import { HospitalDashboard } from "@/components/hospital/hospital-dashboard";
import { requireHospital } from "@/lib/server/demo-auth";
import { getHospitalView } from "@/lib/server/queries";

export const metadata: Metadata = { title: "Hospital" };

export default async function HospitalPage({ params }: PageProps<"/hospital/[id]">) {
  const { id } = await params;
  const hospital = await requireHospital(id);
  const bundles = await getHospitalView(hospital.id);
  return <HospitalDashboard hospital={hospital} bundles={bundles} number={id} />;
}
