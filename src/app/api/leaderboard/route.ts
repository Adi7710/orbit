import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { rankBoard, standingOf, withShare } from "@/core/game";

export const dynamic = "force-dynamic";

/**
 * GET /api/leaderboard            -> everyone
 * GET /api/leaderboard?group=...  -> one group
 *
 * `me` is where the signed-in student stands and the two gaps that make it a
 * race, computed on the server so no client subtracts XP totals. `share` on
 * each row is that row against the leader, for a bar. `groups` is what the
 * client may filter by. Nothing here says who did badly.
 */
export async function GET(req: Request) {
  const s = store();
  const group = new URL(req.url).searchParams.get("group") ?? undefined;
  const rows = withShare(rankBoard(s.board, group));
  const groups = [...new Set(s.board.map((r) => r.group).filter((g): g is string => !!g))].sort();
  return NextResponse.json({ rows, me: standingOf(s.board, s.user.id, group), groups, group: group ?? null });
}
