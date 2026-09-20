import { NextResponse } from "next/server";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * The pulse: short scripted notices the clients show one at a time, every
 * twenty seconds, at the top of the screen. The crew moving, the gym at six,
 * the train, a window with something in it.
 *
 * Scripted, and served rather than hardcoded in each client, so the phone and
 * the web say the same thing in the same order and there is one place to
 * change a word. Every number in them matches the seeded day. Nothing here
 * counts what the student failed to do (docs/theme.md section 2.4), and no
 * exclamation marks (docs/copy.md rule 4). `synthetic: true` because these
 * are demo lines, not events.
 */
export async function GET() {
  const name = store().user.name;
  const notices = [
    { id: "kevin-lead", kind: "crew", text: "Kevin just finished Lab 2 report. New XP leader, 545 XP." },
    { id: "gym-six", kind: "body", text: "Lift those weights. Gym at 6:00 pm gets you the dates, and 60 XP." },
    { id: "priya-free", kind: "crew", text: "Priya is free 12:00 to 14:00. Williams Library, second floor?" },
    { id: "hblr", kind: "bus", text: "HBLR from Marin Boulevard at 1:47. Leave by 1:36 and you have nine minutes to spare." },
    { id: "ps4-window", kind: "quest", text: "Problem Set 4 fits your 11:05 window. Ninety focused minutes, plus 90 XP." },
    { id: "sam-ring", kind: "crew", text: "Sam closed ring 5 this week. Two more and you are level." },
    { id: "laundry", kind: "life", text: "Laundry is 45 minutes and tonight has room for it. Do it early, feel smug." },
    { id: "streak", kind: "streak", text: `Streak: 2 weeks, ${name}. Finish one thing today and it is 3.` },
    { id: "reading-ride", kind: "learn", text: "Reading: Chapter 3 is 40 minutes. The ride is 16. Two rides and it is read." },
    { id: "maya-gym", kind: "crew", text: "Maya is at the gym at 6:00 too. Go together, keep each other honest." },
  ];
  return NextResponse.json({ notices, everySeconds: 20, synthetic: true });
}
