import { NextResponse } from "next/server";
import { criticReset, rewardLedger } from "@/agents/critic";

export const dynamic = "force-dynamic";

/** GET: the reward ledger, worst-scoring behaviour first. POST { action: "reset" }. */
export async function GET() {
  return NextResponse.json(rewardLedger());
}

export async function POST(req: Request) {
  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  if (action === "reset") criticReset();
  return NextResponse.json(rewardLedger());
}
