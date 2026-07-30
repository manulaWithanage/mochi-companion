# Mochi Individual User Brain & Neural Knowledge Graph

**Master Blueprint & Technical Architecture Document**
*The Manula Neural Memory Architecture (MNMA)*

---

## 1. Executive Summary & Core Vision

Mochi is designed to evolve from a desktop timer and assistant into a truly personalized, intelligent live companion.

By building an Individual User Brain Engine (`@mochi/core/brain`), Mochi continuously learns how the user works, adapts its personality, coaching, and reminders to individual habits, and drafts messages matching the user's exact writing style, keeping all raw activity data on the user's local machine.

**What "better" actually means here.** The point of this architecture is *output quality*, not saved money. A personalized draft that needs two edits instead of ten is the win. Token savings are real but small, and the document is careful not to lean on them (see §2.4).

---

## 2. Key Breakthrough Concepts

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             DUAL-BRAIN ARCHITECTURE                              │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  1. TIER 1: SUBCONSCIOUS BRAIN                                                   │
│     • A small local model, resident in RAM (~400MB at 4-bit, keep-alive pinned)   │
│     • Handles ONLY the fuzzy, linguistic work: writing style, app meaning         │
│     • Costs nothing, never touches the network                                    │
│                                                                                  │
│  1b. TIER 0: DETERMINISTIC EXTRACTOR (pure TypeScript)                           │
│     • Does ALL the arithmetic: medians, peak windows, streaks, fatigue points    │
│     • Runs in microseconds, cannot hallucinate, needs no model at all            │
│                                                                                  │
│  2. TIER 2: EXECUTIVE BRAIN (whichever strong model the user configured)          │
│     • Called ON DEMAND for high-value complex tasks (emails, week planning)      │
│     • Reads the pre-built Neural Graph from memory                                │
│     • Receives a compact, hard-capped context package                             │
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Tier 0 exists because most of this is arithmetic, not inference

The original design gave the small model every deduction to make, including things like *"peak energy window confirmed: 2 PM – 4 PM."* That is a median and a histogram. TypeScript computes it exactly, in microseconds, and cannot get it wrong.

So the split is:

| Question | Who answers it | Why |
|---|---|---|
| Median session length | **Tier 0** (TypeScript) | Arithmetic |
| Peak focus window | **Tier 0** | Histogram over start times |
| Fatigue threshold | **Tier 0** | Where completion rate drops |
| Streaks, deep-work ratio | **Tier 0** | Counting |
| "Does this person write short bullets or long paragraphs?" | **Tier 1** (SLM) | Genuinely linguistic |
| "Is `Untitled-3.psd` deep work or messing about?" | **Tier 1** | Needs world knowledge |
| "Draft this email as me" | **Tier 2** | Needs real fluency |

> **NOTE**
> This matters more than it looks. Narrowing Tier 1 to the fuzzy cases means most users get a working brain with **no local model installed at all** — Tier 0 alone produces peak windows, session habits and routine patterns. The SLM becomes an upgrade that improves writing-style matching, not a hard dependency. It also deletes an entire class of bug: a model cannot mis-deduce a number it was never asked about.

### 2.2 Deterministic analytics, LLM phrasing

Pure TypeScript computes exact session averages, peak hour distribution and streak counts. The models never invent a statistic. They only ever phrase, characterize, or compose using figures that were computed for them.

### 2.3 Memory tiers (building on MemGPT)

Following MemGPT (Packer et al., UC Berkeley, 2023):

- **Working context** (`brain.json`) — the active user profile, always available.
- **Recall / archival storage** — the local SQLite database already in Mochi, for full history and search.

### 2.4 An honest note on token cost

The earlier draft of this document claimed 85–90% token cost reduction. That figure does not survive scrutiny and has been removed.

The honest comparison is not *"raw logs versus 100 tokens"* — nobody would ship raw logs. It is *"a generic system prompt versus a personalized one"*, and both are about the same size. With prompt caching, repeated context is close to free anyway.

> **IMPORTANT**
> Justify this architecture on **quality of output**, not on cost. The measurable claim is in §9: the number of edits the user makes to a Mochi draft should fall over time. That is the number that matters, and unlike a cost percentage, it is testable.

---

## 3. The User Neural Knowledge Graph

The graph connects data points gathered from local OS activity, time tracking, task completion and communication samples.

```
                      ┌──────────────────────────────────────────────┐
                      │              USER NEURAL GRAPH               │
                      └──────────────────────┬───────────────────────┘
                                             │
      ┌──────────────────────┬───────────────┴───────────────┬──────────────────────┐
      │                      │                               │                      │
      ▼                      ▼                               ▼                      ▼
┌───────────────┐    ┌───────────────┐               ┌───────────────┐      ┌───────────────┐
│ ACTIVE APPS   │    │ FOCUS HABITS  │               │ EMAIL TONE    │      │ ROUTINES      │
├───────────────┤    ├───────────────┤               ├───────────────┤      ├───────────────┤
│ • VS Code     │    │ • Peak: 2-5PM │               │ • Concise     │      │ • Water 11:30 │
│ • Figma       │    │ • Block: 45m  │               │ • "Hey Alex," │      │ • 5m Stretch  │
│ • Chrome      │    │ • Fatigue:90m │               │ • Bulleted    │      │ • Morning Plan│
└───────┬───────┘    └───────┬───────┘               └───────┬───────┘      └───────┬───────┘
        │                    │                               │                      │
        └────────────────────┴───────────────┬───────────────┴──────────────────────┘
                                             │
                               SYNAPTIC CONNECTIONS (EDGES)
                                             │
                                             ▼
             1. [VS Code] ────────► (Best At: 2-5 PM) ────────► [Do Not Disturb]
             2. [Zoom Ended] ─────► (Needs Refresh) ──────────► [5m Stretch Break]
             3. [Email Draft] ────► (Uses Tone) ──────────────► [Concise Bulleted]
```

**Graph node tiers:**

- 💻 **Active OS applications** — sensed locally, subject to §8.4's allowlist.
- ⏱️ **Focus habits** — median session duration, peak energy windows, fatigue thresholds.
- ✍️ **Communication style** — salutations, sign-offs, sentence brevity, bullet preference.
- 📋 **Routines & habits** — active routines, snooze behaviour, preferred reminder times.

---

## 4. Privacy & Local Execution Standards (Rule 1 & Rule 2)

> **IMPORTANT**
> **Be precise here.** The earlier draft said no personal activity or writing samples are *ever* uploaded. That was not true, because §7.2's whole purpose is sending a profile summary to a cloud model. Overclaiming privacy is worse than claiming less and meaning it.

The accurate two-tier statement:

**What never leaves the device, under any configuration:**

- Raw activity logs, session rows, and the graph files themselves
- Active window titles
- Email bodies and raw writing samples
- Everything in `%APPDATA%/Mochi/brain/`

**What leaves the device, and only when you ask it to:**

- The assembled context package — a short, derived summary of your habits — sent to whichever cloud model you configured, at the moment you invoke a task that needs it
- For an email draft, the thread being replied to

**Fully-local mode:** if the Executive Brain is also pointed at Ollama or LM Studio, nothing leaves the machine at all. This is a supported configuration, not a footnote.

Storage: the graph is written with `safeStorage` encryption, the same as API keys and OAuth tokens. A record of when you work, what you use and how you write is at least as sensitive as a revocable API key, and treating it as less would be inconsistent.

---

## 5. Next Steps for Implementation

> Implementation progress lives in `ROADMAP.md`, not here. An architecture document that also tracks status rots twice as fast.

**Phase A — pure logic, no model required** *(implemented)*

1. `@mochi/core/brain/graph.ts` — typed node and edge schema, traversal.
2. `@mochi/core/brain/confidence.ts` — the single evidence model (§7.4).
3. `@mochi/core/brain/stats.ts` — Tier 0 deterministic extractor.
4. `@mochi/core/brain/context.ts` — context assembler with the hard token ceiling.

**Phase B — persistence**

5. `apps/desktop/src/main/services/brain-service.ts` — load and persist an encrypted `brain.json`, own the in-memory graph.

**Phase C — the model tiers**

6. Wire the local SLM for the fuzzy extractions only (writing style, app semantics), via the existing local-provider layer.
7. Route brain-generated nudges through the interruption governor (§8.10).

**Phase D — the user's view of it**

8. Add a "Mochi's Memory" tab so users can see, correct, and delete what Mochi believes about them (§9.2).

---

## 6. How the Subconscious Brain Works (Deep Dive)

### 6.1 The always-on loop

The Subconscious Brain is not a chatbot. It is a silent pattern extractor. Its job is to turn events into graph edges while the user is doing something else.

```
SUBCONSCIOUS BRAIN - LIFECYCLE

  [Events accumulate] (sessions end, mail sent, apps change)
          │
          │  Batched, not per-event. App switches alone fire dozens of
          │  times a minute; waking a model on each would be neither
          │  free nor quiet.
          ▼
  [BATCH BOUNDARY: session end, or a 15-minute tick]
          │
          ▼
  [TIER 0: TypeScript Extractor]  ~microseconds
  Computes every statistic exactly. Writes those edges directly.
  No model involved. This is most of the graph.
          │
          ▼
  [TIER 1: SLM wake — only if there is fuzzy work in the batch]
  Writing-style characterization, or app categorization.
  Emits strict JSON only. ~0.5-1s on CPU for a 0.5B model.
          │
          ▼
  [SCHEMA GUARD]
  Fails validation → discarded silently. The graph is never
  corrupted by a malformed deduction.
          │
          ▼
  [Edges written with provenance + evidence counts]
          │
          ▼
  [SLM stays resident, idle at 0% CPU]
```

> **NOTE**
> **Two corrections to the original timings.** The first draft claimed the model responds in under 100ms; a 0.5B model emitting a sentence is realistically 0.5–1s on CPU once prompt evaluation and the HTTP round trip are counted. Nothing is waiting on it, so this is fine — but do not design around 100ms.
>
> It also claimed the model sits "loaded in RAM ready to wake in milliseconds". That is **false by default** — Ollama unloads a model after a five-minute idle `keep_alive`. It must be pinned (`keep_alive: -1`) or every wake pays a full model load. With it pinned, the ~400MB resident claim is honest.

### 6.2 The handoff protocol (Subconscious → Executive)

```
EXECUTIVE BRAIN HANDOFF PROTOCOL

  STEP 1: Graph Traversal (TypeScript, sub-millisecond)
  Reads the IN-MEMORY graph and ranks nodes relevant to the task.
  > Task: "Draft email to Alex about coding progress"
  > Relevant: [Alex_contact], [CodingBlock_today], [WritingStyle_concise]

  STEP 2: Context Package Assembly (TypeScript)
  Assembles a compact context string under a hard token ceiling,
  highest-confidence and most-recent edges first (§8.6).

  STEP 3: Executive Brain Call
  Receives that package plus the user's request.

  STEP 4: Done
  The Executive Brain never has to guess who the user is.
```

> **NOTE**
> The original said "1ms lookup" from `graph.json`. That only holds if the graph is **cached in memory** — parsing a multi-megabyte JSON file is tens of milliseconds, and §8.5 acknowledges the file grows. `brain-service.ts` therefore holds the graph in memory and treats the file purely as durability.

---

## 7. The Manula Neural Memory Architecture (MNMA)

### 7.1 What MNMA is

MNMA is a purpose-built, on-device, typed behavioural knowledge graph, continuously written by local extraction and instantly read by an expensive Executive LLM — designed to remove the cold-start problem from a personal AI companion and keep the user's raw data on their own machine.

### 7.2 Related work, and what is actually new here

> **IMPORTANT**
> Positioning this accurately makes it *stronger*, not weaker. The earlier draft said MNMA "is not derived from any existing tool or framework" — in a document that cites MemGPT two pages earlier. A reviewer spots that immediately, and it costs more credibility than the claim buys.

**Prior art this builds on, openly:**

| Work | What it established |
|---|---|
| **MemGPT** (Packer et al., UC Berkeley, 2023) | Tiered memory for LLM agents: working context vs. recall vs. archival |
| **Zep / Graphiti** ([arXiv:2501.13956](https://arxiv.org/pdf/2501.13956), Rasmussen et al., 2025) | Temporal knowledge graph for agent memory; typed edges with validity intervals, expiring facts rather than deleting them |
| **Ebbinghaus** (1885) | The forgetting curve, `R = e^(-t/S)` — the basis for evidence decay |
| **Karpathy's LLM-as-OS** | The framing in §7.3 |

**What MNMA contributes as a combination:**

1. **A three-tier split where deterministic code outranks both models.** Tier 0 owns every statistic; the SLM is confined to linguistic judgement. Most memory systems send everything through a model.
2. **A small *local* model as the writer and a large *remote* model as the reader**, with a hard token contract between them. Zep and MemGPT assume cloud models throughout.
3. **Desktop-only, single-user, zero-server.** No account, no sync, no vector database — a single encrypted file the user owns outright.
4. **One unified evidence model** (§7.4) covering reinforcement, decay and contradiction, rather than three separate mechanisms.

That is a genuine and defensible contribution. It does not require claiming the parts were invented here.

### 7.3 Mapping to Karpathy's LLM OS

| Karpathy's LLM OS concept | MNMA equivalent |
|---|---|
| CPU (reasoning engine) | Executive Brain (user's configured strong model) |
| RAM (context window) | The assembled MNMA context package |
| Disk / file system | The MNMA neural graph (encrypted `brain.json`) |
| Background OS process | Tier 0 extractor + resident Subconscious SLM |
| System calls | Mochi's IPC handlers (sessions, routines, drafts) |

### 7.4 The MNMA Design Laws

The original three laws contained three contradictions that cancelled each other's solutions. Laws 1 and 3 survive intact. Law 2 is replaced by a single evidence model that does what the old Law 2, the drift detection in §8.2, and the confirmation threshold in §8.8 were each doing separately.

#### Law 1 — Typed weighted graph storage

All behavioural knowledge is stored as machine-readable, semantically typed JSON nodes with weighted edges, never as prose. TypeScript can traverse the whole graph and rank relevance without any model involvement.

```json
{
  "nodes": [
    { "id": "VS_Code", "type": "app", "category": "deep_work" },
    { "id": "peak_window_14_17", "type": "time_window" }
  ],
  "edges": [
    {
      "from": "VS_Code",
      "to": "peak_window_14_17",
      "relation": "active_during",
      "provenance": "computed",
      "confirms": 23,
      "contradicts": 1,
      "firstSeen": "2026-06-02",
      "lastSeen": "2026-07-30"
    }
  ]
}
```

Note what is **not** stored: `confidence`. It is derived from the evidence counts and the clock, so it can never drift out of sync with them.

#### Law 2 — One evidence model (replaces the old decay law)

Every edge carries counts of confirming and contradicting observations, each weighted by how recent it is:

```
w(t)       = exp(-Δt / τ)                        recency weight
confidence = (α + Σ w·confirms)
             ─────────────────────────────────
             (α + β + Σ w·confirms + Σ w·contradicts)
```

This is a Beta posterior with time-decayed evidence, and it produces all three behaviours the original document needed three mechanisms for:

- **Reinforcement** — repeated confirmations push confidence up and, because they are many, hold it up.
- **Decay** — a one-off late-night session has one observation whose weight fades; confidence returns toward the prior on its own. Nothing needs a pruning rule.
- **Contradiction and regime shift** — a job change produces contradicting observations. Recent ones outweigh the stale confirmations, and confidence falls without any special "drifting" state.
- **Quarantine** — a weak prior means one or two observations cannot cross the usability floor.

> **NOTE**
> **τ scales with the pattern's own period, and that fix matters.** The original said unreinforced edges decay after 7 days while also requiring 5 confirmations to become usable. Those rules are incompatible: a Friday-only habit gets one confirmation a week, so it would decay before the second ever arrived, and **any pattern slower than about five times a week could never be learned at all.** Tying τ to the observed cadence — days for a daily habit, weeks for a weekly one — removes the conflict.

#### Law 3 — The bounded handoff contract

The Executive Brain is never asked to learn the user from scratch. It receives a pre-assembled context package under a hard token ceiling, drawn from the graph, highest-value edges first. This eliminates cold-start guessing and user-context hallucination.

The ceiling is a tuned constant, enforced at runtime and never exceeded (§8.6).

---

## 8. Known Complexities and Design Solutions

### 8.1 Cold start (week 1 is blind)

The graph starts empty, so for the first days Mochi's coaching would be generic.

> **NOTE**
> **Solution:** an onboarding questionnaire pre-seeds a rough persona ("I work 9–6, I like 45-minute blocks").
>
> **The fix the original needed:** seeds were given confidence `0.30` while the usability floor was `0.50` — so they were excluded from every context package and the cold-start fix did nothing at all. Onboarding answers are now stored with `provenance: "declared"` and are **exempt from the floor**. They are user-stated facts, not model guesses, so the hallucination quarantine does not apply to them. They still lose to observed evidence as soon as real data contradicts them.

### 8.2 Behaviour drift

The user used to code at 2 PM; they changed jobs and now code at 9 AM.

> **NOTE**
> **Solution:** no separate mechanism needed. Contradicting observations accumulate, recency weighting makes them outrank the stale confirmations, and confidence falls out of the formula in Law 2. This also removes the old contradiction where "core habits never decay" made a job change permanently unlearnable.

### 8.3 SLM inference quality

Small models make reasoning mistakes.

> **NOTE**
> **Solution:** two layers. First, Tier 0 means the model is never asked for a number in the first place — the largest category of possible error is designed out. Second, whatever it does emit must be strict JSON passing a schema guard, and is discarded silently on failure.

### 8.4 OS-level app sensing

> **NOTE**
> **Solution:** a strict productivity allowlist, with everything else counted as "Other" and **nothing stored** — not even a hash. The original proposed hashing unrecognized titles; window titles are low-entropy and a hash is reversible by dictionary attack in seconds, so it offers false comfort. If it is not being stored readably, store nothing.
>
> Be aware that an allowlist is not the same as safety: Slack, Zoom and Notion titles carry client names, meeting names and document titles. Titles are reduced to an app identity and a category before anything is written.

> **IMPORTANT**
> **This is the highest-risk item in the plan, and it was rated Medium.** Electron has no API for reading another application's foreground window title. The options are a shipped platform binary (`active-win`), which affects packaging, SmartScreen and signing, or shelling out to PowerShell with `GetForegroundWindow`/`GetWindowText`, which keeps Mochi's zero-native-dependency property but needs a separate implementation per OS.
>
> Mochi deliberately has no native modules — `node:sqlite` was chosen over `better-sqlite3` for exactly this reason. **App sensing is therefore the one feature here that challenges an existing architectural rule, and it should be decided on purpose rather than discovered during implementation.** Everything else in this document works without it.

### 8.5 Graph bloat

> **NOTE**
> **Solution:** Law 2 prunes naturally — an edge whose evidence has decayed to the prior carries no information and can be dropped. A periodic compaction job also merges redundant nodes: 23 individual `CodingBlock_*` events collapse into one `Deep_Work_Pattern` node with aggregated counts. The graph is held in memory, so read cost is traversal, not parsing.

### 8.6 Token budget drift

The context package grows silently as the profile gets richer: 100 tokens today, 400 in six months.

> **NOTE**
> **Solution:** the assembler enforces a hard ceiling with priority ranking — highest-confidence and most-recent edges first, lower-value edges dropped when the budget is spent. Enforced at runtime, never exceeded. This part of the original document was already right.

### 8.7 Multi-device and data loss

> **NOTE**
> **Solution:** optional encrypted export and import. The user owns the file and moves it themselves. No cloud sync without deliberate, explicit opt-in.

### 8.8 Hallucination leakage

A wrong deduction that passes schema validation could be reinforced by coincidence into a confident false belief.

> **NOTE**
> **Solution:** the weak prior in Law 2 means inferred edges start near-zero and need repeated independent confirmation to cross the usability floor. Below it they are stored but never included in any context package — quarantined, not deleted, so they can still be reviewed in the Memory tab.
>
> `provenance` decides which rules apply: `declared` (user said so) is trusted immediately, `computed` (Tier 0 arithmetic) is trusted immediately, `inferred` (SLM) must earn its way past the floor.

### 8.9 User corrections must dominate

A correction from the user is the highest-quality signal the system will ever receive, and the original document had no mechanism for it.

> **NOTE**
> **Solution:** an edit in the Memory tab writes `provenance: "declared"` and clears accumulated inferred evidence for that edge. Deleting a belief records it as a standing contradiction, so the same wrong inference cannot be silently relearned next week.

### 8.10 Brain nudges must pass the governor

The brain will want to say things — coaching, reminders, observations.

> **NOTE**
> **Solution:** everything it produces goes onto the existing event bus and through the interruption governor: hourly budget, minimum gap, quiet hours, DND. There is exactly one door to the user's attention, and the brain does not get its own. A companion that has learned you well and interrupts you constantly is worse than one that knows nothing.

### 8.11 Complexity summary

| # | Complexity | Severity | Solution |
|---|---|---|---|
| 1 | OS app sensing vs. zero native deps | 🔴 **High** | Explicit decision required; everything else works without it |
| 2 | Cold start (empty graph) | 🔴 High | Onboarding seeds, exempt from the usability floor |
| 3 | Behaviour drift | 🟡 Medium | Falls out of the Law 2 evidence model; no separate mechanism |
| 4 | SLM inference mistakes | 🟡 Medium | Tier 0 removes numeric errors; schema guard catches the rest |
| 5 | Graph bloat | 🟡 Medium | Decay-based pruning + compaction; in-memory reads |
| 6 | Token budget drift | 🟡 Medium | Hard ceiling, priority-ranked assembly |
| 7 | Nudge spam | 🟡 Medium | Everything routes through the interruption governor |
| 8 | Multi-device / data loss | 🟢 Low | Optional encrypted export and import |
| 9 | Hallucination leakage | 🟢 Low | Weak prior + provenance tiers + quarantine |

---

## 9. Does It Actually Work? (Evaluation)

The original document had no way to tell a working brain from a placebo. For something with research framing, that was the largest gap in it.

### 9.1 The one metric that matters

**Edit distance between what Mochi drafts and what the user actually sends.**

Record the generated draft, record the sent version, store the normalized Levenshtein distance. If personalization works, that number trends down over weeks. If it does not move, the brain is decoration and should be cut.

Supporting counters, all cheap:

| Metric | What a good trend looks like |
|---|---|
| Draft edit distance | Falling |
| Nudges dismissed vs. acted on | Dismissal rate falling |
| Corrections in the Memory tab | Falling after the first fortnight |
| Edges above the usability floor | Rising, then plateauing |
| Context package size | Flat — pinned by the ceiling |

### 9.2 The Memory tab is part of the architecture

Users must be able to read every belief, correct it, and delete it. This is not only a trust feature — corrections are the highest-quality training signal available (§8.9), and a brain the user cannot inspect is one they cannot trust with the writing-style data that makes it useful.

---

## 10. A Note on Naming

"Neural" describes the shape of the idea, not the implementation: this is a typed weighted graph with a Bayesian evidence model, not a neural network. Worth knowing when discussing it with anyone who will take the word literally.
