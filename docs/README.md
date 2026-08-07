# docs

Background material. Nothing here is needed to build, run or contribute to Mochi —
the root `README.md` covers that, and `AGENT_INSTRUCTIONS.md` has the working rules
and the five gates.

These lived at the repository root until 2026-08-05. Thirteen markdown files were
the first thing a visitor saw, and most were planning notes rather than anything a
reader needs.

| File                                               | What it is                                                                            |
| :------------------------------------------------- | :------------------------------------------------------------------------------------ |
| [`RELEASING.md`](RELEASING.md)                     | How to ship a version, and the two steps CI cannot do                                 |
| [`UI.md`](UI.md)                                   | Desktop UI guidelines: motion scale, interaction states, and what each rule prevents  |
| [`FEASIBILITY_AUDIT.md`](FEASIBILITY_AUDIT.md)     | What was checked before committing to the approach                                    |
| [`LAUNCH_PLAN.md`](LAUNCH_PLAN.md)                 | How a first release was meant to go                                                   |
| [`SCALING_STRATEGY.md`](SCALING_STRATEGY.md)       | What would have to change if this got popular                                         |
| [`LLM_ROUTER_SECURITY.md`](LLM_ROUTER_SECURITY.md) | Threat model for the provider router — the renderer displays attacker-influenced text |

## A note on MNMA and `MOCHI_BRAIN.md`

Several comments in the source cite `MOCHI_BRAIN.md` or "MNMA" when explaining why
a decision went the way it did — the evidence model in
`packages/core/src/brain/confidence.ts`, the choice not to hash window titles in
`packages/core/src/activity/activity.ts`, the Tier 1 split in the activity
classifier.

**Those documents are deliberately not published.** They are personal research
notes on a local-first behavioural memory, kept out of the repository rather than
tidied up for an audience. Said here so that anyone who searches for the filename
knows it is absent on purpose and has not gone missing.

The code does not depend on them. `packages/core/src/brain/` is complete, tested,
and reads on its own — though it is worth knowing that nothing currently calls it,
so treat the brain as built rather than running.
