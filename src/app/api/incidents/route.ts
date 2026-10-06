import { NextResponse } from "next/server";
import { z } from "zod";
import { STORAGE_BUCKET } from "@/lib/constants";
import { createIncidentFromReport } from "@/lib/server/pipeline";
import { ConfigError, supabaseAdmin } from "@/lib/supabase/server";
import { MEDIA_KINDS, validateUpload } from "@/lib/uploads";

// AI analysis + dispatch run inside this request.
export const maxDuration = 60;

/**
 * Citizen report intake. The client sends only raw observations — never a
 * category, severity or priority. Those are decided server-side.
 */
const reportSchema = z.object({
  description: z
    .string()
    .max(2000)
    .nullish()
    .transform((s) => s?.trim() || null),
  citizenVictims: z.number().int().min(0).max(10000).nullable(),
  location: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracy: z.number().min(0).max(100000),
    timestamp: z.number().int().positive(),
  }),
  uploadId: z.string().uuid().nullable(),
  media: z
    .array(z.object({ kind: z.enum(MEDIA_KINDS), path: z.string().max(200), mimeType: z.string().max(100) }))
    .max(3),
});

export async function POST(request: Request) {
  const parsed = reportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "The emergency report was incomplete. Please try again." }, { status: 400 });
  }
  const report = parsed.data;

  if (!report.description && !report.media.some((m) => m.kind === "AUDIO")) {
    return NextResponse.json({ error: "Please record your voice or describe what happened." }, { status: 400 });
  }

  try {
    // Verify every referenced file is in this report's upload folder and really exists.
    const media: { kind: (typeof MEDIA_KINDS)[number]; path: string; mimeType: string; size: number }[] = [];
    if (report.media.length) {
      if (!report.uploadId) return NextResponse.json({ error: "Missing upload reference." }, { status: 400 });
      const folder = `reports/${report.uploadId}`;
      const { data: stored, error } = await supabaseAdmin().storage.from(STORAGE_BUCKET).list(folder);
      if (error) throw new Error(`list uploads: ${error.message}`);
      for (const m of report.media) {
        const name = m.path.startsWith(`${folder}/`) ? m.path.slice(folder.length + 1) : null;
        const file = name ? stored?.find((f) => f.name === name) : null;
        const size = Number(file?.metadata?.size ?? 0);
        const actualType = String(file?.metadata?.mimetype ?? m.mimeType);
        if (!file || validateUpload(m.kind, actualType, size)) {
          return NextResponse.json({ error: "An evidence file could not be verified. Please re-attach it." }, { status: 400 });
        }
        media.push({ kind: m.kind, path: m.path, mimeType: actualType, size });
      }
    }

    const created = await createIncidentFromReport({
      description: report.description,
      citizenVictims: report.citizenVictims,
      latitude: report.location.latitude,
      longitude: report.location.longitude,
      accuracy: report.location.accuracy,
      capturedAt: new Date(report.location.timestamp).toISOString(),
      media,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    console.error("[incidents]", err);
    const message =
      err instanceof ConfigError
        ? err.message
        : "We could not save your emergency report. Please try again.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
