import { NextResponse } from "next/server";
import { log, store } from "@/lib/store";

export const dynamic = "force-dynamic";

/** The only place a proposal becomes an action. Agents never reach this. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { decision, edit } = (await req.json()) as { decision: "approve" | "decline"; edit?: { to?: string; subject?: string; body?: string } };
  const s = store();
  const p = s.proposals.find((x) => x.id === id);
  if (!p || p.status !== "pending") return NextResponse.json({ ok: false, error: "not pending" }, { status: 409 });

  // The student's edits replace the agent's draft before anything is recorded,
  // so the log reflects what they actually sent and not what we suggested.
  // Only an email can be edited: the others are structured actions, not prose.
  if (edit && p.proposal.kind === "send_email") {
    if (edit.to?.trim()) p.proposal.to = edit.to.trim();
    if (edit.subject?.trim()) p.proposal.subject = edit.subject.trim();
    if (edit.body?.trim()) p.proposal.body = edit.body;
    log("user", "email_edited", { proposalId: id, edited: Object.keys(edit) });
  }
  p.status = decision === "approve" ? "approved" : "declined";
  p.resolvedAt = new Date().toISOString();
  log("user", `proposal_${p.status}`, p.proposal);

  let effect: string | undefined;
  if (decision === "approve") {
    switch (p.proposal.kind) {
      case "book_room":
        effect = `Reserved a room in ${p.proposal.building} (mock booking #${Math.floor(Math.random() * 9000 + 1000)})`;
        break;
      case "move_task":
        effect = `Placed task ${p.proposal.taskId} into ${p.proposal.gapId}`;
        break;
      case "draft_extension":
        effect = `Sent extension request to ${p.proposal.to} (mock send)`;
        break;
      case "notify_friends":
        effect = `Invited ${p.proposal.userIds.join(", ")} (mock push)`;
        break;
      // Approval does not send. Orbit holds no mailbox credential and has no
      // way to send on the student's behalf; it hands the finished message to
      // their own mail client, from their own address, and they press send.
      // The last approval is a human one that nobody can accidentally skip.
      case "send_email":
        effect = `Opening your mail client with the message to ${p.proposal.to} ready to send`;
        break;
    }
    log("rules", "action_executed", { proposalId: id, effect });
  }
  return NextResponse.json({ ok: true, status: p.status, effect });
}
