import type { Metadata } from "next";
import { ReportFlow } from "@/components/citizen/report-flow";

export const metadata: Metadata = { title: "Report emergency" };

export default function ReportPage() {
  return (
    <>
      <main className="flex-1">
        <ReportFlow />
      </main>
    </>
  );
}
