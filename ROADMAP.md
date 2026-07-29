# 🗺️ Mochi — Roadmap

> **The goal:** a cozy desktop companion that eases your work and handles your time effortlessly — one you keep open for months because it is genuinely useful and never annoying.

Milestones are ordered by **what unblocks what**, not by what is exciting. Each one ships something usable on its own. Effort figures assume one person working part-time and are rough.

---

## Where we are

|                                                        | Status                                       |
| :----------------------------------------------------- | :------------------------------------------- |
| Desktop shell, mascot, stopwatch, tray, speech bubbles | ✅ shipped                                   |
| Windows installer, CI green on 3 platforms, 144 tests  | ✅ shipped                                   |
| Event bus, interruption governor                       | ✅ shipped                                   |
| **Scheduler**                                          | ❌ **missing — blocks everything proactive** |
| AI, integrations, cloud                                | ❌ not started                               |

Mochi currently only speaks when spoken to. Every message is user-initiated. That is deliberate and it is also the ceiling.

---

## M0 · Prove it — 1 week, no code

**Use Mochi every day for a week.** Nothing else.

The governor's defaults — 3 interruptions/hour, 90-second gap, 20:00–08:00 quiet — were reasoned, not measured. So was the bubble duration, the rest threshold, and the decision that a sub-10-second session is a misclick.

Every one of those is a guess that a week of real use converts into evidence. Building M1–M3 on top of wrong guesses means rebuilding them.

**Done when:** you can say which defaults are wrong, and whether you actually click the mascot or forget it exists.

> ⚠️ If you forget it exists, **stop and fix that** before building anything else. A companion nobody looks at cannot be rescued by features.

---

## M1 · Finish the proactive spine — ~1 week

The scheduler, plus Mochi's first unprompted behaviour.

- **Scheduler** — converts cached data into local timers. Poll to sync a cache; fire alerts from timers. A 15-minute poll can never deliver a 5-minute warning.
- **Routines source** — start-of-day, end-of-day, break and hydration nudges, driven entirely by the work hours already in settings.
- Wire both through the existing bus → governor → mascot path.

**Why this before AI or integrations:** it exercises the governor against _real_ interruptions with **zero external dependencies** — no OAuth, no API key, no network. It is the cheapest possible way to find out whether the interruption model is right, and everything proactive depends on it.

**Done when:** Mochi says something useful you did not ask for, at a sensible moment, and you are not tempted to turn it off.

---

## M2 · Zero-key AI — ~1 week

- **Ollama auto-detect** — probe `127.0.0.1:11434` on launch. If it answers, every AI feature works with no key and no account.
- LLM router on the Vercel AI SDK; adapters for OpenAI, Anthropic, Gemini, Ollama.
- **Runtime model discovery** — provider detected from key prefix, model list fetched live. No model ID is ever written in source.
- `safeStorage` vault, main process only.
- Capability tiers (`text` / `tools` / `vision`) that degrade _visibly_.
- Daily token budget with a configurable action on exceed.
- Mochi phrases its own messages instead of using templates.

**Why:** proves BYOK end-to-end. The Ollama path is the strongest onboarding moment in the whole product — a working AI companion with no signup — and it is the smallest piece of the milestone.

**Done when:** someone with Ollama installed gets a working AI companion having pasted nothing.

---

## M3 · Calendar and the morning briefing — ~3 weeks

The demo the whole project has been building toward.

> At 9am Mochi walks to the centre of the screen, holds up a sign, and tells you what your day looks like. Then it goes back to reading its book.

- MCP client with **HTTP + OAuth transport** (Google's servers are remote, not stdio).
- BYO-Google-Cloud-Project wizard — deep-linked steps, **"Publish app" on its own screen with a warning colour**.
- Calendar source → scheduler → governor → briefing.
- Meeting alerts on local timers; one-click join for Zoom/Meet/Teams links.
- Briefing fires on **first unlock after the configured time**, never on boot.
- Progressive unlock UI replacing the current "Locked" placeholder.

**Why Calendar and not Gmail:** Calendar scopes are _sensitive_; Gmail scopes are _restricted_ and carry a recurring CASA assessment. The briefing needs only Calendar. This ships the headline feature without touching a single restricted scope.

**Done when:** there is a 20-second GIF that makes someone want to install it.

---

## M4 · Ship it publicly — ~2 weeks

- **Code signing** — Windows OV/EV certificate, Apple Developer Program. Until then every user sees a SmartScreen warning.
- Auto-update via `electron-updater`.
- macOS and Linux builds in CI (cross-building from Windows is impossible; CI runners solve it).
- Landing page, README with the GIF, install instructions.
- Execute `LAUNCH_PLAN.md` — Product Hunt, Reddit, the Founding Pioneer package.

**Why here:** launching before M3 means launching a stopwatch. Launching after M5 means sitting on it for months.

**Done when:** a stranger can install Mochi without being frightened by their own operating system.

---

## M5 · Email, if wanted — ~3 weeks

Only if M0–M4 show people want it.

- **IMAP first** — no consent screen, no scopes, no review, works with every provider.
- Gmail via the official MCP server + BYO project.
- **Read-only triage.** No sending, no deleting.
- **Confirmation gate and standing grants must ship in the same milestone**, not after. Retrofitting permissions onto an agent already used to acting freely is how projects get their first CVE.
- All tool-retrieved content is data, never instructions.

**Why last among the features:** highest complexity, highest compliance burden, highest risk, and the briefing already works without it.

---

## M6 · Cloud and dashboard — ~4 weeks, on demand only

**Do not start this until users ask for it.**

- Supabase — Postgres, Auth, and RLS doing the real work.
- Deep-link pairing (`mochi://linked`) with PKCE binding; short code as fallback.
- **Push-only sync first.** No pull, no realtime.
- Time logs only — zero compliance weight, proves the sync layer before any Google scope is involved.
- The **dashboard** holds the WebSocket, never the desktop: Supabase caps concurrent Realtime connections, and an always-on desktop client would exhaust them.

**The boundary, permanently:** config and metadata cross; content never does. The moment a mail body lands in Postgres, CASA and GDPR both apply.

---

## M7 · Ecosystem — ongoing

- Skin gallery and submission flow; the generator is parameterised, so variants are cheap.
- Community MCP sources: Todoist, Notion, GitHub, Spotify.
- Optional Rive renderer alongside sprite sheets.

---

## The critical path

```
M0 use it ──> M1 scheduler ──> M2 Ollama/LLM ──> M3 calendar briefing ──> M4 launch
                                                                            │
                                              M5 email ◄────────────────────┤
                                              M6 cloud ◄────────────────────┘
                                                        (both on demand only)
```

M5 and M6 are **branches, not continuations**. Mochi is a complete product at M4.

---

## Decision gates

Points where the honest answer might be _stop_:

| After  | Ask                                                                                                                     |
| :----- | :---------------------------------------------------------------------------------------------------------------------- |
| **M0** | Do you still open it? If not, no feature fixes that.                                                                    |
| **M1** | Is the unprompted message welcome or irritating? If irritating, the interruption model is wrong and M3 will amplify it. |
| **M2** | Does anyone actually want BYOK, or do they want it to just work?                                                        |
| **M4** | Did anyone install it twice?                                                                                            |
| **M6** | Has a real user asked for a dashboard, or is it a slide?                                                                |

---

## Risks

| Risk                            | Why it matters                           | Mitigation                                      |
| :------------------------------ | :--------------------------------------- | :---------------------------------------------- |
| **It gets annoying**            | The failure mode that kills desktop pets | Governor exists; M0/M1 tune it against evidence |
| **Nobody wants a desktop pet**  | Charm is not a market                    | M0 answers this in a week for free              |
| **Google policy shifts**        | Restricted scopes could tighten further  | BYO-project and IMAP both sidestep it entirely  |
| **Signing costs**               | Blocks distribution, costs real money    | Budget before M4; unsigned is fine for beta     |
| **Scope creep back into Gmail** | Most expensive, least necessary          | M5 is explicitly a branch                       |
| **Solo bandwidth**              | Everything after M4 is optional          | Every milestone ships something usable alone    |

---

## Housekeeping

Small, worth clearing between milestones:

- **Three spec files are unreconciled** with the implementation: `FEASIBILITY_AUDIT.md`, `SCALING_STRATEGY.md`, `LLM_ROUTER_SECURITY.md`. They predate the code and will mislead an agent.
- **Three acceptance items need a human**: click-through on transparent corners, staying above a fullscreen app, physical monitor unplug.
- **Fullscreen detection is a proxy** — the overlay's own visibility. Real detection needs a native module the project deliberately avoids.
- **Node 20 deprecation warnings** in CI actions. Cosmetic until they are not.

---

## The one-line version

**Make it worth keeping open before making it clever.** The stopwatch already earns its place; the governor makes intelligence safe to add; the briefing is what people will tell their friends about. Everything after that is optional.
