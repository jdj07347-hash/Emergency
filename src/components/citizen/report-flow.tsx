"use client";

import { Camera, LocateFixed, MapPin, Minus, Plus, Send, Video, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/form";
import { compressImage } from "@/lib/client/media";
import { STORAGE_BUCKET } from "@/lib/constants";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { GpsFix } from "@/lib/types";
import { validateUpload, type MediaKind } from "@/lib/uploads";
import { cn } from "@/lib/utils";
import { ProcessingScreen, type StepState } from "./processing-screen";
import { VoiceRecorder } from "./voice-recorder";

type GpsState =
  | { kind: "idle" }
  | { kind: "locating" }
  | { kind: "ok"; fix: GpsFix }
  | { kind: "error"; message: string };

interface Evidence {
  blob: Blob;
  mimeType: string;
  previewUrl: string;
  name: string;
}

export function ReportFlow() {
  const router = useRouter();
  const [gps, setGps] = useState<GpsState>({ kind: "idle" });
  const [voice, setVoice] = useState<Blob | null>(null);
  const [text, setText] = useState("");
  const [victims, setVictims] = useState<number | null>(null);
  const [image, setImage] = useState<Evidence | null>(null);
  const [video, setVideo] = useState<Evidence | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"form" | "processing">("form");
  const [steps, setSteps] = useState<StepState[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{ code: string; token: string; aiStatus: string } | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);

  useEffect(
    () => () => {
      if (image) URL.revokeObjectURL(image.previewUrl);
      if (video) URL.revokeObjectURL(video.previewUrl);
    },
    [image, video],
  );

  function locate() {
    if (!window.isSecureContext) {
      setGps({
        kind: "error",
        message: "Location only works over a secure (https://) connection. Open this page using its https:// address and try again.",
      });
      return;
    }
    if (!("geolocation" in navigator)) {
      setGps({ kind: "error", message: "This device cannot share its location. Location access is required to report an emergency." });
      return;
    }
    setGps({ kind: "locating" });
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setGps({
          kind: "ok",
          fix: {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            timestamp: pos.timestamp || Date.now(),
          },
        }),
      (err) =>
        setGps({
          kind: "error",
          message:
            err.code === err.PERMISSION_DENIED
              ? "Location access is required to report an emergency. Please allow location in your browser settings and try again."
              : err.code === err.TIMEOUT
                ? "Finding your location took too long. Move closer to a window or outdoors and try again."
                : "Your location is currently unavailable. Check that location services are turned on.",
        }),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  }

  async function pickImage(file: File | undefined) {
    setFileError(null);
    if (!file) return;
    try {
      const blob = await compressImage(file);
      const problem = validateUpload("IMAGE", "image/jpeg", blob.size);
      if (problem) return setFileError(problem);
      setImage({ blob, mimeType: "image/jpeg", previewUrl: URL.createObjectURL(blob), name: file.name });
    } catch (e) {
      setFileError((e as Error).message);
    }
  }

  function pickVideo(file: File | undefined) {
    setFileError(null);
    if (!file) return;
    const problem = validateUpload("VIDEO", file.type, file.size);
    if (problem) return setFileError(problem);
    setVideo({ blob: file, mimeType: file.type, previewUrl: URL.createObjectURL(file), name: file.name });
  }

  const canSubmit = gps.kind === "ok" && (voice !== null || text.trim().length > 0);

  function setStep(index: number, state: StepState["state"]) {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, state } : s)));
  }

  async function submit() {
    if (gps.kind !== "ok" || !canSubmit) return;
    setSubmitError(null);
    setPhase("processing");
    const files: { kind: MediaKind; blob: Blob; mimeType: string }[] = [];
    if (voice) files.push({ kind: "AUDIO", blob: voice, mimeType: "audio/wav" });
    if (image) files.push({ kind: "IMAGE", blob: image.blob, mimeType: image.mimeType });
    if (video) files.push({ kind: "VIDEO", blob: video.blob, mimeType: video.mimeType });

    setSteps([
      { label: "Location received", state: "done" },
      { label: voice ? "Voice received" : "Report received", state: "active" },
      { label: image || video ? "Evidence processed" : "Details processed", state: "pending" },
      { label: "Assessing severity", state: "pending" },
      { label: "Planning response", state: "pending" },
      { label: "Checking nearby resources", state: "pending" },
    ]);

    try {
      // 1. Upload evidence directly to Storage using server-signed URLs.
      let uploadId: string | null = null;
      const media: { kind: MediaKind; path: string; mimeType: string }[] = [];
      if (files.length) {
        const signRes = await fetch("/api/uploads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ files: files.map((f) => ({ kind: f.kind, mimeType: f.mimeType, size: f.blob.size })) }),
        });
        const signed = await signRes.json();
        if (!signRes.ok) throw new Error(signed.error ?? "Evidence upload failed.");
        const client = supabaseBrowser();
        if (!client) throw new Error("Evidence upload is not configured.");
        uploadId = signed.uploadId;
        for (const u of signed.uploads as { kind: MediaKind; path: string; token: string; mimeType: string }[]) {
          const file = files.find((f) => f.kind === u.kind)!;
          const { error } = await client.storage
            .from(STORAGE_BUCKET)
            .uploadToSignedUrl(u.path, u.token, file.blob, { contentType: u.mimeType });
          if (error) throw new Error(`Could not upload your ${u.kind.toLowerCase()}. Check your connection and try again.`);
          media.push({ kind: u.kind, path: u.path, mimeType: u.mimeType });
          if (u.kind === "AUDIO") setStep(1, "done");
        }
      }
      setStep(1, "done");
      setStep(2, "done");
      setStep(3, "active");

      // 2. Submit the report. Analysis + dispatch run server-side.
      const advance = [
        setTimeout(() => (setStep(3, "done"), setStep(4, "active")), 2600),
        setTimeout(() => (setStep(4, "done"), setStep(5, "active")), 5200),
      ];
      const res = await fetch("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: text.trim() || null,
          citizenVictims: victims,
          location: gps.fix,
          uploadId,
          media,
        }),
      });
      advance.forEach(clearTimeout);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "We could not send your emergency. Please try again.");

      setResult(body);
      if (body.aiStatus === "FAILED") {
        setSteps((prev) => prev.map((s, i) => (i >= 3 ? { ...s, state: "skipped" } : s)));
        return;
      }
      setSteps((prev) => prev.map((s) => ({ ...s, state: "done" })));
      setTimeout(() => router.push(`/track/${body.token}`), 1100);
    } catch (err) {
      setSubmitError((err as Error).message);
    }
  }

  if (phase === "processing") {
    return (
      <ProcessingScreen
        steps={steps}
        error={submitError}
        result={result}
        onRetry={() => {
          setPhase("form");
          setSubmitError(null);
        }}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-lg space-y-5 px-4 pt-5 pb-32">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Report emergency</h1>
        <p className="text-slate-500">Tell us what happened. We&apos;ll figure out the rest.</p>
      </header>

      {/* 1. Location — mandatory */}
      <LocationCard gps={gps} onLocate={locate} />

      <fieldset disabled={gps.kind !== "ok"} className={cn("space-y-5 transition-opacity", gps.kind !== "ok" && "pointer-events-none opacity-40")}>
        {/* 2. Voice */}
        <section>
          <Label>What happened?</Label>
          <VoiceRecorder onChange={setVoice} disabled={gps.kind !== "ok"} />
          <Textarea
            className="mt-3"
            placeholder="Or type it here (optional)"
            value={text}
            maxLength={2000}
            onChange={(e) => setText(e.target.value)}
          />
        </section>

        {/* 3. Victims */}
        <section>
          <Label htmlFor="victims">Approximate number of people affected</Label>
          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" size="icon" className="size-14 rounded-2xl" aria-label="Fewer" onClick={() => setVictims((v) => Math.max(0, (v ?? 1) - 1))}>
              <Minus className="size-5" />
            </Button>
            <input
              id="victims"
              inputMode="numeric"
              placeholder="?"
              value={victims ?? ""}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "").slice(0, 4);
                setVictims(digits === "" ? null : Number(digits));
              }}
              className="h-14 w-full min-w-0 rounded-2xl border border-slate-300 bg-white text-center text-2xl font-bold tabular-nums text-slate-900 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15"
            />
            <Button type="button" variant="outline" size="icon" className="size-14 rounded-2xl" aria-label="More" onClick={() => setVictims((v) => (v ?? 0) + 1)}>
              <Plus className="size-5" />
            </Button>
          </div>
        </section>

        {/* 4. Evidence */}
        <section>
          <Label>Photo or video (optional)</Label>
          <div className="grid grid-cols-2 gap-3">
            <EvidenceSlot
              icon={<Camera className="size-6" />}
              label="Add image"
              evidence={image}
              onPick={() => imageInput.current?.click()}
              onClear={() => setImage(null)}
              kind="image"
            />
            <EvidenceSlot
              icon={<Video className="size-6" />}
              label="Add video"
              evidence={video}
              onPick={() => videoInput.current?.click()}
              onClear={() => setVideo(null)}
              kind="video"
            />
          </div>
          <input ref={imageInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (pickImage(e.target.files?.[0]), (e.target.value = ""))} />
          <input ref={videoInput} type="file" accept="video/mp4,video/webm,video/quicktime" capture="environment" hidden onChange={(e) => (pickVideo(e.target.files?.[0]), (e.target.value = ""))} />
          {fileError && <p className="mt-2 text-sm text-amber-800">{fileError}</p>}
        </section>
      </fieldset>

      {/* 5. Submit — sticky for one-thumb reach */}
      <div className="fixed inset-x-0 bottom-0 z-[1000] border-t border-slate-200 bg-white/95 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto max-w-lg">
          <Button variant="emergency" size="xl" className="w-full rounded-2xl" disabled={!canSubmit} onClick={submit}>
            <Send /> SEND EMERGENCY
          </Button>
          {!canSubmit && (
            <p className="mt-2 text-center text-xs text-slate-500">
              {gps.kind !== "ok" ? "Enable location to continue" : "Record your voice or type what happened"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Fixes worse than this come from Wi-Fi/IP lookup, not GPS, and can be off by a whole city. */
const APPROXIMATE_FIX_M = 1000;

function formatAccuracy(m: number) {
  return m >= 1000 ? `±${(m / 1000).toFixed(1)} km` : `±${Math.round(m)} m`;
}

function LocationCard({ gps, onLocate }: { gps: GpsState; onLocate: () => void }) {
  if (gps.kind === "ok") {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 animate-fade-up">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-full bg-emerald-600 text-white">
            <MapPin className="size-5" />
          </span>
          <div className="flex-1">
            <p className="font-semibold text-emerald-900">✓ Location detected</p>
            <p className="text-sm text-emerald-800/80">Accuracy: {formatAccuracy(gps.fix.accuracy)}</p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onLocate}>
            Update
          </Button>
        </div>
        {gps.fix.accuracy > APPROXIMATE_FIX_M && (
          <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
            This is only an approximate location, estimated from your network rather than GPS. Turn on your device&apos;s
            location services (or use a phone) and tap Update for a precise position.
          </p>
        )}
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-slate-900 text-white">
          <LocateFixed className="size-5" />
        </span>
        <div>
          <p className="text-lg font-semibold text-slate-900">Location required</p>
          <p className="text-slate-500">Your current location is required to send the emergency.</p>
        </div>
      </div>
      {gps.kind === "error" && <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">{gps.message}</p>}
      <Button type="button" size="lg" variant="primary" className="mt-4 w-full" onClick={onLocate} disabled={gps.kind === "locating"}>
        <LocateFixed className={cn(gps.kind === "locating" && "animate-spin")} />
        {gps.kind === "locating" ? "Finding your location…" : gps.kind === "error" ? "Try again" : "Enable location"}
      </Button>
    </div>
  );
}

function EvidenceSlot({
  icon,
  label,
  evidence,
  onPick,
  onClear,
  kind,
}: {
  icon: React.ReactNode;
  label: string;
  evidence: Evidence | null;
  onPick: () => void;
  onClear: () => void;
  kind: "image" | "video";
}) {
  if (evidence) {
    return (
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-slate-200 bg-slate-900">
        {kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element -- local preview blob
          <img src={evidence.previewUrl} alt="Selected evidence" className="size-full object-cover" />
        ) : (
          <video src={evidence.previewUrl} className="size-full object-cover" muted playsInline />
        )}
        <button
          type="button"
          onClick={onClear}
          aria-label={`Remove ${kind}`}
          className="absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-black/60 text-white backdrop-blur"
        >
          <X className="size-4" />
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-white text-slate-600 transition hover:border-slate-400 hover:bg-slate-50 active:scale-[0.98]"
    >
      {icon}
      <span className="text-sm font-semibold">{label}</span>
    </button>
  );
}
