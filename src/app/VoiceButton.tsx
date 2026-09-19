"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Line = { role: "you" | "orbit"; text: string };

/**
 * Push to talk, not always listening. A judging room is loud and an agent that
 * reacts to the next table is worse than no agent.
 *
 * The transcript is on screen because voice with no visible consequence is
 * just a chatbot: when the student says "I'm in crisis mode", the cards behind
 * this have to change while the agent is still speaking.
 */
export default function VoiceButton({ onChange }: { onChange?: () => void }) {
  const [state, setState] = useState<"idle" | "connecting" | "live" | "unavailable">("idle");
  const [lines, setLines] = useState<Line[]>([]);
  const [note, setNote] = useState("");
  const [briefing, setBriefing] = useState("");
  const conv = useRef<{ endSession: () => Promise<void> } | null>(null);

  useEffect(() => {
    fetch("/api/voice/token")
      .then((r) => r.json())
      .then((d) => {
        setBriefing(d.briefing ?? "");
        if (!d.token) { setState("unavailable"); setNote(d.reason ?? "voice not configured"); }
      })
      .catch(() => { setState("unavailable"); setNote("cannot reach the server"); });
  }, []);

  const stop = useCallback(async () => {
    await conv.current?.endSession().catch(() => {});
    conv.current = null;
    setState("idle");
    onChange?.();
  }, [onChange]);

  const start = useCallback(async () => {
    setState("connecting");
    setLines([]);
    try {
      const { token, reason } = await fetch("/api/voice/token").then((r) => r.json());
      if (!token) { setState("unavailable"); setNote(reason ?? "voice not configured"); return; }

      await navigator.mediaDevices.getUserMedia({ audio: true });
      const { Conversation } = await import("@elevenlabs/client");

      conv.current = await Conversation.startSession({
        conversationToken: token,
        connectionType: "webrtc",
        onConnect: () => setState("live"),
        onDisconnect: () => { setState("idle"); onChange?.(); },
        onError: (e: unknown) => { setNote(String(e)); setState("idle"); },
        onMessage: ({ message, source }: { message: string; source: string }) => {
          setLines((l) => [...l.slice(-8), { role: source === "user" ? "you" : "orbit", text: message }]);
          // Anything the agent did lands in the app, so refresh what is on screen.
          if (source !== "user") setTimeout(() => onChange?.(), 400);
        },
      });
    } catch (e) {
      setState("idle");
      setNote(e instanceof DOMException ? "microphone permission denied" : String(e));
    }
  }, [onChange]);

  const live = state === "live";

  return (
    <section className="rounded-2xl border p-5 md:col-span-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={live || state === "connecting" ? stop : start}
          disabled={state === "unavailable"}
          className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition disabled:opacity-40 ${
            live ? "bg-red-600 text-white" : "bg-zinc-900 text-white hover:bg-zinc-700"
          }`}
        >
          <span className={`h-2 w-2 rounded-full bg-white ${live ? "animate-pulse" : ""}`} />
          {state === "connecting" ? "Connecting…" : live ? "Stop listening" : "Talk to Orbit"}
        </button>

        <p className="text-xs text-zinc-500">
          {state === "unavailable"
            ? `Voice is off: ${note}. The briefing below is the same text it would read.`
            : live
              ? "Try: “the problem set took ninety-five minutes”, “when do I leave for class”, “I'm in crisis mode”."
              : "Push to talk. It only listens while this is on."}
        </p>
      </div>

      {note && state !== "unavailable" && <p className="mt-2 text-xs text-red-600">{note}</p>}

      {lines.length > 0 ? (
        <ol className="mt-3 space-y-1.5 text-sm">
          {lines.map((l, i) => (
            <li key={i} className={l.role === "you" ? "text-zinc-500" : "font-medium text-zinc-900"}>
              <span className="mr-2 text-[10px] uppercase tracking-wide text-zinc-400">{l.role}</span>
              {l.text}
            </li>
          ))}
        </ol>
      ) : (
        briefing && <p className="mt-3 border-l-2 border-zinc-200 pl-3 text-sm italic text-zinc-600">{briefing}</p>
      )}
    </section>
  );
}
