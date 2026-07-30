/**
 * Deterministic-first email priority classification.
 *
 * Rules classify every message for free. Only a small ambiguous batch is allowed
 * to reach the cheap `triage` LLM route, and the cap is a **throttle, not a
 * cliff**: whatever does not fit is picked up on a later pass.
 *
 * It used to be a cliff, and silently. The escalation list was derived from
 * `pending` — emails with no priority, or one from an older scorer version — and
 * the rules pass had just given every one of them a current-version priority. So
 * anything past `slice(0, 10)` dropped out of `pending` on the next run and was
 * never escalated again. The eleventh ambiguous email stayed rules-only for ever,
 * and nothing said so.
 *
 * Fixing that alone would have produced the opposite bug. A model answer below
 * the confidence bar is discarded, and a model that omits an email answers
 * nothing at all — in both cases the record stays `source: 'rules'`, so a
 * candidate list built from "ambiguous and not yet blended" would ask about the
 * same undecidable email on every sync, for ever, burning tokens each time.
 *
 * So *being asked* is recorded separately from *being answered*, in the signals
 * array rather than a new column:
 *
 * - `llm_refined` — the model answered and the verdict was blended in.
 * - `llm_declined` — the model was asked and its answer was unusable or absent.
 *
 * Either marker means "do not ask again". Neither is set when the call itself
 * failed: a network blip is not an answer, and marking it as one would quietly
 * exclude those emails permanently — the exact failure being fixed here.
 */

import {
  buildEmailPriorityPrompt,
  EMAIL_PRIORITY_PROMPT_LIMIT,
  EMAIL_SCORER_VERSION,
  parseEmailPriorityResponse,
  priorityTier,
  scoreEmailPriority,
  shouldEscalatePriority,
  type CachedInboxItem,
  type EmailStore,
  type StoredEmailPriority,
} from '@mochi/core';
import type { SettingsStore } from '../storage/settings-store.js';
import type { LlmClient } from './llm-client.js';

/**
 * How many ambiguous emails may reach the model per pass.
 *
 * A throttle on cost and latency, not a limit on how many can ever be checked —
 * the remainder is escalated on the next sync.
 *
 * Never more than one prompt can carry. `buildEmailPriorityPrompt` truncates
 * silently, so a larger batch here would mark the overflow `llm_declined` for
 * emails that were never in the prompt at all.
 */
const LLM_BATCH_LIMIT = Math.min(10, EMAIL_PRIORITY_PROMPT_LIMIT);

/** Set once a model has been asked, whatever came back. */
const ASKED_MARKERS = ['llm_refined', 'llm_declined'] as const;

function alreadyAsked(priority: StoredEmailPriority): boolean {
  return priority.signals.some((signal) => (ASKED_MARKERS as readonly string[]).includes(signal));
}

export class EmailTriageService {
  constructor(
    private readonly llm: LlmClient,
    private readonly store: EmailStore,
    private readonly settings: SettingsStore,
  ) {}

  async classifyInbox(account: string, force = false): Promise<void> {
    if (!this.settings.get().gmailAi.priorityEnabled) return;
    const inbox = await this.store.listCachedEmails(account, { limit: 100 });
    if (inbox.length === 0) return;

    /** The priority in force for each email, freshly scored or already stored. */
    const current = new Map<string, StoredEmailPriority>();
    for (const email of inbox) {
      if (email.priority !== null) current.set(email.emailId, email.priority);
    }

    const pending = force
      ? inbox
      : inbox.filter(
          (email) =>
            email.priority === null || email.priority.scorerVersion !== EMAIL_SCORER_VERSION,
        );

    for (const email of pending) {
      const result = scoreEmailPriority(email, this.settings.get().gmailAi.vipSenders);
      const stored: StoredEmailPriority = {
        ...result,
        account,
        emailId: email.emailId,
        scorerVersion: EMAIL_SCORER_VERSION,
        classifiedAt: Date.now(),
      };
      current.set(email.emailId, stored);
      await this.store.saveEmailPriority(stored);
    }

    // Checked before the candidate list: asking a model that is not configured
    // costs a full pass over the inbox and is discarded the moment `generate`
    // answers "No model is set up yet."
    if (!this.llm.hasAnyModel) return;

    // Drawn from the whole inbox, not just what was rescored this pass — that
    // narrowing is what made the cap permanent, and it is the exact bug this
    // file's header describes. Do not narrow it back to `pending`.
    const candidates = inbox
      .filter((email) => {
        const priority = current.get(email.emailId);
        if (priority === undefined) return false;
        if (!shouldEscalatePriority(priority)) return false;
        return force || !alreadyAsked(priority);
      })
      // Highest-scoring first, so when the batch is full the ones most likely to
      // matter are the ones that got a second opinion.
      .sort((a, b) => (current.get(b.emailId)?.score ?? 0) - (current.get(a.emailId)?.score ?? 0));

    if (candidates.length === 0) return;

    const batch = candidates.slice(0, LLM_BATCH_LIMIT);
    if (candidates.length > batch.length) {
      console.log(
        `[triage] ${candidates.length} ambiguous emails, asking about ${batch.length} this pass — ` +
          'the rest follow on the next sync',
      );
    }

    // Mapped over `batch`, not the full candidate list, so the throttle above
    // is what actually reaches the prompt.
    const promptItems: { email: CachedInboxItem; snippet: string }[] = batch.map((email) => ({
      email,
      // Classification is metadata-only. Complete bodies are reserved for
      // the separately consented draft-generation path.
      snippet: email.snippet.slice(0, 150),
    }));

    const prompt = buildEmailPriorityPrompt(promptItems);
    const response = await this.llm.generate({
      task: 'triage',
      system: prompt.system,
      prompt: prompt.prompt,
    });
    if (!response.ok) {
      // Said out loud, and deliberately unmarked: these are retried next sync
      // rather than written off as answered.
      console.log(
        `[triage] model call failed for ${batch.length} email(s), will retry: ${response.reason}`,
      );
      return;
    }

    const decisions = parseEmailPriorityResponse(response.text);
    const applied = new Set<string>();

    for (const decision of decisions) {
      const rules = current.get(decision.id);
      if (rules === undefined) continue;
      // Below the bar the rules result stands. Still counts as asked.
      if (decision.confidence < 0.75) continue;

      const modelScore =
        decision.priority === 'high' ? 0.85 : decision.priority === 'medium' ? 0.55 : 0.2;
      const score = rules.score * 0.4 + modelScore * 0.6;
      applied.add(decision.id);
      await this.store.saveEmailPriority({
        ...rules,
        score,
        tier: priorityTier(score),
        confidence: decision.confidence,
        source: 'blended',
        signals: [...rules.signals, 'llm_refined'],
        reason: decision.reason,
        replyLikely: decision.replyLikely,
        classifiedAt: Date.now(),
      });
    }

    // Everything asked about that did not come back usable. Marked so the next
    // pass spends its budget on emails no model has seen yet.
    for (const email of batch) {
      if (applied.has(email.emailId)) continue;
      const rules = current.get(email.emailId);
      if (rules === undefined || alreadyAsked(rules)) continue;
      await this.store.saveEmailPriority({
        ...rules,
        signals: [...rules.signals, 'llm_declined'],
        classifiedAt: Date.now(),
      });
    }
  }
}
