"use client";

import { Mic, RotateCcw, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { recordingToWav } from "@/lib/client/media";
import { cn } from "@/lib/utils";

const MAX_SECONDS = 120;
const HOLD_THRESHOLD_MS = 600;
const BARS = 28;

type State =
  | { kind: "idle" }
  | { kind: "requesting" }
  | { kind: "recording"; startedAt: number }
  | { kind: "processing" }
  | { kind: "ready"; url: string; seconds: number }
  | { kind: "error"; message: string };

function pickMimeType() {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return candidates.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t));
}

/**
 * Tap to start/stop, or press-and-hold to talk (release to stop).
 * Produces a WAV blob via onChange; null when cleared.
 */
export function VoiceRecorder({ onChange, disabled }: { onChange: (wav: Blob | null) => void; disabled?: boolean }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0.08));
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const raf = useRef<number | null>(null);
  const pressStart = useRef(0);
  const urlRef = useRef<string | null>(null);

  const cleanup = () => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void audioCtx.current?.close().catch(() => {});
    audioCtx.current = null;
  };

  useEffect(
    () => () => {
      cleanup();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  // Elapsed timer + auto-stop.
  useEffect(() => {
    if (state.kind !== "recording") return;
    const id = setInterval(() => {
      const s = Math.floor((Date.now() - state.startedAt) / 1000);
      setElapsed(s);
      if (s >= MAX_SECONDS) stop();
    }, 250);
    return () => clearInterval(id);
  }, [state]);

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setState({ kind: "error", message: "Voice recording isn't supported in this browser. Please type what happened instead." });
      return;
    }
    setState({ kind: "requesting" });
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      stream.current = media;

      // Live level meter.
      const ctx = new AudioContext();
      audioCtx.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      ctx.createMediaStreamSource(media).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      let last = 0;
      const tick = (t: number) => {
        if (t - last > 60) {
          last = t;
          analyser.getByteFrequencyData(data);
          setLevels(Array.from({ length: BARS }, (_, i) => Math.max(0.08, data[i % data.length] / 255)));
        }
        raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);

      const mimeType = pickMimeType();
      const rec = new MediaRecorder(media, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      const startedAt = Date.now();
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = async () => {
        cleanup();
        const seconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
        setState({ kind: "processing" });
        try {
          const raw = new Blob(chunks, { type: rec.mimeType || mimeType || "audio/webm" });
          if (raw.size === 0) throw new Error("empty");
          const wav = await recordingToWav(raw);
          if (urlRef.current) URL.revokeObjectURL(urlRef.current);
          urlRef.current = URL.createObjectURL(wav);
          setState({ kind: "ready", url: urlRef.current, seconds });
          onChange(wav);
        } catch {
          setState({ kind: "error", message: "The recording could not be processed. Please try again or type instead." });
          onChange(null);
        }
      };
      recorder.current = rec;
      rec.start(250);
      setElapsed(0);
      setState({ kind: "recording", startedAt });
    } catch (err) {
      cleanup();
      const denied = (err as DOMException)?.name === "NotAllowedError";
      setState({
        kind: "error",
        message: denied
          ? "Microphone access was blocked. Allow the microphone in your browser settings, or type what happened below."
          : "No microphone was found. Please type what happened below.",
      });
    }
  }

  function stop() {
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
    recorder.current = null;
  }

  function reset() {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    onChange(null);
    setState({ kind: "idle" });
  }

  const onPointerDown = () => {
    if (disabled) return;
    pressStart.current = Date.now();
    if (state.kind === "idle" || state.kind === "error") void start();
    else if (state.kind === "recording") stop();
  };
  const onPointerUp = () => {
    // Held long enough → push-to-talk; release stops recording.
    if (state.kind === "recording" || state.kind === "requesting") {
      if (Date.now() - pressStart.current > HOLD_THRESHOLD_MS && pressStart.current > 0) stop();
    }
    pressStart.current = 0;
  };

  const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  if (state.kind === "ready") {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="flex items-center gap-2 font-semibold text-emerald-800">
            <span className="grid size-6 place-items-center rounded-full bg-emerald-600 text-xs text-white">✓</span>
            Voice captured · {mmss(state.seconds)}
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={reset} disabled={disabled}>
            <RotateCcw /> Record again
          </Button>
        </div>
        <audio src={state.url} controls className="h-11 w-full" />
      </div>
    );
  }

  const recording = state.kind === "recording";
  return (
    <div className={cn("rounded-2xl border p-4 transition-colors", recording ? "border-red-200 bg-red-50/50" : "border-slate-200 bg-white")}>
      <div className="flex items-center gap-4">
        <button
          type="button"
          disabled={disabled || state.kind === "processing"}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onContextMenu={(e) => e.preventDefault()}
          aria-label={recording ? "Stop recording" : "Start recording"}
          className={cn(
            "grid size-20 shrink-0 touch-none place-items-center rounded-full text-white shadow-lg transition-all select-none active:scale-95 disabled:opacity-50",
            recording ? "bg-red-600 animate-pulse-ring" : "bg-slate-900 hover:bg-slate-800",
          )}
        >
          {recording ? <Square className="size-7 fill-current" /> : <Mic className="size-8" />}
        </button>
        <div className="min-w-0 flex-1">
          {recording ? (
            <>
              <div className="flex items-baseline gap-2">
                <span className="size-2.5 animate-pulse rounded-full bg-red-600" />
                <span className="font-semibold text-red-700">Recording</span>
                <span className="ml-auto font-mono text-lg font-semibold tabular-nums text-slate-900">{mmss(elapsed)}</span>
              </div>
              <div className="mt-2 flex h-10 items-center gap-[3px]" aria-hidden>
                {levels.map((l, i) => (
                  <span key={i} className="w-full rounded-full bg-red-500/80 transition-[height] duration-75" style={{ height: `${Math.round(l * 100)}%` }} />
                ))}
              </div>
              <p className="mt-1 text-xs text-slate-500">Tap to stop · or release if holding</p>
            </>
          ) : state.kind === "processing" ? (
            <p className="font-semibold text-slate-700">Processing recording…</p>
          ) : state.kind === "requesting" ? (
            <p className="font-semibold text-slate-700">Waiting for microphone permission…</p>
          ) : (
            <>
              <p className="text-lg font-semibold text-slate-900">Tap or hold to speak</p>
              <p className="text-sm text-slate-500">Describe what happened, where, and who is hurt.</p>
            </>
          )}
        </div>
      </div>
      {state.kind === "error" && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{state.message}</p>}
    </div>
  );
}
