"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Line = { role: "you" | "orbit"; text: string };
type Conv = { endSession: () => Promise<void>; setMicMuted: (muted: boolean) => void };

/**
 * Push to talk, genuinely this time.
 *
 * The first version connected a session and left the microphone open until you
 * pressed stop, which meant Orbit heard every side conversation in the room and
 * answered things nobody had asked it. Now the session stays connected -- that
 * is what keeps replies fast and lets you talk over it -- but the microphone is
 * muted between turns and only opens while you are holding the button or the
 * spacebar. Silence is the resting state.
 *
 * Holding while it is still speaking is how you interrupt it, which is the one
 * always-listening behaviour worth keeping: a friend you cannot talk over is
 * not a friend, it is a voicemail.
 *
 * Hands-free is still there for the demo, where holding a button while pointing
 * at the screen is awkward.
 *
 * The transcript is on screen because voice with no visible consequence is
 * just a chatbot: when the student says "I'm in crisis mode", the cards behind
 * this have to change while the agent is still speaking.
 */
export default function VoiceButton({ onChange, voiceActive }: { onChange?: () => void; voiceActive?: (live: boolean) => void }) {
  const [state, setState] = useState<"idle" | "connecting" | "live" | "unavailable">("idle");
  const [lines, setLines] = useState<Line[]>([]);
  const [note, setNote] = useState("");
  const [briefing, setBriefing] = useState("");
  const [handsFree, setHandsFree] = useState(false);
  const [micOpen, setMicOpen] = useState(false);
  // Orbit is an iOS app first, so the spacebar is a desktop convenience, not
  // the affordance. Only offer it where a keyboard actually exists, and never
  // let the on-screen copy tell a phone user to hold a key they do not have.
  const [hasKeyboard, setHasKeyboard] = useState(false);
  const conv = useRef<Conv | null>(null);

  useEffect(() => {
    setHasKeyboard(window.matchMedia("(pointer: fine)").matches);
  }, []);

  useEffect(() => {
    fetch("/api/voice/token")
      .then((r) => r.json())
      .then((d) => {
        setBriefing(d.briefing ?? "");
        if (!d.token) { setState("unavailable"); setNote(d.reason ?? "voice not configured"); }
      })
      .catch(() => { setState("unavailable"); setNote("cannot reach the server"); });
  }, []);

  const setMic = useCallback((open: boolean) => {
    try { conv.current?.setMicMuted(!open); } catch { /* session may have ended under us */ }
    setMicOpen(open);
  }, []);

  const stop = useCallback(async () => {
    await conv.current?.endSession().catch(() => {});
    conv.current = null;
    setMicOpen(false);
    setState("idle");
    voiceActive?.(false);
    onChange?.();
  }, [onChange, voiceActive]);

  const start = useCallback(async () => {
    setState("connecting");
    setLines([]);
    try {
      const { token, reason, greeting } = await fetch("/api/voice/token").then((r) => r.json());
      if (!token) { setState("unavailable"); setNote(reason ?? "voice not configured"); return; }

      await navigator.mediaDevices.getUserMedia({ audio: true });
      const { Conversation } = await import("@elevenlabs/client");

      conv.current = (await Conversation.startSession({
        conversationToken: token,
        connectionType: "webrtc",
        // The agent's own first_message is static and cannot know the student's
        // name or their day. This replaces it with a line composed on the
        // server, which is why the opening can greet you by name and still
        // quote a real number. The agent has first_message overrides enabled;
        // if that is ever turned off, the static greeting is used instead and
        // nothing breaks.
        ...(greeting ? { overrides: { agent: { firstMessage: greeting } } } : {}),
        onConnect: () => {
          setState("live");
          // The page polls for a drafted email while a call is live, so it can
          // open the draft window before the agent has finished speaking.
          voiceActive?.(true);
          // Muted the moment we are connected, before anyone says anything near it.
          if (!handsFree) { try { conv.current?.setMicMuted(true); } catch {} setMicOpen(false); }
          else setMicOpen(true);
        },
        onDisconnect: () => { setState("idle"); setMicOpen(false); voiceActive?.(false); onChange?.(); },
        onError: (e: unknown) => { setNote(String(e)); setState("idle"); },
        onMessage: ({ message, source }: { message: string; source: string }) => {
          setLines((l) => [...l.slice(-8), { role: source === "user" ? "you" : "orbit", text: message }]);
          // Anything the agent did lands in the app, so refresh what is on screen.
          if (source !== "user") setTimeout(() => onChange?.(), 400);
        },
      })) as unknown as Conv;
    } catch (e) {
      setState("idle");
      setNote(e instanceof DOMException ? "microphone permission denied" : String(e));
    }
  }, [onChange, handsFree, voiceActive]);

  const live = state === "live";

  // Spacebar is the same button. Held, not toggled, and ignored while typing.
  useEffect(() => {
    if (!live || handsFree || !hasKeyboard) return;
    const typing = (t: EventTarget | null) => t instanceof HTMLElement && /^(INPUT|TEXTAREA)$/.test(t.tagName);
    const down = (e: KeyboardEvent) => { if (e.code === "Space" && !e.repeat && !typing(e.target)) { e.preventDefault(); setMic(true); } };
    const up = (e: KeyboardEvent) => { if (e.code === "Space" && !typing(e.target)) { e.preventDefault(); setMic(false); } };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    // If the tab loses focus mid-hold the keyup never arrives, so close the mic.
    const blur = () => setMic(false);
    window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); };
  }, [live, handsFree, hasKeyboard, setMic]);

  // Always-on safety close, phone included. The blur handler above only exists
  // where there is a keyboard, so without this a call that backgrounds mid-hold
  // on iOS -- a notification, the lock button, switching apps -- would come back
  // with the mic still open. Runs in hands-free too: leaving the app is a clear
  // signal to stop listening.
  useEffect(() => {
    if (!live) return;
    const close = () => { if (document.visibilityState === "hidden") setMic(false); };
    document.addEventListener("visibilitychange", close);
    window.addEventListener("pagehide", () => setMic(false));
    return () => { document.removeEventListener("visibilitychange", close); };
  }, [live, setMic]);

  const toggleHandsFree = () => {
    const next = !handsFree;
    setHandsFree(next);
    if (live) setMic(next);
  };

  return (
    <section className="rounded-2xl border p-5 md:col-span-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={live || state === "connecting" ? stop : start}
          disabled={state === "unavailable"}
          className={`flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-medium transition disabled:opacity-40 ${
            live ? "bg-danger text-white" : "bg-primary text-white hover:bg-primary"
          }`}
        >
          <span aria-hidden="true" className={`h-2 w-2 rounded-full bg-background ${live ? "animate-pulse" : ""}`} />
          {state === "connecting" ? "Connecting…" : live ? "End call" : "Talk to Orbit"}
        </button>

        {live && !handsFree && (
          <button
            onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); setMic(true); }}
            onPointerUp={() => setMic(false)}
            // iOS fires pointercancel when the system takes the touch away --
            // a scroll, a notification, the app backgrounding. Without this the
            // mic stays open with the button looking idle, which is the exact
            // always-listening behaviour push-to-talk exists to remove.
            onPointerCancel={() => setMic(false)}
            onPointerLeave={() => micOpen && setMic(false)}
            onContextMenu={(e) => e.preventDefault()}
            // touch-action stops the hold turning into a page scroll, and the
            // callout/selection rules stop iOS offering to copy the label.
            style={{ touchAction: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
            className={`select-none rounded-full px-6 py-3 text-sm font-medium transition ${
              micOpen ? "bg-build text-white shadow-inner" : "border border-line text-ink hover:border-line"
            }`}
          >
            {micOpen ? "Listening — release to send" : hasKeyboard ? "Hold to talk  (or hold space)" : "Hold to talk"}
          </button>
        )}

        {live && (
          <label className="flex min-h-11 cursor-pointer items-center gap-1.5 text-xs text-ink-2">
            <input type="checkbox" checked={handsFree} onChange={toggleHandsFree} className="accent-zinc-900" />
            hands-free
          </label>
        )}

        <p className="text-xs text-ink-2">
          {state === "unavailable"
            ? `Voice is off: ${note}. The briefing below is the same text it would read.`
            : live
              ? handsFree
                ? "Open mic. It hears everything in the room, including the next table."
                : "It only hears you while you are holding. Hold while it talks to cut in."
              : "Push to talk. The mic stays shut between turns."}
        </p>
      </div>

      {note && state !== "unavailable" && <p role="alert" className="mt-2 text-xs break-words text-danger">{note}</p>}

      {lines.length > 0 ? (
        <ol className="mt-3 space-y-1.5 text-sm">
          {lines.map((l, i) => (
            <li key={i} className={`break-words ${l.role === "you" ? "text-ink-2" : "font-medium text-ink"}`}>
              <span className="mr-2 text-[10px] uppercase tracking-wide text-ink-2">{l.role}</span>
              {l.text}
            </li>
          ))}
        </ol>
      ) : (
        briefing && <p className="mt-3 border-l-2 border-line pl-3 text-sm break-words italic text-ink-2">{briefing}</p>
      )}
    </section>
  );
}
