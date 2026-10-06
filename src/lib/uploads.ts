// Upload rules shared by the browser (early feedback) and the server (enforcement).
// The Storage bucket also enforces MIME types and a hard size cap.

export const MEDIA_KINDS = ["AUDIO", "IMAGE", "VIDEO"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

const MB = 1024 * 1024;

export const UPLOAD_RULES: Record<MediaKind, { mimeTypes: string[]; maxBytes: number; label: string }> = {
  AUDIO: { mimeTypes: ["audio/wav"], maxBytes: 12 * MB, label: "voice recording" },
  IMAGE: { mimeTypes: ["image/jpeg", "image/png", "image/webp"], maxBytes: 8 * MB, label: "image" },
  VIDEO: { mimeTypes: ["video/mp4", "video/webm", "video/quicktime"], maxBytes: 40 * MB, label: "video" },
};

export const EXTENSION: Record<string, string> = {
  "audio/wav": "wav",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

export function validateUpload(kind: MediaKind, mimeType: string, size: number): string | null {
  const rule = UPLOAD_RULES[kind];
  if (!rule.mimeTypes.includes(mimeType)) {
    return `Unsupported ${rule.label} format. Allowed: ${rule.mimeTypes.map((m) => EXTENSION[m]).join(", ")}.`;
  }
  if (size <= 0) return `The ${rule.label} is empty.`;
  if (size > rule.maxBytes) return `The ${rule.label} is too large (max ${Math.round(rule.maxBytes / MB)} MB).`;
  return null;
}
