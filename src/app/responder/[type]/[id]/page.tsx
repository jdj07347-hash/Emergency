import type { Metadata } from "next";
import { ResponderDashboard } from "@/components/responder/responder-dashboard";
import { requireResponder } from "@/lib/server/demo-auth";
import { getResponderView } from "@/lib/server/queries";

export const metadata: Metadata = { title: "Responder" };

export default async function ResponderPage({ params }: PageProps<"/responder/[type]/[id]">) {
  const { type, id } = await params;
  const responder = await requireResponder(type, id);
  const bundles = await getResponderView(responder.id);
  return <ResponderDashboard responder={responder} bundles={bundles} typeSlug={type.toLowerCase()} number={id} />;
}
