import type { CachedEmail, EmailPriorityResult, EmailPriorityTier } from './email-state.js';

export const EMAIL_SCORER_VERSION = 1;

export type PrioritySignal =
  | 'vip_sender'
  | 'direct_recipient'
  | 'important_label'
  | 'deadline'
  | 'action_requested'
  | 'question'
  | 'active_conversation'
  | 'automated_sender'
  | 'bulk_sender'
  | 'low_attention_category';

const DEADLINE =
  /\b(urgent|asap|deadline|due\s+(?:today|tomorrow|by)|time[- ]sensitive|before\s+(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday))\b/i;
const ACTION =
  /\b(action required|please (?:review|reply|respond|confirm|approve|send|share|complete)|need (?:your|a) (?:reply|response|approval|confirmation)|can you|could you|would you)\b/i;
const QUESTION = /\?/;
const AUTOMATED = /(?:^|[._-])(no-?reply|donotreply)(?:@|[._-])/i;
const BULK = /\b(newsletter|digest|notification|notifications|marketing|updates?)@/i;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function priorityTier(score: number): EmailPriorityTier {
  if (score >= 0.75) return 'urgent';
  if (score >= 0.4) return 'review';
  return 'low';
}

/**
 * What each signal means, in words a person would read.
 *
 * Exported because the UI shows these as chips. A signal list is structurally
 * incapable of being vacuous, which the free-prose `reason` is not — the model
 * sometimes returns "Urgent request for immediate attention" for a mail titled
 * "Urgent: action required now". Duplicating these strings in the renderer would
 * let the two drift.
 */
export const SIGNAL_LABELS: Readonly<Record<PrioritySignal, string>> = {
  vip_sender: 'VIP sender',
  direct_recipient: 'sent directly to you',
  important_label: 'marked important by Gmail',
  deadline: 'time-sensitive language',
  action_requested: 'asks you to take action',
  question: 'contains a question',
  active_conversation: 'active conversation',
  automated_sender: 'automated sender',
  bulk_sender: 'bulk email',
  low_attention_category: 'low-attention Gmail category',
};

/** `llm_refined` is appended by the triage service, so it is not a scorer signal. */
export function describeSignal(signal: string): string {
  if (signal === 'llm_refined') return 'checked by the model';
  return SIGNAL_LABELS[signal as PrioritySignal] ?? signal;
}

function reasonFor(signals: readonly PrioritySignal[]): string {
  if (signals.length === 0) return 'No strong priority signals';
  return signals.slice(0, 3).map(describeSignal).join(', ');
}

export function scoreEmailPriority(
  email: CachedEmail,
  vipSenders: readonly string[] = [],
): EmailPriorityResult {
  let score = 0.2;
  let positiveWeight = 0;
  let negativeWeight = 0;
  const signals: PrioritySignal[] = [];
  const subject = email.subject.trim();
  const sender = email.fromAddress.toLowerCase();
  const vip = new Set(vipSenders.map((value) => value.trim().toLowerCase()));

  const add = (signal: PrioritySignal, weight: number): void => {
    signals.push(signal);
    score += weight;
    if (weight >= 0) positiveWeight += weight;
    else negativeWeight += Math.abs(weight);
  };

  if (vip.has(sender)) add('vip_sender', 0.35);
  if (email.toAddresses.some((address) => address.toLowerCase() === email.account.toLowerCase())) {
    add('direct_recipient', 0.12);
  }
  if (email.labels.some((label) => /\\important|important/i.test(label))) {
    add('important_label', 0.2);
  }
  if (DEADLINE.test(subject)) add('deadline', 0.25);
  if (ACTION.test(subject)) add('action_requested', 0.2);
  if (QUESTION.test(subject)) add('question', 0.16);
  if (/^(?:re|fw|fwd):/i.test(subject)) add('active_conversation', 0.08);
  if (AUTOMATED.test(sender)) add('automated_sender', -0.5);
  else if (BULK.test(sender)) add('bulk_sender', -0.25);
  if (
    email.category === 'promotions' ||
    email.category === 'social' ||
    email.category === 'forums'
  ) {
    add('low_attention_category', -0.4);
  } else if (email.category === 'updates') {
    add('low_attention_category', -0.2);
  }

  const finalScore = clamp(score);
  const conflictPenalty = positiveWeight > 0 && negativeWeight > 0 ? 0.2 : 0;
  const evidence = Math.min(0.4, positiveWeight + negativeWeight);
  const confidence = clamp(0.55 + evidence - conflictPenalty);
  const automated = signals.includes('automated_sender') || signals.includes('bulk_sender');
  const replyLikely =
    !automated &&
    (signals.includes('question') ||
      signals.includes('action_requested') ||
      signals.includes('active_conversation'));

  return {
    score: finalScore,
    tier: priorityTier(finalScore),
    confidence,
    source: 'rules',
    signals,
    reason: reasonFor(signals),
    replyLikely,
  };
}

export function shouldEscalatePriority(result: EmailPriorityResult): boolean {
  const nearReview = Math.abs(result.score - 0.4) <= 0.08;
  const nearUrgent = Math.abs(result.score - 0.75) <= 0.08;
  const conflicting =
    result.signals.some((signal) =>
      ['vip_sender', 'important_label', 'deadline', 'action_requested'].includes(signal),
    ) &&
    result.signals.some((signal) =>
      ['automated_sender', 'bulk_sender', 'low_attention_category'].includes(signal),
    );
  return result.confidence < 0.75 || nearReview || nearUrgent || conflicting;
}
