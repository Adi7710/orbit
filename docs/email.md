# The Email Agent

> Say *"professor I'm not feeling good today, can I take a leave"* and a formal email to the right instructor is written, read back to you, and queued for your approval. Nothing is sent by an agent, ever.

## Why it is its own agent

It is the only agent in Orbit whose output is read by **another human being**. The Day Agent proposes moving a task around your own screen; this one writes to your professor under your name. That deserves its own prompt, its own validation and its own blast radius, so it is `src/agents/emailAgent.ts` and it is deliberately **not** a tool on the Day Agent.

## Three things that make it safe

**1. It cannot send.** It returns a draft, which becomes a Tier B proposal like every other action that leaves the app. Approving it does not send either — see *Delivery* below.

**2. It cannot choose the recipient.** The address comes from the roster, server-side. The model is told who it is writing to, and `validateDraft` rejects the result outright if it changed the recipient.

**3. It cannot invent a reason.** The intent is classified **in code, before any model runs**, so a language model never gets to decide what kind of letter this is. The facts are passed in. And the output is checked mechanically:

| Rejected for | Because |
|---|---|
| `invented a medical detail` | "my doctor diagnosed me with flu" when you said you felt unwell |
| `made a promise on the student's behalf` | "I promise to submit tomorrow" |
| `changed the recipient` | the address is ours, not the model's |
| `does not address the instructor` | a letter to a professor opens properly |
| `too long for one ask` | one email, one request |

If any fire, the deterministic letter is used instead and the reason is reported. **The model's job is to write better prose than the fallback, never to be the only thing that can write at all.**

## It works with no API key

`src/core/emailDraft.ts` is pure, has no model, and writes a real, sendable letter — which matters, because `ANTHROPIC_API_KEY` is empty in this repo right now. Four intents, classified by keyword:

- **absence** — *"I am unwell and will not be able to attend Tuesday 22 September."* It says only that you are unwell. It never says why, even if you told it why, because a letter to a professor should not contain a medical claim you did not choose to write down.
- **extension** — cites the ledger if we have it (*"my schedule this week leaves 514 usable minutes against 1264 assigned"*) and concedes gracefully: *"I understand if this is not possible."*
- **question** — keeps **your** question, close to verbatim. Paraphrasing the substance away is the one thing that would make this useless.
- **meeting** — asks about office hours.

> A gap found by a test rather than by reading the code: *"I need until Friday"* is how people actually ask for an extension, and it contains none of the obvious keywords. The classifier now catches `until|by <day>` too.

## Delivery: why `mailto:`, and why that is the right answer

Approving the proposal opens **your own mail client** with the message pre-filled, from your own address. You press send.

This is not a workaround for "we could not get Microsoft Graph working in time". It is the correct first version:

- **Orbit holds no mailbox credential.** There is nothing to leak, and no configuration in which Orbit sends mail on its own.
- **The last approval is a human one nobody can accidentally skip.** An agent that can deliver to a professor is one bug away from delivering to a professor.
- It works tonight, on any machine, with no tenant admin involved.

### What sending from Outlook directly would actually take

Real sending needs **Microsoft Graph**, not an MCP connector. (An MCP server attached to a developer's assistant lets *that assistant* send mail; it does not give *Orbit* the ability, which is what the product needs.)

1. Azure app registration in the school tenant
2. Delegated `Mail.Send` scope, plus `Mail.Read` to see replies
3. **Admin consent** — most universities block student app registrations or require IT approval, which is a multi-day process
4. OAuth2 token exchange and refresh storage

Then `POST /me/sendMail`. Reading the professor's reply back needs `Mail.Read` plus polling or a Graph change-notification subscription, and threading on `conversationId`.

This is the right shape for a real product and the wrong shape for a Saturday. Deferred on purpose, alongside the Canvas token in `docs/future-signals.md`.

## The addresses are synthetic, and that is not laziness

Every address is on **`example.edu`**, a reserved domain that cannot deliver.

Canvas does not publish instructor emails in the `.ics` feed — the feed carries no `ORGANIZER`, no `ATTENDEE`, and nothing email-shaped at all; verified directly against a real feed. Real addresses would need the Canvas REST API and a personal access token, and many Canvas instances hide instructor email from students by permission regardless.

During a hackathon that constraint is a feature: **a demo that can reach a real professor is one misclick from emailing a real professor.**

## Surface

```
POST /api/email   { said, course?, task?, newDate?, studentName? }
                  -> { proposalId, intent, provider, to, subject, body, mailto, rejected? }
                  -> or { needCourse: true, options } when the course is ambiguous
GET  /api/email   -> the roster

voice tool: draft_email { said, course?, task?, newDate? }
```

The voice tool **reads the whole letter back to you** before you are asked to approve it, and ends by saying plainly that nothing has been sent. It is going to another human being; you hear every word first.

When the course is ambiguous the agent asks instead of guessing. Guessing a recipient is the one mistake this feature must never make.
