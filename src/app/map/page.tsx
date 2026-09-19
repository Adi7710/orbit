import { Suspense } from "react";
import MapClient from "./MapClient";

export const metadata = { title: "Orbit · Do I make it?" };

export default function Page() {
  return (
    <Suspense fallback={<main className="grid h-dvh place-items-center text-zinc-400">Reading the timetable…</main>}>
      <MapClient />
    </Suspense>
  );
}
