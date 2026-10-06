import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { STORAGE_BUCKET } from "@/lib/constants";
import { ConfigError, supabaseAdmin } from "@/lib/supabase/server";
import { EXTENSION, MEDIA_KINDS, validateUpload } from "@/lib/uploads";

/**
 * Issue signed upload URLs so evidence goes straight from the browser to
 * Supabase Storage (avoids serverless body-size limits). Type and size are
 * validated here and enforced again by the bucket configuration.
 */
const bodySchema = z.object({
  files: z
    .array(z.object({ kind: z.enum(MEDIA_KINDS), mimeType: z.string().max(100), size: z.number().int() }))
    .min(1)
    .max(3)
    .refine((files) => new Set(files.map((f) => f.kind)).size === files.length, "One file per kind"),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid upload request." }, { status: 400 });

  for (const f of parsed.data.files) {
    const problem = validateUpload(f.kind, f.mimeType, f.size);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  }

  try {
    const uploadId = randomUUID();
    const storage = supabaseAdmin().storage.from(STORAGE_BUCKET);
    const uploads = await Promise.all(
      parsed.data.files.map(async (f) => {
        const path = `reports/${uploadId}/${f.kind.toLowerCase()}.${EXTENSION[f.mimeType]}`;
        const { data, error } = await storage.createSignedUploadUrl(path);
        if (error || !data) throw new Error(error?.message ?? "could not sign upload");
        return { kind: f.kind, path, token: data.token, mimeType: f.mimeType };
      }),
    );
    return NextResponse.json({ uploadId, uploads });
  } catch (err) {
    console.error("[uploads]", err);
    const message = err instanceof ConfigError ? err.message : "Evidence upload is temporarily unavailable.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
