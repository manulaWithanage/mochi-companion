# The Manula Neural Memory Architecture (MNMA)

**A local-first behavioural memory for personal AI companions**

*Manula Withanage · 2026 · Reference implementation: [Mochi](https://github.com/manulaWithanage/mochi-companion)*

---

## Abstract

Personal AI assistants forget you between sessions. Every conversation starts cold, so either you re-explain yourself, or the assistant guesses, or the whole history gets stuffed into a context window at increasing cost and decreasing precision.

MNMA is a memory architecture for the specific case of a **single-user desktop companion**. It keeps a typed, weighted graph of behavioural beliefs on the user's own machine, written continuously by cheap local computation, and read by an expensive cloud model only through a bounded summary.

Three properties define it:

1. **Deterministic code outranks both models.** Every statistic is computed in ordinary code. Models are confined to genuinely fuzzy judgement.
2. **A single evidence model** handles reinforcement, forgetting and contradiction, instead of three mechanisms that must be kept consistent with each other.
3. **A hard ceiling on the handoff.** The cloud model never receives more than a fixed token budget of user context, ranked by value.

This document describes the architecture, the reasoning behind each decision, and — importantly — where it does not apply.

---

## 1. The problem, stated precisely

A companion that runs all day on your desktop has a different memory problem from a chatbot.

**It observes far more than it is told.** Sessions start and stop, apps come and go, mail is sent. Almost none of that arrives as conversation, so conversational memory approaches have nothing to hook into.

**Its useful facts are statistical, not episodic.** "You work in 45-minute blocks and peak mid-afternoon" is the useful belief. It is not any single event, and no single event contains it.

**Its beliefs go stale in a specific way.** People change jobs, habits, sleep. A memory system that only accumulates will confidently describe who you were last year.

**Its data is unusually sensitive.** When you work, what you use, and how you write is a behavioural fingerprint. Uploading it to a memory service is a real cost, not a hypothetical one.

**And it has a cold start.** On day one it knows nothing, which is exactly when the user decides whether to keep it.

Existing approaches each solve part of this and miss the rest:

| Approach | What it gives you | Why it does not fit |
|---|---|---|
| Long context / full history | No architecture needed | Costs scale with history; no persistence between sessions; precision falls as context grows |
| Vector store + RAG | Good fuzzy recall over text | Behavioural facts are numbers and relations, not passages. "What is my median session length" is not a similarity search |
| Cloud memory service | Managed, cross-device | Requires a server and your behavioural data on it |
| Fine-tuning | Deeply personalised | Far too slow and expensive to track a habit that changes in a fortnight |

MNMA is narrower than any of these. It is a **behavioural** memory for **one** user on **one** machine, and it trades generality for being cheap, private, and correct about numbers.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   TIER 0 — DETERMINISTIC EXTRACTOR            (ordinary code)            │
│   Every statistic. Medians, peak windows, streaks, ceilings.             │
│   Microseconds. Exact by construction. Cannot hallucinate.               │
│                              │                                          │
│                              ▼                                          │
│   TIER 1 — LOCAL SMALL MODEL                  (~0.5-1B, on device)       │
│   Only fuzzy judgement: writing style, what an app means.               │
│   Strict JSON out, schema-guarded, discarded on failure.                │
│                              │                                          │
│                              ▼                                          │
│   ┌───────────────────────────────────────────────────────────┐         │
│   │  THE GRAPH   typed nodes · weighted edges · provenance     │         │
│   │              held in memory, encrypted at rest             │         │
│   └───────────────────────────────────────────────────────────┘         │
│                              │                                          │
│                              ▼  bounded, ranked, hard-capped            │
│   TIER 2 — EXECUTIVE MODEL                    (whatever the user picked) │
│   On demand only. Drafting, planning, reasoning.                        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Tier 0 is the load-bearing idea

The obvious design gives a small local model every deduction to make. It is also wrong, and it took building it to see why.

Consider the belief *"peak focus window is 2–5 PM."* That is a histogram over session start times weighted by duration. Ordinary code computes it in microseconds, exactly, every time. A 0.5B model asked the same question is slower, occasionally wrong, and introduces an error class that otherwise cannot exist.

So the division is by **kind of question**, not by convenience:

| Question | Tier | Why |
|---|---|---|
| Median session length | 0 | Arithmetic |
| Peak focus window | 0 | Histogram |
| Sustained-work ceiling | 0 | Percentile |
| Streaks, deep-work ratio | 0 | Counting |
| "Short bullets or long paragraphs?" | 1 | Linguistic |
| "Is `Untitled-3.psd` deep work?" | 1 | World knowledge |
| "Draft this as me" | 2 | Fluency |

The consequence is that **most users need no local model at all.** Tier 0 alone yields peak windows, session habits and routine patterns. Tier 1 is an upgrade that improves style matching, not a dependency.

This is the opposite of the usual instinct, which is to route everything through the largest model available and let it sort things out.

### 2.2 The graph

Nodes are typed entities: apps, time windows, habits, styles, routines, contacts, projects. Edges are typed relations carrying **provenance** and **timestamped evidence**.

```json
{
  "from": "VS_Code",
  "to": "peak_window_14_17",
  "relation": "active_during",
  "provenance": "computed",
  "confirms":    [1751200000000, 1751286400000, 1751372800000],
  "contradicts": []
}
```

Two decisions in that shape matter more than they look.

**Confidence is absent.** It is derived from the evidence and the clock on every read. A stored confidence field can disagree with the evidence that produced it, and when it does there is no way to tell which one is wrong. Deriving it makes that class of bug unrepresentable.

**Evidence is timestamps, not counts.** An edge confirmed twenty times last year should not outrank one confirmed three times this week. A bare counter cannot express that; a list of instants can.

**Provenance** decides which rules apply:

- `declared` — the user said so. Trusted immediately.
- `computed` — Tier 0 arithmetic. Trusted immediately.
- `inferred` — a model's judgement. Must earn trust.

That three-way split is what makes an onboarding questionnaire work. The naive design gives onboarding answers a low confidence and then filters out low-confidence beliefs — silently discarding the entire questionnaire. Provenance separates *"we are unsure"* from *"a model guessed"*, which are not the same thing at all.

---

## 3. The four laws

### Law 1 — Typed weighted graph storage

Beliefs are machine-readable typed nodes and edges, never prose. Relevance ranking, traversal and budget enforcement all run in ordinary code with no model in the loop, which is what makes retrieval sub-millisecond and free.

### Law 2 — One evidence model

A Beta posterior over time-decayed evidence:

```
w(t)       = exp(-Δt / τ)

              α + Σ w·confirms
confidence = ───────────────────────────────────
              α + β + Σ w·confirms + Σ w·contradicts
```

with a deliberately pessimistic prior (α=1, β=4) and τ scaled to how often the pattern is expected to recur.

One formula produces four behaviours that are usually implemented separately:

| Behaviour | How it falls out |
|---|---|
| **Reinforcement** | Many recent confirmations raise confidence and hold it |
| **Forgetting** | A one-off observation's weight decays; confidence drifts back to the prior with no pruning rule |
| **Regime shift** | Recent contradictions outweigh stale confirmations; a job change overturns a habit without a special "drifting" state |
| **Quarantine** | A weak prior means one or two observations cannot cross a usability threshold |

> **Why τ must scale with cadence.** A flat forgetting window and a fixed confirmation threshold are incompatible. If unreinforced beliefs fade in seven days and a belief needs five confirmations to be usable, then anything recurring less than about five times a week can *never be learned* — a Friday habit gets one confirmation and decays before the second arrives. Tying τ to the observed period removes the conflict. This is not a tuning detail; it is the difference between a system that can learn weekly rhythms and one that structurally cannot.

### Law 3 — The bounded handoff

The executive model never learns the user from scratch. It receives a pre-assembled summary under a **hard token ceiling**, facts ranked by confidence, task relevance and recency, with overflow counted rather than silently dropped.

The ceiling is the point. A profile costing 100 tokens today grows quietly to 400 as it enriches, and nobody notices until a bill or a context-window error. Enforced at assembly time, it cannot drift.

### Law 4 — Corrections dominate

A correction from the user is the highest-quality signal the system will ever receive. It **clears** accumulated machine evidence rather than adding one vote to it, and a deleted belief stays suppressed so the same wrong inference is not relearned next week.

Making a user out-vote twenty stale machine observations one click at a time is a good way to make them stop correcting anything.

---

## 4. A worked example

Day 1. Nothing is known. Onboarding asks three questions; the answers land as `declared` edges and are usable immediately.

```
User: works 9am-6pm; prefers 45m blocks.
```

Day 9. Sessions have accumulated. Tier 0 computes real figures, which are `computed` and therefore also trusted at once. Observation now outranks the declaration.

```
User: peaks 2pm-5pm; works in 47m blocks; rarely past 80m; 6-day streak.
```

Day 30. Tier 1 has characterised sent mail. Eight independent confirmations put the style belief past the floor.

```
User: peaks 2pm-5pm; works in 47m blocks; writing prefers short bullets;
      opens with "Hey <name>"; rarely past 80m; 62% deep work.
```

Day 74 — new job, mornings now.

Contradicting observations arrive with weight ≈ 1 while the old afternoon confirmations have decayed. Confidence in the afternoon edge crosses below the floor and it leaves the context package on its own. No drift detector, no migration, no manual reset.

```
User: peaks 9am-12pm; works in 38m blocks; writing prefers short bullets.
```

The style belief survived the job change, because nothing contradicted it. That separation — habits and style decaying independently — is a property of per-edge evidence, not something that had to be coded.

---

## 5. Cost

| Resource | Cost |
|---|---|
| Graph read | Sub-millisecond, in-memory traversal |
| Tier 0 extraction | Microseconds, on session boundaries |
| Tier 1 inference | ~0.5–1s per batch on CPU for a 0.5B model, none if not installed |
| Resident memory | ~400MB **if** Tier 1 is enabled and pinned resident |
| Network | Zero for Tiers 0 and 1 |
| Executive context | Bounded by the ceiling, by construction |

> **Two honest corrections to numbers that circulate about this kind of design.**
>
> A 0.5B model does not answer in under 100 milliseconds. Emitting a sentence, including prompt evaluation and a local HTTP round trip, is realistically half a second to a second on CPU. Nothing waits on it, so this is fine — but do not design around 100ms.
>
> And a local model is not resident by default. Ollama unloads after a five-minute idle keep-alive; it must be explicitly pinned or every wake pays a full model load from disk.

### 5.1 On token savings

A bounded 100-token profile obviously costs less than a full activity log. That comparison is not the interesting one, because nobody would ship a full activity log.

The honest comparison is a **generic** system prompt against a **personalised** one, and both are about the same size. With prompt caching, repeated context is close to free.

**MNMA should be justified on output quality, not cost.** The measurable claim is that a personalised draft needs fewer edits — and unlike a cost percentage, that can be tested. See [MNMA_RESEARCH.md](MNMA_RESEARCH.md).

---

## 6. Privacy

Precision matters here more than reassurance.

**Never leaves the device, in any configuration:** raw activity logs, session rows, window titles, email bodies, raw writing samples, and the graph file itself.

**Leaves the device only when the user invokes a cloud task:** the assembled context package — a short derived summary — plus whatever the task itself requires, such as the thread being replied to.

**Fully local:** if the executive model is also local, nothing leaves at all. This is a supported configuration, not a footnote.

At rest, the graph is encrypted with the OS keystore. A behavioural history is at least as sensitive as a revocable API key; encrypting keys and leaving behaviour in plaintext beside them would be incoherent.

---

## 7. Limitations, and when not to use this

Stated plainly, because an architecture document that only lists strengths is marketing.

**It is single-user and single-device by design.** No sync, no server, no accounts. Multi-device means the user exports an encrypted file and moves it themselves. If you need shared or team memory, this is the wrong architecture.

**It is behavioural, not episodic.** MNMA holds "you work in 45-minute blocks". It does not hold "on Tuesday you said your sister's name is Ana". Conversational recall is a different problem and wants a different structure — likely a vector store beside this, not instead of it.

**Cold start is mitigated, not solved.** Onboarding gives a usable starting persona, but the first fortnight is genuinely thinner than the second.

**τ and the prior are tuned, not derived.** They were chosen so that habits survive a holiday but not a job change. That is a judgement about human behaviour, and different users may well need different constants. Learning them per user is open work.

**OS activity sensing is the weak point.** Reading which application is in the foreground requires platform-specific code — on Windows, either a shipped binary or shelling out to the Win32 API. For a project that deliberately avoids native dependencies, this is a real architectural cost, and it is the one component that should be decided deliberately rather than discovered mid-implementation. Everything else here works without it.

**It has not been validated at scale.** The reference implementation is one user. The evaluation protocol exists ([MNMA_RESEARCH.md](MNMA_RESEARCH.md)) but the results do not yet.

---

## 8. Related work

MNMA builds openly on prior art. The contribution is the combination, not the components.

| Work | What it established | Relation to MNMA |
|---|---|---|
| **MemGPT** — Packer et al., UC Berkeley, 2023 ([arXiv:2310.08560](https://arxiv.org/abs/2310.08560)) | Tiered memory for LLM agents: working context, recall, archival | MNMA adopts the tiering; adds that the *writer* is local and cheap while the *reader* is remote and expensive |
| **Zep / Graphiti** — Rasmussen et al., 2025 ([arXiv:2501.13956](https://arxiv.org/pdf/2501.13956)) | Temporal knowledge graph for agent memory; typed edges with validity intervals; expiring facts rather than deleting them | Closest prior art. Zep invalidates edges on contradiction; MNMA instead keeps contradictions as evidence and lets confidence fall out of one formula. Zep assumes cloud models and a server; MNMA assumes neither |
| **Ebbinghaus**, 1885 | The forgetting curve, `R = e^(-t/S)` | The decay term in Law 2 |
| **Karpathy's LLM-as-OS** framing | LLM as CPU, context as RAM, tools as syscalls | MNMA's graph is the file system in that analogy |

**What is genuinely new in the combination:**

1. Deterministic code as the *highest-authority* tier, outranking both models — most memory systems route everything through a model.
2. A small local model as the writer and a large remote model as the reader, with a hard token contract between them.
3. Single-user, zero-server, single encrypted file the user owns outright.
4. One unified evidence model for reinforcement, decay and contradiction rather than separate subsystems.

A note on the name: **"Neural" describes the shape of the idea, not the implementation.** This is a typed weighted graph with a Bayesian evidence model. There is no neural network in it.

---

## 9. Reference implementation

| Module | Law | Contents |
|---|---|---|
| `core/brain/graph.ts` | 1, 4 | Node and edge types, provenance, observation, correction, suppression, untrusted-input parsing |
| `core/brain/confidence.ts` | 2 | Beta posterior, recency weighting, cadence scaling, usability floor |
| `core/brain/stats.ts` | Tier 0 | Median, peak window, sustained ceiling, streak, deep-work ratio |
| `core/brain/context.ts` | 3 | Priority ranking, token estimation, ceiling enforcement |
| `core/brain/eval.ts` | — | Edit distance, trial assignment, effect summary |
| `main/services/brain-service.ts` | — | In-memory graph, encrypted persistence, compaction |

All logic modules are pure: no clock of their own, no I/O. Every function taking "now" takes it as an argument, which makes the entire evidence model testable without mocking time.

---

## 10. Two bugs worth recording

Both were found by tests, not by reading, and both are the kind of thing that would have been mistaken for correct behaviour in production.

**A too-short forgetting constant erased the profile over a holiday.** With τ = 10 days, a habit confirmed eight times fell below the usability floor after ten quiet days. A fortnight away from the desk would have wiped a month of learning. The failure looks exactly like normal decay, which is what makes it dangerous. τ = 30 days.

**Tied windows reported a peak the user had never worked in.** For someone who only ever starts at 2pm, every three-hour window containing 2pm scores identically, and taking the first match reported "peaks 12pm–3pm" — an hour range in which they had never once begun a session. Ties now break on the busiest opening hour.

Neither was a coding error. Both were specification gaps that only appeared when someone asked what the output should be for a specific, ordinary user.

---

*MNMA is MIT-licensed along with the rest of `packages/core`. Corrections and counter-evidence are welcome — particularly from anyone who has measured this class of architecture with more than one user.*
