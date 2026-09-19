import { NextResponse } from "next/server";
import { availableModels, pickModel, NEMOTRON_PARSE_CANDIDATES, NEMOTRON_TEXT_CANDIDATES } from "@/agents/models";

export const dynamic = "force-dynamic";

/** Diagnostics: which Nemotron ids this key can call and which ones Orbit will use. */
export async function GET() {
  const ids = await availableModels();
  return NextResponse.json({
    keyPresent: !!process.env.NVIDIA_API_KEY,
    totalModels: ids.length,
    nemotron: ids.filter((id) => /nemotron|parse/i.test(id)),
    chosenText: await pickModel(NEMOTRON_TEXT_CANDIDATES),
    chosenParse: await pickModel(NEMOTRON_PARSE_CANDIDATES),
  });
}
