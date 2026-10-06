import type { IncidentMedia } from "@/lib/types";
import { cn } from "@/lib/utils";

export function VoiceReport({ media, tone = "light" }: { media: IncidentMedia[]; tone?: "light" | "dark" }) {
  const audio = media.find((m) => m.kind === "AUDIO");
  if (!audio) {
    return <p className={cn("text-sm", tone === "dark" ? "text-slate-500" : "text-slate-400")}>No voice recording.</p>;
  }
  return <audio controls preload="none" src={audio.public_url} className="h-11 w-full" />;
}

export function EvidenceGallery({ media, tone = "light" }: { media: IncidentMedia[]; tone?: "light" | "dark" }) {
  const visual = media.filter((m) => m.kind === "IMAGE" || m.kind === "VIDEO");
  if (visual.length === 0) {
    return <p className={cn("text-sm", tone === "dark" ? "text-slate-500" : "text-slate-400")}>No images or video.</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      {visual.map((m) =>
        m.kind === "IMAGE" ? (
          <a key={m.id} href={m.public_url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl">
            {/* eslint-disable-next-line @next/next/no-img-element -- user evidence from Storage */}
            <img src={m.public_url} alt="Scene evidence" className="aspect-video w-full object-cover transition hover:scale-105" />
          </a>
        ) : (
          <video key={m.id} src={m.public_url} controls preload="metadata" className="aspect-video w-full rounded-xl bg-black" />
        ),
      )}
    </div>
  );
}
