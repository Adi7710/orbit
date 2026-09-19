# Future: signals Orbit could read instead of being told

Two features Adi asked for, deliberately **not built for this hackathon**. Both are the same idea — *stop making the student report things the world already knows* — and both are dangerous in the same way, so they are written up together.

Nothing here is implemented. This is the design, the hard parts, and the invariants a future implementation must not break.

---

## 1. Canvas tells us the assignment is done

**Want:** submit on Canvas, and Orbit marks it complete without being told.

### The blocker: the feed cannot do this

The `.ics` feed we already import (`docs` in `src/app/api/import`) contains **due dates only**. There is no submission state in it, at all. Re-reading the feed forever will never reveal that something was handed in.

Completion state needs the **Canvas REST API**, which needs a token:

```
GET /api/v1/courses/:course_id/assignments?include[]=submission
    -> submission.workflow_state : unsubmitted | submitted | graded
       submission.submitted_at
       submission.graded_at, submission.score
```

A lighter-weight proxy, if we want less surface area:

```
GET /api/v1/users/self/todo     # items leave the list once submitted
```

Both need a **personal access token** (Canvas → Account → Settings → New Access Token) or a full OAuth2 app. That is a materially bigger trust ask than the feed URL, and it is why this is deferred rather than shipped: a feed URL is read-only for a calendar, a token is read-write for the whole account.

There are no student-accessible webhooks. Canvas Live Events requires Canvas Data Services and admin rights, so this is **polling** — every few minutes while the app is open, respecting the rate-limit headers Canvas returns (`X-Rate-Limit-Remaining`; Canvas throttles per token with a leaky bucket). Poll only courses with work due inside the horizon, not the whole account.

### The part that matters more than the plumbing

**Canvas knows it is done. It does not know how long it took.**

That distinction is the entire product. `estimator.ts` learns from *actual minutes*, and `submitted_at` is not a duration — a student can submit at 11:58pm something they wrote over four days.

So auto-completion must **never invent a duration**, and must never award XP on its own. The correct behaviour:

1. Canvas says `workflow_state: submitted` → mark the task complete on screen. This is **Tier A**: reversible, and it only changes the student's own view.
2. XP stays at zero and the estimator gets **no sample** until the student says how long it took.
3. Next time they open the app or the voice agent, it asks once: *"Canvas says the Komatsu case study went in. How long did it actually take?"* That is a question we could not have asked before, because we did not know it was finished.

This turns the feature from a convenience into the **best possible prompt for the data we actually need**. It is the strongest reason to build it.

> ### Why this is an XP-farming vector
> If submission alone awarded XP, the exploit is obvious: submit blank work repeatedly. `game.ts` caps XP at 150/task and 400/day precisely because XP has to be unfarmable. Auto-completion must stay outside the XP path entirely. **A signal we did not verify can change what is on the screen; it cannot change the score.**

### Staged plan

| Stage | What | Risk |
|---|---|---|
| 1 | Token in `.env.local`, manual "Check Canvas" button, show what changed, change nothing | none |
| 2 | Auto-mark complete (Tier A), ask for the duration afterwards | low |
| 3 | The Watcher reacts: a submission frees a planned window, so re-plan the afternoon | medium |

---

## 2. Location says you are in class

**Want:** near the building at the right time → Orbit knows you are in class.

### Location alone is never enough

Oakland is the worst case for this. Cathedral, Hillman, Posvar and Sennott are within a few hundred metres of each other, and consumer GPS in a dense block with tall buildings drifts 20–50 m — worse indoors, which is exactly where the student will be. A naive "inside a 75 m circle" geofence will fire for the café next door, for the library across the street, and for someone walking past on Forbes.

**The rule: a conjunction, never a single signal.** Count it as "in class" only when *all* of:

- inside the building's region, **and**
- inside the class's own time window (say −10 to +15 minutes of start; the block is already in `FixedBlock`), **and**
- **dwelled** there for ≥ 10 minutes — walking through is not attending.

The time window does most of the work. We already know the timetable, so location only has to break the tie between "at Hillman at 11am because of class" and "at Hillman at 11pm because of a problem set".

### How, on iOS

Use **region monitoring** (`CLMonitor` / `CLCircularRegion`), not continuous GPS:

- it wakes the app on enter/exit rather than burning battery tracking a path,
- **but there is a documented limit of 20 monitored regions per app** — fine for one student's buildings, and a real constraint if we ever monitor a whole campus. Verify the current limit against the iOS version before building.
- `CLVisit` monitoring is the cheaper cousin and is a good fit for "arrived and stayed", which is exactly our dwell requirement.

Background geofencing needs `Always` authorisation, which is a heavy permission prompt. **Start with `WhenInUse`** plus visit monitoring and see how far it gets; do not ask for `Always` until the feature has earned it.

### Privacy: the design decision that makes this acceptable

> **Coordinates never leave the phone.**
>
> The device evaluates the conjunction locally and sends the server a boolean and a block id — `{ blockId, state: "attended" }` — never a latitude. The server cannot reconstruct where the student was, and a breach of our store reveals nobody's movements.

This is consistent with what Orbit already does: `overlap.ts` computes shared gaps between friends and **never exposes a friend's classes**, only the window. Same instinct, applied to location.

Two more constraints:

- **Opt-in, per student, off by default**, with an obvious switch. Nobody is enrolled into location tracking by installing a scheduling app.
- **Never shared, never reported.** An app that tells anyone else whether you attended is a surveillance tool. This feature exists so Orbit can stop bothering you, not so it can grade you.

### What it is actually worth

Framing matters, because "attendance tracking" sounds bad and the useful version is not that:

1. **It stops nagging you.** No "leave by 10:52 for CS 0441" when you are already sitting in CS 0441.
2. **The travel graph gets real numbers.** `travel.ts` switches to an observed median after 3 trips. Right now those samples arrive only when a student tells us. Enter/exit timestamps give a true door-to-door time for that student, on that walk, in that weather.
3. **The ledger stops lying.** If you skipped, those 50 minutes were actually free, and the day's usable total was wrong all afternoon.

(3) is the one that compounds. It is also the one with teeth: the ledger revealing that you *did not* attend is a fact about you that the app is now holding. Show it, never send it.

### Failure modes to handle before shipping

| Case | What happens | Answer |
|---|---|---|
| Class moved rooms | geofence never fires | fall back to the timetable; absence of signal ≠ absence |
| Online class | no location at all | never infer skipped from silence |
| Phone dead / left in bag | no signal | same — silence means unknown, not false |
| Café next door | region fires | dwell + time window should reject it; log and measure |
| Deliberate spoofing | fake location | acceptable, **because attendance must never award XP** |

The last row is the important one, and it is the same conclusion as Canvas: **an unverified signal may change the screen, never the score.**

---

## The shared invariant

Both features are the same bet — that Orbit can read the world instead of interrogating the student — and both break the same way if done carelessly. Whatever gets built:

1. **A signal we did not verify can change what is displayed. It can never award XP, and it can never manufacture an estimator sample.**
2. **Anything that leaves the app or reaches another person stays Tier B**, needing a human tap, exactly as `watcher.ts` enforces today.
3. **Detection creates the question, it does not answer it.** Canvas tells us *that* it finished so we know to ask *how long*. Location tells us you were there so we know not to ask at all.

Neither is in scope before submission. Written down so the shape is not re-argued from scratch.
