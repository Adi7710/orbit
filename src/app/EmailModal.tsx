"use client";

import { useEffect, useRef, useState } from "react";

type Pending = { id: string; proposal: { kind: string; to?: string; subject?: string; body?: string; courseCode?: string; reason?: string } };

/**
 * The draft window.
 *
 * It opens by itself the moment the Email Agent writes something, because the
 * alternative — a card somewhere below the fold — means that after talking to
 * Orbit you have to go hunting for the thing you just asked it to write. A
 * letter to your professor is not a notification.
 *
 * Everything in it is editable. The agent's draft is a starting point, not a
 * finished document, and the student's name is on the bottom of it.
 *
 * `mailto:` and the Outlook Web deeplink both hand the message to the
 * student's own mail client, from their own address. Orbit never holds a
 * mailbox credential and cannot send anything itself; the send button is in
 * Outlook, where it belongs.
 */
export default function EmailModal({ pending, onDone }: { pending?: Pending; onDone?: () => void }) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  const opened = useRef<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Load a new draft once. Re-loading on every poll would wipe the student's
  // edits from under them every few seconds.
  useEffect(() => {
    if (!pending || opened.current === pending.id) return;
    opened.current = pending.id;
    setTo(pending.proposal.to ?? "");
    setSubject(pending.proposal.subject ?? "");
    setBody(pending.proposal.body ?? "");
    setSaved("");
  }, [pending]);

  const close = async (decision: "approve" | "decline") => {
    if (!pending) return;
    setBusy(true);
    await fetch(`/api/proposals/${pending.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, edit: { to, subject, body } }),
    }).catch(() => {});
    setBusy(false);
    onDone?.();
  };

  if (!pending) return null;

  const synthetic = /@example\.edu$/i.test(to.trim());
  const enc = (s: string) => encodeURIComponent(s).replace(/%0A/g, "%0D%0A");
  const mailto = `mailto:${encodeURIComponent(to)}?subject=${enc(subject)}&body=${enc(body)}`;
  const outlook = `https://outlook.office.com/mail/deeplink/compose?${new URLSearchParams({ to, subject, body }).toString()}`;

  const open = (href: string) => {
    window.open(href, href.startsWith("mailto:") ? "_self" : "_blank", "noopener");
    void close("approve");
  };

  const saveAddress = async () => {
    if (!pending.proposal.courseCode) return;
    const r = await fetch("/api/email/roster", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseCode: pending.proposal.courseCode, email: to }),
    }).then((x) => x.json()).catch(() => ({ ok: false }));
    setSaved(r.ok ? `Saved for ${pending.proposal.courseCode}` : r.error ?? "could not save");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Email draft">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Orbit wrote this for you</h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              {pending.proposal.reason}. Edit anything — nothing has been sent.
            </p>
          </div>
          <button onClick={() => close("decline")} disabled={busy} className="rounded-full px-2 text-lg leading-none text-zinc-400 hover:text-zinc-900" aria-label="Discard">×</button>
        </div>

        <label className="mt-4 block text-[11px] font-medium uppercase tracking-wide text-zinc-400">To</label>
        <div className="mt-1 flex flex-wrap gap-2">
          <input value={to} onChange={(e) => setTo(e.target.value)} className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm" aria-label="Recipient" />
          <button onClick={saveAddress} className="rounded-full border px-3 py-1.5 text-xs text-zinc-600 hover:border-zinc-400">Remember for this course</button>
        </div>
        {synthetic && (
          <p className="mt-1.5 text-xs text-amber-700">
            This is a sample address on <code>example.edu</code> and cannot receive mail. Put a real one in to actually send — your own address is the safest way to test.
          </p>
        )}
        {saved && <p className="mt-1.5 text-xs text-emerald-700">{saved}</p>}

        <label className="mt-3 block text-[11px] font-medium uppercase tracking-wide text-zinc-400">Subject</label>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" aria-label="Subject" />

        <label className="mt-3 block text-[11px] font-medium uppercase tracking-wide text-zinc-400">Message</label>
        <textarea
          ref={bodyRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={11}
          className="mt-1 w-full resize-y rounded-xl border px-3 py-2 font-sans text-sm leading-relaxed"
          aria-label="Message body"
        />

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button onClick={() => open(outlook)} disabled={busy || !to.trim()} className="rounded-full bg-[#0f6cbd] px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
            Open in Outlook
          </button>
          <button onClick={() => open(mailto)} disabled={busy || !to.trim()} className="rounded-full border px-4 py-2 text-sm hover:border-zinc-400 disabled:opacity-40">
            Open in mail app
          </button>
          <button
            onClick={() => { void navigator.clipboard?.writeText(`To: ${to}\nSubject: ${subject}\n\n${body}`).then(() => setSaved("Copied")).catch(() => setSaved("could not copy")); }}
            className="rounded-full border px-4 py-2 text-sm hover:border-zinc-400"
          >
            Copy
          </button>
          <button onClick={() => close("decline")} disabled={busy} className="ml-auto text-sm text-zinc-500 hover:text-zinc-900">Discard</button>
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-zinc-400">
          Orbit holds no mailbox credential and cannot send on your behalf. Both buttons open the message in your own client, from your own address, with Send still yours to press.
        </p>
      </div>
    </div>
  );
}
