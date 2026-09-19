import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { rankBoard } from "@/core/game";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const group = new URL(req.url).searchParams.get("group") ?? undefined;
  return NextResponse.json({ rows: rankBoard(store().board, group) });
}
