import { NextResponse } from "next/server";
import { buildToday } from "@/lib/today";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await buildToday());
}
