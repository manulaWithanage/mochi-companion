# 🗺️ Mochi — Roadmap

> **The goal:** a cozy desktop companion that eases your work and handles your time effortlessly — one you keep open for months because it is genuinely useful and never annoying.

Milestones are ordered by **what unblocks what**, not by what is exciting. Each one ships something usable on its own. Effort figures assume one person working part-time and are rough.

---

## Where we are

|                                                        | Status         |
| :----------------------------------------------------- | :------------- |
| Desktop shell, mascot, stopwatch, tray, speech bubbles | ✅ shipped     |
| Windows installer, CI green on 3 platforms             | ✅ shipped     |
| Event bus, interruption governor                       | ✅ shipped     |
| Scheduler, routines — Mochi speaks unprompted          | ✅ shipped     |
| AI, integrations                                       | ❌ not started |

184 tests. Mochi now says things you did not ask for — start of day, break nudges, end of day, long session — all gated by the governor.

---

## 🖥️ Architecture: desktop-only

**Decided 2026-07-29.** Mochi runs entirely on the user's machine. There is no Mochi account, no Mochi server, and no cloud dependency.

- **All data local** — sessions, projects, settings, cache. SQLite and a JSON file in userData.
- **LLM keys local** — `safeStorage`, main process only. Calls go straight from the desktop to whichever provider the user chose.
- **Google linked from the desktop** — OAuth loopback flow in the settings window. No web app involved.
- **The dashboard is a desktop view**, not a website. Time logs, charts and history read straight from local SQLite.

**Why:** it removes the account, the hosting bill, the AGPL service, and the second deployment target. It also makes the privacy claim simple and absolute — _there are no servers_, which is far stronger than _our servers are careful_.

The only thing this gives up is viewing your time logs from another device. That is what M6 would buy, and it is now genuinely optional rather than deferred.

---

## M0 · Prove it — 1 week, no code · **running now, in parallel**

**Use Mochi every day for a week.** No code in this one — it is wall-clock time, so build work continues alongside it.

This could not run before M1: with no unprompted behaviour, a week of use could only tell you about the stopwatch. Now that Mochi speaks on its own, the week tests the thing that actually matters.

The governor's defaults — 3 interruptions/hour, 90-second gap, 20:00–08:00 quiet — were reasoned, not measured. So was the bubble duration, the rest threshold, and the decision that a sub-10-second session is a misclick.

Every one of those is a guess that a week of real use converts into evidence. Building M1–M3 on top of wrong guesses means rebuilding them.

**Done when:** you can say which defaults are wrong, and whether you actually click the mascot or forget it exists.

What to watch, all of it currently a guess:

| Setting              | Now         | Question                       |
| :------------------- | :---------- | :----------------------------- |
| Interruptions / hour | 3           | Too many, or never noticed?    |
| Break interval       | 90 min      | Useful or nagging?             |
| Minimum gap          | 90 s        | Do two ever feel like a burst? |
| Long session         | 100 min     | Right threshold?               |
| Bubble duration      | 4–6 s       | Long enough to read?           |
| Quiet hours          | 20:00–08:00 | Matches your actual life?      |

The signal that matters most: **do you reach for Do Not Disturb?** If so the interruption model is wrong, and M3's briefing would amplify it rather than fix it.

> ⚠️ If you forget it exists, **stop and fix that** before building anything else. A companion nobody looks at cannot be rescued by features.

---

## M1 · Finish the proactive spine — ✅ done

The scheduler, plus Mochi's first unprompted behaviour.

- ✅ **Scheduler** — cached data → local timers. Chains long delays past setTimeout's 32-bit overflow, reconciles after sleep, drops badly-overdue items as `missed`.
- ✅ **Routines** — start-of-day, break, end-of-day and long-session nudges from the work hours already in settings.
- ✅ Both wired through bus → governor → mascot.

**Why this before AI or integrations:** it exercises the governor against _real_ interruptions with **zero external dependencies** — no OAuth, no API key, no network. It is the cheapest possible way to find out whether the interruption model is right, and everything proactive depends on it.

**Done when:** Mochi says something useful you did not ask for, at a sensible moment, and you are not tempted to turn it off.

---

## M2 · Zero-key AI — ~1 week ← **building now**

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
- **Connections panel in the settings window** — the entire OAuth flow lives here. No web app is involved in linking Google.
- **Local dashboard** — time per project, daily and weekly totals, session history, read straight from SQLite. A desktop view, not a website.

**Why Calendar and not Gmail:** Calendar scopes are _sensitive_; Gmail scopes are _restricted_ and carry a recurring CASA assessment. The briefing needs only Calendar. This ships the headline feature without touching a single restricted scope.

**Done when:** there is a 20-second GIF that makes someone want to install it.

---

## M4 · Ship it publicly — ~2 weeks

- **Code signing** — Windows OV/EV certificate, Apple Developer Program. Until then every user sees a SmartScreen warning.
- **Distribute via GitHub Releases, never the repo.** Installers are 96–216MB; git cannot compress them, keeps every build forever, and GitHub hard-rejects anything over 100MB. `*.exe`, `*.dmg` and `*.AppImage` are gitignored so this cannot happen by accident. Releases also carry download counts, which is the only install telemetry a no-servers product can have.
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

## M6 · Cloud sync — optional, may never happen

**Not deferred — optional.** Mochi is complete without it. The only thing it buys is seeing your time logs on a device that is not the one running Mochi.

Build it only if a real user asks for that specific thing.

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

M5 and M6 are **branches, not continuations**. Mochi is a complete, serverless product at M4 — no account, no backend, nothing to host.

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
- **The website download button points at a file that no longer exists** (`apps/web/public/Mochi-Setup.exe`, removed from git). It will 404 when deployed. Fix at M4 by pointing it at a Release asset — there is no one to hand a download to before then.

---

## The one-line version

**Make it worth keeping open before making it clever.** The stopwatch already earns its place; the governor makes intelligence safe to add; the briefing is what people will tell their friends about. Everything after that is optional.
