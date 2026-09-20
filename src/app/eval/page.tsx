import { Suspense } from "react";
import EvalClient from "./EvalClient";

export const metadata = { title: "Orbit · Does Nemotron help?" };

export default function Page() {
  return (
    <Suspense fallback={<main className="grid h-dvh place-items-center text-ink-3">Reading the eval…</main>}>
      <EvalClient />
    </Suspense>
  );
}
