import { NextResponse } from "next/server";
import { log, store } from "@/lib/store";

export const dynamic = "force-dynamic";

/** The only place a proposal becomes an action. Agents never reach this. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { decision } = (await req.json()) as { decision: "approve" | "decline" };
  const s = store();
  const p = s.proposals.find((x) => x.id === id);
  if (!p || p.status !== "pending") return NextResponse.json({ ok: false, error: "not pending" }, { status: 409 });
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
    }
    log("rules", "action_executed", { proposalId: id, effect });
  }
  return NextResponse.json({ ok: true, status: p.status, effect });
}
