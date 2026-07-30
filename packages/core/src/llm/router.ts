/**
 * Task → model routing, and the spend guard.
 *
 * Two ideas do the work here.
 *
 * **Per-task routing.** Most BYOK apps ship one global model picker and then
 * bill the user's strongest model for a background summary. Routing per task
 * lets a briefing use whatever is cheapest while drafting uses the best
 * available.
 *
 * **The budget guard.** BYOK means the *user* pays. An assistant that quietly
 * runs up real charges gets uninstalled and written about, so a daily cap and
 * a visible spend meter are a product requirement rather than a nicety.
 *
 * Pure logic — no network, no clock, no keys.
 */

import type { Capability, DiscoveredModel, ProviderId } from './providers.js';
import { isLocalProvider, supports } from './providers.js';

export type TaskId =
  'phrase' | 'briefing' | 'triage' | 'chat' | 'draft' | 'background-draft' | 'screen';

export interface TaskSpec {
  readonly id: TaskId;
  readonly label: string;
  readonly requires: readonly Capability[];
  /** Ceiling per call, so one runaway response cannot drain the day's budget. */
  readonly maxTokens: number;
  /**
   * `cheap` for anything Mochi does on its own; `best` only for work the user
   * explicitly asked for. Background tasks must never reach for the
   * expensive model by default.
   */
  readonly prefer: 'cheap' | 'best';
}

export const TASKS: Record<TaskId, TaskSpec> = {
  phrase: {
    id: 'phrase',
    label: 'Wording a message',
    requires: ['text'],
    maxTokens: 120,
    prefer: 'cheap',
  },
  briefing: {
    id: 'briefing',
    label: 'Morning briefing',
    requires: ['text'],
    maxTokens: 600,
    prefer: 'cheap',
  },
  triage: {
    id: 'triage',
    label: 'Email triage',
    requires: ['text'],
    maxTokens: 400,
    prefer: 'cheap',
  },
  chat: { id: 'chat', label: 'Chat', requires: ['text'], maxTokens: 2000, prefer: 'best' },
  draft: {
    id: 'draft',
    label: 'Drafting a reply',
    requires: ['text'],
    maxTokens: 1500,
    prefer: 'best',
  },
  'background-draft': {
    id: 'background-draft',
    label: 'Preparing an email draft',
    requires: ['text'],
    maxTokens: 700,
    prefer: 'cheap',
  },
  screen: {
    id: 'screen',
    label: 'Screen Helper',
    requires: ['text', 'vision'],
    maxTokens: 1000,
    prefer: 'best',
  },
};

/**
 * Rough cost ordering. Local is free, so it always wins a `cheap` task.
 * Deliberately coarse — this ranks providers, it does not price them.
 */
const COST_RANK: Record<ProviderId, number> = {
  // Local runtimes are free, so they always win a `cheap` task.
  ollama: 0,
  lmstudio: 0,
  google: 1,
  openai: 2,
  anthropic: 2,
  // Same models as OpenAI, so the same rank. Omitting it made the sort
  // comparator return NaN, which silently randomises the order rather than
  // failing — `Record<ProviderId, number>` is what catches that at compile
  // time, so this map must gain an entry with every new provider.
  azure: 2,
};

export interface RouterPreferences {
  /** Explicit per-task pin. Overrides preference, never capability. */
  readonly pinned?: Partial<Record<TaskId, string>>;
}

export type Resolution =
  | { readonly kind: 'use'; readonly model: DiscoveredModel; readonly reason: 'pinned' | 'auto' }
  | {
      readonly kind: 'unavailable';
      readonly reason: 'no-models' | 'no-capable-model' | 'budget-exhausted';
      readonly message: string;
    };

/**
 * Pick a model for a task.
 *
 * Capability is a hard filter and preference is only a sort — a pinned model
 * that cannot do the job is still rejected, because honouring the pin would
 * produce a confusing runtime failure instead of a clear message.
 */
export function selectModel(
  task: TaskSpec,
  available: readonly DiscoveredModel[],
  prefs: RouterPreferences = {},
): Resolution {
  if (available.length === 0) {
    return {
      kind: 'unavailable',
      reason: 'no-models',
      message: 'No model is set up yet. Start Ollama, or add an API key in Settings.',
    };
  }

  const capable = available.filter((m) => supports(m, task.requires));
  if (capable.length === 0) {
    const missing = task.requires.filter((c) => !available.some((m) => m.capabilities.includes(c)));
    return {
      kind: 'unavailable',
      reason: 'no-capable-model',
      message: `${task.label} needs ${missing.join(' and ')}, which none of your models support.`,
    };
  }

  const pin = prefs.pinned?.[task.id];
  if (pin !== undefined) {
    const pinned = capable.find((m) => m.id === pin);
    if (pinned !== undefined) return { kind: 'use', model: pinned, reason: 'pinned' };
    // Pin exists but is incapable or gone — fall through to automatic choice
    // rather than failing, so a stale pin degrades instead of breaking.
  }

  const sorted = [...capable].sort((a, b) => {
    const delta = COST_RANK[a.provider] - COST_RANK[b.provider];
    return task.prefer === 'cheap' ? delta : -delta;
  });

  return { kind: 'use', model: sorted[0]!, reason: 'auto' };
}

// ---------------------------------------------------------------------------
// Budget
// ---------------------------------------------------------------------------

export type BudgetAction = 'downgrade-to-local' | 'pause' | 'ask';

export interface BudgetConfig {
  /** Tokens per day across every provider. Zero disables the guard. */
  readonly dailyTokenCap: number;
  readonly onExceed: BudgetAction;
}

export const DEFAULT_BUDGET: BudgetConfig = {
  // Generous for normal use, low enough that a runaway loop is caught the
  // same day rather than at the end of the month.
  dailyTokenCap: 200_000,
  onExceed: 'downgrade-to-local',
};

export interface BudgetState {
  /** Local date `YYYY-MM-DD`; spend resets when this rolls over. */
  readonly day: string;
  readonly spent: number;
}

export const emptyBudget: BudgetState = { day: '', spent: 0 };

/** Local date, not UTC — a budget should reset at the user's midnight. */
export function localDay(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function recordUsage(state: BudgetState, tokens: number, now: Date): BudgetState {
  const day = localDay(now);
  const spent = state.day === day ? state.spent : 0;
  return { day, spent: spent + Math.max(0, Math.round(tokens)) };
}

export function spentToday(state: BudgetState, now: Date): number {
  return state.day === localDay(now) ? state.spent : 0;
}

export interface BudgetVerdict {
  readonly withinBudget: boolean;
  readonly spent: number;
  readonly remaining: number;
  readonly action: BudgetAction | null;
}

export function checkBudget(
  state: BudgetState,
  config: BudgetConfig,
  now: Date,
  aboutToSpend = 0,
): BudgetVerdict {
  const spent = spentToday(state, now);

  if (config.dailyTokenCap <= 0) {
    return { withinBudget: true, spent, remaining: Number.POSITIVE_INFINITY, action: null };
  }

  const projected = spent + Math.max(0, aboutToSpend);
  const withinBudget = projected <= config.dailyTokenCap;
  return {
    withinBudget,
    spent,
    remaining: Math.max(0, config.dailyTokenCap - spent),
    action: withinBudget ? null : config.onExceed,
  };
}

/**
 * Route a task, honouring the budget.
 *
 * `downgrade-to-local` is the default because it keeps Mochi working rather
 * than silently going dead once the cap is hit — but only if a local model
 * exists. Without one it becomes a pause, with a message saying so.
 */
export function route(
  task: TaskSpec,
  available: readonly DiscoveredModel[],
  budget: BudgetState,
  config: BudgetConfig,
  now: Date,
  prefs: RouterPreferences = {},
): Resolution {
  const verdict = checkBudget(budget, config, now, task.maxTokens);

  if (!verdict.withinBudget) {
    if (verdict.action === 'downgrade-to-local') {
      // Any local runtime, not just Ollama. Hardcoding one provider here meant
      // an LM Studio user hit "budget reached" with a free model sitting idle.
      const local = available.filter((m) => isLocalProvider(m.provider));
      if (local.length > 0) return selectModel(task, local, prefs);
    }

    // A cap below one call's ceiling means this task can never run, however
    // little has been spent. Saying "budget reached" there sends the user
    // looking for usage they have not made.
    const capTooLow = config.dailyTokenCap > 0 && task.maxTokens > config.dailyTokenCap;
    return {
      kind: 'unavailable',
      reason: 'budget-exhausted',
      message: capTooLow
        ? `${task.label} can use up to ${task.maxTokens.toLocaleString()} tokens, but your daily cap is ${config.dailyTokenCap.toLocaleString()}. Raise the cap in Settings.`
        : `Daily token budget reached (${verdict.spent.toLocaleString()} used). Raise it in Settings, or run a local model.`,
    };
  }

  return selectModel(task, available, prefs);
}
