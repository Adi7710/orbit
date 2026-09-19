# Copy

> `docs/copy.md` · Owner: Akshat (issue #15) · SteelHacks XIII
>
> Every string the app shows, keyed by screen and state. Voice rules live in `docs/theme.md` §8 and govern anything added here.
>
> `{braces}` are runtime values. Ship these strings verbatim — if a state you need has no string, that's a bug in this file, not licence to write one.

---

## 0. The seven rules, restated

1. Under 12 words.
2. Second person — "You have 9h 49m."
3. Digits, never words — "9h 49m", not "nine hours".
4. No exclamation marks. No emoji. Anywhere.
5. Never count what the student failed to do.
6. The number comes before the feeling. The number *is* the reassurance.
7. No orbital vocabulary — no "orbits", "burn", "momentum", "gravity" in any user-facing string.

---

## 1. Today

### Ledger header

| Key | String |
|---|---|
| `today.ledger.real` | `{usable}` |
| `today.ledger.claimed` | `your calendar says {naiveFree}` |
| `today.ledger.breakdown` | `{diff} missing: walking, meals, settling in` |
| `today.ledger.tight` | `{slack} of slack. It's a tight day.` |
| `today.ledger.over` | `You're over by {overBy}. Something has to move.` |

The claimed figure renders struck through. The real figure is the Display-weight number.

### Gap cards

| Key | String |
|---|---|
| `today.gap.range` | `{startText} – {endText}` |
| `today.gap.usable` | `{usable} usable` |
| `today.gap.walk` | `{walk} to walk from {fromPlace}` |
| `today.gap.pick.none` | `Nothing fits here.` |
| `today.gap.evening` | `Evening. Lighter work only.` |
| `today.gap.done` | `Done` |
| `today.gap.actualPrompt` | `How long did it actually take?` |
| `today.gap.actualHint` | `Rough is fine. It teaches the estimate.` |

`actualHint` matters more than it looks — it's what stops the check-in feeling like a test.

### Bus strip

| Key | String |
|---|---|
| `today.bus.leaveBy` | `Leave by {leaveByText} for the {route}` |
| `today.bus.arrival` | `{route} arriving {arrivalText}` |
| `today.bus.live` | `live` |
| `today.bus.scheduled` | `scheduled` |
| `today.bus.ghost` | `The {route} is scheduled but not moving. Walk it.` |
| `today.bus.ghostSub` | `No live position for {minutes}.` |

The ghost warning is the one place the app volunteers bad news. It earns that by being actionable — *walk it* — rather than just reporting a fault.

### Crew strip

| Key | String |
|---|---|
| `today.crew.free` | `Free with you: {names}` |
| `today.crew.none` | `Nobody free in this gap.` |
| `today.crew.rank` | `{xp} XP this week · {rank} of {total}` |

### Empty states

| Key | String |
|---|---|
| `today.empty.noGaps` | `Nothing fits. Enjoy it.` |
| `today.empty.noTasks` | `Nothing queued. Import a syllabus or add one.` |
| `today.empty.noClasses` | `No classes today.` |
| `today.empty.allDone` | `Everything you planned is done.` |
| `today.empty.crew` | `Nobody here yet. Send your card to one person.` |
| `today.empty.crewSub` | `Two is a crew.` |

No empty state apologises, and none of them shows a sad icon.

### The bad-week line

| Key | String |
|---|---|
| `today.returning` | `Yesterday didn't land. Today has {usable}.` |
| `today.returningWeek` | `Last week didn't land. This week has {usable}.` |

Shown **once**, on first open after a day or week with nothing logged, then never again. No colour change, no icon, no dismissal button — it's a line of text that appears and is gone next launch.

---

## 2. XP

### Toast

| Key | String |
|---|---|
| `xp.toast.amount` | `+{xp} XP` |
| `xp.toast.reasons` | joined with ` · ` |
| `xp.toast.lifetime` | `{lifetimeXp} lifetime` |
| `xp.toast.capped` | `Capped at 150 for one task.` |
| `xp.toast.dailyCap` | `Day capped at 400. Rest counts tomorrow.` |

### Reasons

These come from `xpFor()` and are already user-facing. Keep them exactly:

| Server string | Shown as |
|---|---|
| `{n} focused minutes` | unchanged |
| `done inside a planned gap` | unchanged |
| `on time` | unchanged |
| `estimate was far off, XP scaled down` | unchanged |
| `{n}-week streak` | unchanged |
| `{mode} mode: no XP, no streak damage` | unchanged |

That last one is doing real work. It says *no streak damage* in the same breath as *no XP*, so the student never has to wonder.

### Calibration

| Key | String |
|---|---|
| `xp.calibration.updated` | `{course} now estimates {multiplier}× your guess.` |
| `xp.calibration.learning` | `{samples} of 5 samples. Still learning {course}.` |

---

## 3. Modes

| Key | String |
|---|---|
| `mode.normal.name` | `Normal` |
| `mode.crisis.name` | `Crisis` |
| `mode.chill.name` | `Chill` |
| `mode.crisis.explain` | `Coursework only. XP paused. Streak safe.` |
| `mode.chill.explain` | `Deadlines and meals only. XP paused. Streak safe.` |
| `mode.normal.explain` | `Everything on.` |
| `mode.crisis.entered` | `Crisis mode. Everything else is hidden, not gone.` |
| `mode.chill.entered` | `Chill mode. Undeadlined work is off today.` |
| `mode.exited` | `Back to normal. {usable} today.` |

Both explanations end on **"Streak safe"** on purpose. The reason a student avoids a mode that would help them is fear of losing progress, so the reassurance goes in the switch itself, not three screens away in a settings page.

---

## 4. Proposals

| Key | String |
|---|---|
| `plan.button` | `Plan my day` |
| `plan.working` | `Looking at your gaps` |
| `plan.none` | `Nothing worth proposing. The day already works.` |
| `plan.narration` | from the agent, one sentence |
| `proposal.approve` | `Approve` |
| `proposal.decline` | `Not this` |
| `proposal.reason` | `{reason}` |

### Per kind

| Kind | Card title | Effect toast |
|---|---|---|
| `move_task` | `Move {task} into {gap}` | `Moved. {gap} is spoken for.` |
| `book_room` | `Book {building} for {gap}` | `Booked. Confirmation {code}.` |
| `notify_friends` | `Invite {names} to {gap}` | `Invited. They'll see it on their Today.` |
| `draft_extension` | `Ask {instructor} for more time` | `Sent. Nothing else changes today.` |
| `suggest_cut` | `Drop {task} today` | `Dropped. {slack} back.` |

| Key | String |
|---|---|
| `proposal.declined` | `Fine. Nothing changed.` |
| `proposal.alreadyResolved` | `Already decided. Nothing changed.` |

`Not this` rather than `Decline`, and `Fine. Nothing changed.` rather than a confirmation — declining is a normal thing to do, not an exception the app is disappointed by.

---

## 5. The extension email

**Hard rules.** Under 120 words. Cites the ledger numbers verbatim. States a new date. No excuses, no apology for existing, no medical or personal detail. Polite, not pleading. The student reads and approves it before anything is sent — the agent never sends.

**Structure**

1. One line: what, and which class.
2. The numbers, stated flatly.
3. The new date proposed.
4. One line of thanks.

**Template**

```
Subject: {course} {assignment} — asking for {days} more days

Hi Professor {name},

I'm working on {assignment}, due {dueDate}. Looking at my week
honestly, I have {usable} of usable time and {queued} already
committed, which leaves me {slack} short.

Could I turn it in by {newDate} instead? I'd rather hand you
something finished than something rushed.

Thanks,
{studentName}
```

**Banned in this email:** "I've been really busy", "so much on my plate", "I know this is last minute", any illness or family detail, any promise about future performance.

The numbers are the argument. A ledger a professor can check beats a paragraph of apology, and it's the only version of this email that isn't asking them to take a student's word for it.

---

## 6. Voice

### Morning briefing

Built from the ledger, spoken, ~25 seconds. Numbers converted to words by `speakNumbers`.

```
Morning, {name}. Your calendar says {naiveFree} free today.
You actually have {usable}, once the walking and the meals come out.

{gapCount} real gaps. The best one is {bestGap}, {bestGapUsable}.
{pickTitle} fits there.

{busLine}

That's it. Go.
```

| Variant | String |
|---|---|
| `voice.brief.noGaps` | `No real gaps today. It's a full one.` |
| `voice.brief.crisis` | `Crisis mode. Coursework only, and your streak is safe.` |
| `voice.brief.over` | `You're over by {overBy}. Worth cutting something.` |
| `voice.brief.bus` | `Leave by {leaveByText} if you want the {route}.` |

**"That's it. Go."** is the whole point of the ending. A briefing that trails off into encouragement is one the student stops listening to by Wednesday.

### Evening check-in

| Key | String |
|---|---|
| `voice.checkin.open` | `Quick one. How long did {task} actually take?` |
| `voice.checkin.ack` | `{actual} minutes. Noted.` |
| `voice.checkin.learned` | `{course} now estimates {multiplier} times your guess.` |
| `voice.checkin.nothing` | `Nothing to log. Night.` |
| `voice.checkin.skip` | `Skip it. Night.` |

One question, one acknowledgement, done. It never asks how the day *felt*, never asks a follow-up, and never says "great job".

---

## 7. Crew and share card

| Key | String |
|---|---|
| `crew.card.headline` | `{xp} XP` |
| `crew.card.sub` | `this week · {pct}% of the time you actually had` |
| `crew.card.lifetime` | `{lifetimeXp} lifetime` |
| `crew.card.invite` | `join my crew · {code}` |
| `crew.share` | `Share to a friend` |
| `crew.copyCode` | `Copy invite code` |
| `crew.copied` | `Copied {code}` |
| `crew.sent` | `Card sent` |
| `crew.join.prompt` | `Enter a crew code` |
| `crew.join.ok` | `You're in {crewName}. {count} people.` |
| `crew.join.bad` | `No crew with that code.` |
| `crew.tab.week` | `This week` |
| `crew.tab.life` | `All time` |
| `crew.tab.week.sub` | `weekly XP` |
| `crew.tab.life.sub` | `lifetime XP` |
| `crew.note.week` | `Resets every Monday. Your current form.` |
| `crew.note.life` | `Never resets, never falls.` |
| `crew.leave` | `Leave crew` |

`Leave crew` goes straight through — no confirmation dialog, no warning about what's lost. Nothing in Orbit makes leaving feel like a mistake.

---

## 8. Achievements

| Key | String |
|---|---|
| `ach.title` | `Achievements` |
| `ach.count` | `{earned} of {total} earned` |
| `ach.group.earned` | `Collected` |
| `ach.group.locked` | `Still out there` |
| `ach.progress` | `{now} / {goal}` |
| `ach.next` | `{next}` |
| `ach.unlocked` | `{name} {tier}` |

### The nine

| Name | Earned line | Next line |
|---|---|---|
| Honest | `Estimated {n} tasks within 25%.` | `Reach {goal} for Honest {tier}.` |
| Gap Filler | `Finished {n} tasks inside a planned gap.` | `Reach {goal} for Gap Filler {tier}.` |
| Ring Closer | `Closed a ring {n} times.` | `Close {goal} for Ring Closer {tier}.` |
| Made the Bus | `Caught {n} leave-by times.` | `Catch {goal} for Made the Bus {tier}.` |
| Held the Line | `Held a {n}-week streak.` | `Hold {goal} weeks for Held the Line {tier}.` |
| Came Back | — | `Come back after a week you logged nothing. Three times.` |
| Dead Reckoning | — | `Estimate ten tasks to the exact minute.` |
| Unshakeable | — | `Keep a streak through a full week in crisis mode.` |
| Full Orbit | — | `Close all four rings in one week.` |

Locked achievements always state the requirement as a plain sentence. No mystery boxes, no "???".

---

## 9. Rings and unlocks

| Key | String |
|---|---|
| `ring.learn` / `build` / `body` / `life` | `LEARN` `BUILD` `BODY` `LIFE` |
| `ring.value` | `{pct}% of target` |
| `ring.closed` | `Closed` |
| `ring.locked` | `unlocks at 70% for 2 weeks` |
| `ring.unlocked` | `{name} is open.` |
| `ring.unlockedSub` | `Two weeks of {prev} did that.` |

---

## 10. Setup

First boot only, never a repeating check-in.

| Key | String |
|---|---|
| `setup.welcome` | `Your calendar lies about how much time you have.` |
| `setup.welcomeSub` | `Ten questions. No wrong answers.` |
| `setup.focus.q` | `What do you want to protect this semester?` |
| `setup.focus.opts` | `Eating properly` · `Moving` · `Seeing people` · `Sleeping` · `Something else` |
| `setup.focus.custom` | `Name it.` |
| `setup.ring.explain` | `You start with one ring. More open as you use it.` |
| `setup.skip` | `Skip` |
| `setup.done` | `Here's your real day.` |

`setup.done` hands them the ledger rather than a congratulations screen. The first thing the product does is the thing the product is.

---

## 11. Errors and degraded states

These describe what the **software** is doing. `warn` colour, never red, never blamed on the student.

| Key | String |
|---|---|
| `error.offline` | `Can't reach Orbit. Showing your last day.` |
| `error.stale` | `Last updated {time}.` |
| `error.retry` | `Try again` |
| `error.import.bad` | `That link didn't parse as a calendar.` |
| `error.import.empty` | `No events in that feed.` |
| `error.syllabus.none` | `Nothing dated on that page.` |
| `error.agent.down` | `The agent is unavailable. Your day still works.` |
| `error.voice.down` | `Voice is unavailable. Briefing is on screen.` |
| `error.demoMode` | `Demo data. No live transit feed.` |

Every degraded state names **what still works**. "The agent is unavailable" alone is a dead end; "your day still works" tells the student whether to keep going.

`error.demoMode` is deliberately visible. The team's own rule is that features degrade visibly rather than silently, and a demo that quietly pretends a snapshot is live transit is the kind of thing a judge catches.

---

## 12. Never ship these

Beyond the five banned lines in `theme.md` §8:

- Any streak-loss warning. Streaks don't break.
- Any count of missed, skipped, or overdue items.
- `Are you sure?` on anything that isn't destructive.
- `Oops`, `Uh oh`, `Whoops`.
- Any sentence starting `Don't forget`.
- Any praise adjective about the student: `amazing`, `incredible`, `superstar`, `beast`.
- Any string that tells the student how to feel about a number.
