# MNMA — Research Protocol

**Validating behavioural memory on a live desktop companion**

_Pre-registration draft · written before data collection · Mochi as the instrument_

---

## 0. Why write this before collecting anything

Because the honest failure mode of this project is obvious: the person evaluating MNMA also designed and built it, wants it to work, and will be looking at their own data. Every methodological choice made _after_ seeing results is a chance to find an effect that is not there.

So the hypotheses, metrics, baselines and analysis rules are fixed here, first. If they change later, the change gets recorded with a date and a reason rather than quietly applied.

---

## 1. Research questions

**RQ1 — Does learned behavioural context improve output quality?**
Does a draft written with an MNMA context package need less editing than one written without?

**RQ2 — Does _learning_ beat _being told_?**
Does a continuously-learned profile outperform a good hand-written static profile of the same size?

**RQ3 — Is the evidence model actually predictive?**
Does confidence, as Law 2 defines it, predict whether the next observation will confirm or contradict a belief? And what are the right constants?

**RQ4 — Does onboarding fix cold start?**
Do declared seeds measurably help during the first fortnight, when the graph is thin?

> **RQ2 is the one that decides whether MNMA is worth existing.** If a static paragraph a user writes once does as well as a graph learned over months, the entire learning apparatus is unjustified. Most write-ups of this kind of architecture omit that comparison, which is precisely why it is the primary comparison here.

---

## 2. Hypotheses, and what would disconfirm them

Each is stated so it can fail.

| #      | Hypothesis                                                                | Disconfirmed if                                               |
| ------ | ------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **H1** | MNMA context reduces median normalised edit distance versus no context    | The 95% bootstrap CI of the paired difference includes 0      |
| **H2** | MNMA context beats a static hand-written persona of equal token budget    | CI of the MNMA-minus-static difference includes 0             |
| **H3** | Confidence predicts the next observation better than a base-rate constant | Brier score no better than predicting the global confirm rate |
| **H4** | τ ≈ 30 days (daily cadence) is near-optimal for predictive accuracy       | A different τ improves held-out Brier score by >10% relative  |
| **H5** | Declared onboarding seeds reduce edit distance in days 1–14               | CI of the seeded-minus-unseeded difference includes 0         |
| **H6** | The token ceiling holds under real growth                                 | Any assembled package exceeds the ceiling in production       |

H6 is already covered by a unit test and is included so that a regression counts as a disconfirmed hypothesis, not a bug report.

---

## 3. Metrics

### 3.1 Primary — normalised edit distance

For each drafted message, record the draft `d` and what the user actually sent `s`:

```
distance = levenshtein(d, s) / max(|d|, |s|)      ∈ [0, 1]
```

0 means sent verbatim. 1 means completely rewritten.

**Why this and not a rating.** A self-reported "how good was that draft, 1–5" from the person who built the system is worth very little. Edit distance is behavioural, recorded automatically, and hard to fool without actually accepting a worse draft.

**Known weaknesses, stated up front.** It penalises legitimate content additions the model could not have known about, and it does not distinguish a one-word tone fix from a full rewrite of equal length. Two secondary metrics compensate:

- **Accept-without-edit rate** — fraction of drafts sent with distance < 0.05
- **Prefix survival** — how much of the opening survives, since salutation and tone are what a style profile most directly affects

### 3.2 Secondary

| Metric            | Definition                        | Expected direction                                           |
| ----------------- | --------------------------------- | ------------------------------------------------------------ |
| Nudge action rate | acted-on ÷ (acted-on + dismissed) | Rising                                                       |
| Correction rate   | Memory-tab corrections per week   | Falling after week 2                                         |
| Usable edges      | Edges above the floor             | Rising, then plateau                                         |
| Package size      | Tokens assembled                  | Flat (ceiling-bound)                                         |
| Dropped facts     | Facts excluded by the budget      | Watch — persistent growth means the ceiling needs revisiting |

---

## 4. The four arms

Every drafting trial is randomly assigned to exactly one:

| Arm            | Context supplied                                                | Tests                                                 |
| -------------- | --------------------------------------------------------------- | ----------------------------------------------------- |
| **A — none**   | No user context at all                                          | Floor. What a generic model produces                  |
| **B — static** | A hand-written persona, fixed at study start, same token budget | The real baseline (RQ2)                               |
| **C — MNMA**   | Assembled package from the graph                                | The treatment                                         |
| **D — dump**   | Recent raw activity, uncapped                                   | Whether _structure_ helps, or just _more information_ |

Arm D exists to separate two claims that are easy to conflate. If D matches C, MNMA's contribution is the data, not the architecture, and the graph could be replaced by a log tail. If C beats D, the ranking and bounding are doing real work.

Arm B is written **once**, before any data collection, and never updated. That is the point: a static profile is what a competent developer would ship without any of this machinery.

---

## 5. Study 1 — Draft quality (live, randomised, blinded)

**Design.** Randomised alternating treatment, n=1, within-subject. Each drafting event is independently assigned to A/B/C/D with equal probability, seeded from the message id so assignment is reproducible and cannot be nudged.

**Blinding.** The arm is **not displayed** while editing. It is written to the trial log and only joined during analysis. This is the single most important control available in an n=1 study and it is cheap to implement — knowing "this one used the brain" would otherwise contaminate every edit.

**Unit of analysis.** One drafted message.

**Target sample.** 60 trials, ≥15 per arm. At ~4 drafts/week that is roughly 15 weeks; at 15/week, about a month.

**Stopping rule, fixed now.** Analyse at n=60. No peeking-and-stopping when a difference looks good — optional stopping is how n=1 studies manufacture effects. One interim look at n=30 is permitted for _instrumentation faults only_, not for outcomes.

**Exclusions, defined in advance.** Drafts abandoned without sending. Messages under 20 characters. Any trial where the executive model errored. Exclusions are logged with reasons and counted.

---

## 6. Study 2 — Predictive validity of the evidence model (offline)

This is the most rigorous of the four and needs no user participation at all.

**Idea.** Law 2 claims confidence means something. That is directly testable: treat it as a probabilistic forecast of the next observation.

**Method.** For each edge, walk its observation history forward. At each step, using only evidence strictly before time _t_, compute confidence, then check whether the observation at _t_ confirms or contradicts. Score the forecast:

```
Brier = mean( (confidence_before − actual)² )      actual ∈ {0, 1}
```

**Comparisons.**

- **Baseline:** predict the global confirm rate for everything. If MNMA cannot beat a constant, its confidence carries no information.
- **Ablations:** no recency weighting (`τ = ∞`), no prior (`α = β = 0`), counts instead of timestamps.
- **Sweep:** τ ∈ {5, 10, 20, 30, 45, 60, 90, 180} days; α ∈ {0.5, 1, 2}; β ∈ {2, 4, 8}.

**Why this is the strongest study here.** It is retrospective, so it can run on already-logged data with no new trials; it has a real held-out structure, since each forecast uses only the past; and it can _refute_ Law 2 outright. If Brier score never beats the base rate, the evidence model is decoration however elegant the formula is.

**It also answers H4 empirically.** τ = 30 days was chosen because a habit should survive a holiday but not a job change — a judgement about people, not a derivation. The sweep replaces the judgement with a measurement.

---

## 7. Study 3 — Cold start

**Design.** Two 14-day periods, order randomised: one with declared onboarding seeds present, one with the graph starting empty. Only Study 1's arms B and C run during these windows.

**Caveat, and it is a real one.** Consecutive periods are not exchangeable — the user learns the tool, and the second fortnight is never a clean replay of the first. This study is therefore **exploratory**, and H5 will not be treated as confirmed on n=1 evidence. It is included because the direction is still informative, and because a _negative_ result would be meaningful: if seeds do not help, the onboarding questionnaire can be cut.

---

## 8. Analysis plan

**Paired bootstrap, not a t-test.** With 15 trials per arm and an edit-distance distribution that is bounded, skewed and probably bimodal, normality assumptions do not hold. Analysis is a 10,000-resample bootstrap of the difference in medians, reported as a point estimate with a 95% CI.

**Report effect sizes, not just intervals.** A statistically detectable improvement of 0.01 in normalised edit distance is not worth an architecture. The pre-registered threshold for _practical_ significance is **a 0.10 absolute reduction in median normalised edit distance**, chosen because that is roughly where a draft stops feeling like it needs rewriting.

**Multiplicity.** Three primary comparisons (C vs A, C vs B, C vs D). Holm correction across them. Secondary metrics are descriptive and will not carry significance claims.

**Everything gets reported.** Including null results, and including the arms where MNMA loses.

---

## 9. Threats to validity

Listed because naming them is the only defence available at n=1.

| Threat                      | Mitigation                                                                                        | Residual risk                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Experimenter expectancy** | Blinded arms; pre-registered rules; automated recording                                           | High — same person throughout                                                               |
| **Non-stationarity**        | Randomised interleaving, not sequential blocks                                                    | Medium — a job change mid-study affects all arms equally, which is why interleaving matters |
| **Autocorrelation**         | Trials are independent messages, not repeated measures of one state                               | Medium                                                                                      |
| **User adaptation**         | Cannot be removed; the user learns what Mochi drafts well and writes to it                        | **High and unfixable at n=1.** This alone means results are suggestive, not general         |
| **Optional stopping**       | Fixed n, fixed stopping rule, one instrumentation-only interim look                               | Low                                                                                         |
| **Metric gaming**           | Edit distance is behavioural; accepting a bad draft to improve the number costs the user directly | Low                                                                                         |
| **Selection of trials**     | All drafts logged, exclusions pre-defined and counted                                             | Low                                                                                         |
| **n = 1**                   | None available                                                                                    | **Fatal to generality.** See §11                                                            |

---

## 10. Instrumentation

Everything logged locally, in the same encrypted store as the brain. No telemetry, no upload.

**Per drafting trial:**

```
trialId, messageId, arm, timestamp,
contextTokens, draftLength, sentLength,
editDistance, prefixSurvival, acceptedUnedited,
graphAgeDays, usableEdgeCount, droppedFactCount
```

**Deliberately not logged:** draft text, sent text, recipients, subjects. Only the _derived_ distance is kept. This matters — a research log containing every message the user sent would be a far worse privacy exposure than anything MNMA otherwise creates, and the metric does not need it.

**Per observation, for Study 2:** edge key, timestamp, agrees/contradicts, provenance. This is already the graph's native format, so Study 2 runs on the brain file itself with no extra logging.

---

## 11. What would make this generalisable

It would not be. n=1 self-experimentation can establish that MNMA works _for one person_, and can outright refute the evidence model via Study 2, but it cannot support a claim about users in general.

To get further, in increasing order of difficulty:

1. **Study 2 at scale without any privacy cost.** Ask volunteers to run the offline analysis on their own brain file and report only the resulting Brier scores and optimal τ. No behavioural data changes hands — just a handful of numbers per participant. This is the highest-value next step and it is compatible with the architecture's privacy stance.
2. **A shared synthetic benchmark.** Generated behavioural traces with known ground-truth regime changes, so different memory architectures can be compared on the same data. Nothing like this exists for behavioural memory, and building it would be a contribution independent of MNMA.
3. **A multi-user draft-quality study.** Needs real recruitment, ethics review, and a way to collect edit distances without collecting messages. Substantial work.

Route 1 is achievable by one person. Routes 2 and 3 are not, and pretending otherwise in a write-up would be the same error as the token-savings claim.

---

## 12. Sequencing

| Phase | Work                                                                | Blocked on                 |
| ----- | ------------------------------------------------------------------- | -------------------------- |
| **1** | Instrument trials; write arm B; wire the four arms                  | Draft flow exists          |
| **2** | Study 2 — offline, on existing brain data                           | Enough observations logged |
| **3** | Collect Study 1 to n=60                                             | Phase 1                    |
| **4** | Study 3, exploratory                                                | Phase 3                    |
| **5** | Write up, including nulls; publish the synthetic benchmark if built | —                          |

Phase 2 first, deliberately. It is the cheapest, the most rigorous, and it can kill Law 2 before any effort is spent on a 15-week drafting study built on top of it.

---

## 13. What a negative result would mean

Worth deciding now, while it is still cheap to be honest.

- **H1 fails** — personalised context does not help drafting. Cut Tier 2 personalisation; the brain may still earn its place in coaching and nudge timing.
- **H2 fails but H1 holds** — a static persona is enough. Ship the questionnaire, delete the learning machinery. This is the most likely negative outcome and it would save an enormous amount of work.
- **H3 fails** — Law 2's confidence is not predictive. The whole evidence model is replaced by simple recency-ordered counts, and MNMA loses its most novel component.
- **H6 fails** — a straightforward bug, fix it.

The design that survives finding out it was wrong about itself is worth more than the one that was never tested.
