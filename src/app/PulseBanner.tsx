"use client";

import { useEffect, useState } from "react";

/**
 * One notice at a time, at the top, every twenty seconds. The lines come from
 * /api/pulse so the phone and this page say the same thing; this component
 * only paces and shows them. Dismissing hides the current one; the next still
 * arrives, because a pulse that stops is a page that looks dead.
 */
type Notice = { id: string; kind: string; text: string };

const ICON: Record<string, string> = { crew: "👥", body: "🏋️", bus: "🚈", quest: "⭐", life: "🧺", streak: "🔥", learn: "📖" };

export default function PulseBanner() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [every, setEvery] = useState(20);
  const [i, setI] = useState(0);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    fetch("/api/pulse")
      .then((r) => r.json())
      .then((j) => {
        setNotices(j.notices ?? []);
        setEvery(j.everySeconds ?? 20);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (notices.length === 0) return;
    const id = setInterval(() => {
      setI((x) => (x + 1) % notices.length);
      setHidden(false);
    }, every * 1000);
    return () => clearInterval(id);
  }, [notices, every]);

  const n = notices[i];
  if (!n || hidden) return null;

  return (
    <div
      key={n.id}
      role="status"
      aria-live="polite"
      className="pulse-in md:col-span-3 flex items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm shadow-sm"
    >
      <span aria-hidden className="text-base leading-5">{ICON[n.kind] ?? "•"}</span>
      <span className="flex-1 break-words text-ink">{n.text}</span>
      <button onClick={() => setHidden(true)} aria-label="Dismiss" className="-mr-1 min-h-11 rounded-full px-2 text-ink-3 hover:text-ink">
        ×
      </button>
    </div>
  );
}
