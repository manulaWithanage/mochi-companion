import { describe, expect, it } from 'vitest';
import type { DiscoveredModel } from './providers.js';
import {
  checkBudget,
  DEFAULT_BUDGET,
  emptyBudget,
  localDay,
  recordUsage,
  route,
  selectModel,
  spentToday,
  TASKS,
  type BudgetState,
} from './router.js';

const now = new Date(2026, 0, 15, 10, 0, 0);
const tomorrow = new Date(2026, 0, 16, 10, 0, 0);

const model = (
  id: string,
  provider: DiscoveredModel['provider'],
  caps: DiscoveredModel['capabilities'] = ['text', 'tools'],
): DiscoveredModel => ({ id, provider, capabilities: caps });

const LOCAL = model('qwen2.5:14b', 'ollama');
const LOCAL_SMALL = model('llama3.2:3b', 'ollama', ['text']);
const GOOGLE = model('gemini-x', 'google');
const ANTHROPIC = model('claude-x', 'anthropic');
const VISION = model('gpt-x', 'openai', ['text', 'tools', 'vision']);

describe('selectModel', () => {
  it('explains itself when nothing is set up', () => {
    const r = selectModel(TASKS.chat, []);
    expect(r.kind).toBe('unavailable');
    if (r.kind !== 'unavailable') return;
    expect(r.reason).toBe('no-models');
    expect(r.message).toContain('Ollama');
  });

  it('prefers the cheapest for background tasks', () => {
    // A briefing must never reach for the expensive model on its own.
    const r = selectModel(TASKS.briefing, [ANTHROPIC, GOOGLE, LOCAL]);
    expect(r.kind).toBe('use');
    if (r.kind !== 'use') return;
    expect(r.model.provider).toBe('ollama');
  });

  it('prefers the strongest for user-initiated tasks', () => {
    const r = selectModel(TASKS.draft, [LOCAL, GOOGLE, ANTHROPIC]);
    expect(r.kind).toBe('use');
    if (r.kind !== 'use') return;
    expect(r.model.provider).toBe('anthropic');
  });

  it('filters on capability before preference', () => {
    // Screen Helper needs vision; the cheap local model cannot do it.
    const r = selectModel(TASKS.screen, [LOCAL, VISION]);
    expect(r.kind).toBe('use');
    if (r.kind !== 'use') return;
    expect(r.model.id).toBe('gpt-x');
  });

  it('reports which capability is missing', () => {
    const r = selectModel(TASKS.screen, [LOCAL, LOCAL_SMALL]);
    expect(r.kind).toBe('unavailable');
    if (r.kind !== 'unavailable') return;
    expect(r.reason).toBe('no-capable-model');
    expect(r.message).toContain('vision');
    expect(r.message).toContain('Screen Helper');
  });

  it('honours a pin', () => {
    const r = selectModel(TASKS.briefing, [LOCAL, ANTHROPIC], {
      pinned: { briefing: 'claude-x' },
    });
    expect(r.kind).toBe('use');
    if (r.kind !== 'use') return;
    expect(r.model.id).toBe('claude-x');
    expect(r.reason).toBe('pinned');
  });

  it('never lets a pin override capability', () => {
    // Honouring it would fail confusingly at call time instead of here.
    const r = selectModel(TASKS.screen, [LOCAL, VISION], { pinned: { screen: 'qwen2.5:14b' } });
    expect(r.kind).toBe('use');
    if (r.kind !== 'use') return;
    expect(r.model.id).toBe('gpt-x');
  });

  it('degrades rather than breaking when a pin points at a removed model', () => {
    const r = selectModel(TASKS.chat, [LOCAL], { pinned: { chat: 'deleted-model' } });
    expect(r.kind).toBe('use');
    if (r.kind !== 'use') return;
    expect(r.reason).toBe('auto');
  });
});

describe('budget accounting', () => {
  it('accumulates within a day', () => {
    let s = recordUsage(emptyBudget, 100, now);
    s = recordUsage(s, 250, now);
    expect(spentToday(s, now)).toBe(350);
  });

  it('resets when the local day rolls over', () => {
    const s = recordUsage(emptyBudget, 5000, now);
    expect(spentToday(s, tomorrow)).toBe(0);
  });

  it('uses local dates, not UTC', () => {
    // A budget should reset at the user's midnight, not London's.
    const lateLocal = new Date(2026, 0, 15, 23, 30, 0);
    expect(localDay(lateLocal)).toBe('2026-01-15');
  });

  it('ignores negative and fractional usage', () => {
    let s = recordUsage(emptyBudget, -500, now);
    expect(spentToday(s, now)).toBe(0);
    s = recordUsage(s, 10.6, now);
    expect(spentToday(s, now)).toBe(11);
  });
});

describe('checkBudget', () => {
  const state: BudgetState = { day: localDay(now), spent: 900 };

  it('passes below the cap', () => {
    const v = checkBudget(state, { dailyTokenCap: 1000, onExceed: 'pause' }, now, 50);
    expect(v.withinBudget).toBe(true);
    expect(v.remaining).toBe(100);
  });

  it('fails when the projected spend would exceed it', () => {
    // Checks what the call will cost, not just what has been spent.
    const v = checkBudget(state, { dailyTokenCap: 1000, onExceed: 'pause' }, now, 500);
    expect(v.withinBudget).toBe(false);
    expect(v.action).toBe('pause');
  });

  it('treats a zero cap as disabled', () => {
    const v = checkBudget(state, { dailyTokenCap: 0, onExceed: 'pause' }, now, 999_999);
    expect(v.withinBudget).toBe(true);
    expect(v.action).toBeNull();
  });

  it('ignores spend from a previous day', () => {
    const stale: BudgetState = { day: '2026-01-14', spent: 999_999 };
    expect(checkBudget(stale, DEFAULT_BUDGET, now).withinBudget).toBe(true);
  });
});

describe('route', () => {
  const broke: BudgetState = { day: localDay(now), spent: 1_000_000 };
  // Above TASKS.chat.maxTokens, so the cap is reachable rather than
  // impossible — the two failure modes are distinct and both tested below.
  const cfg = { dailyTokenCap: 5000, onExceed: 'downgrade-to-local' as const };

  it('routes normally within budget', () => {
    const r = route(TASKS.chat, [ANTHROPIC], emptyBudget, DEFAULT_BUDGET, now);
    expect(r.kind).toBe('use');
  });

  it('falls back to local when the budget is spent', () => {
    // Keeps Mochi working instead of silently going dead.
    const r = route(TASKS.chat, [ANTHROPIC, LOCAL], broke, cfg, now);
    expect(r.kind).toBe('use');
    if (r.kind !== 'use') return;
    expect(r.model.provider).toBe('ollama');
  });

  it('stops when the budget is spent and there is no local model', () => {
    const r = route(TASKS.chat, [ANTHROPIC], broke, cfg, now);
    expect(r.kind).toBe('unavailable');
    if (r.kind !== 'unavailable') return;
    expect(r.reason).toBe('budget-exhausted');
    expect(r.message).toContain('Settings');
  });

  it('pauses rather than downgrading when configured to', () => {
    const r = route(TASKS.chat, [ANTHROPIC, LOCAL], broke, { ...cfg, onExceed: 'pause' }, now);
    expect(r.kind).toBe('unavailable');
  });

  it('recovers the next day', () => {
    const r = route(TASKS.chat, [ANTHROPIC], broke, cfg, tomorrow);
    expect(r.kind).toBe('use');
  });

  it('says the cap is too low rather than blaming usage', () => {
    // A cap under one call's ceiling means the task can never run, however
    // little was spent. "Budget reached" would send the user hunting for
    // usage they have not made.
    const tinyCap = { dailyTokenCap: 100, onExceed: 'pause' as const };
    const r = route(TASKS.chat, [ANTHROPIC], emptyBudget, tinyCap, now);
    expect(r.kind).toBe('unavailable');
    if (r.kind !== 'unavailable') return;
    expect(r.message).toContain('daily cap');
    expect(r.message).not.toContain('budget reached');
  });
});

describe('TASKS', () => {
  it('caps tokens per call so one response cannot drain the day', () => {
    for (const t of Object.values(TASKS)) {
      expect(t.maxTokens).toBeGreaterThan(0);
      expect(t.maxTokens).toBeLessThanOrEqual(2000);
    }
  });

  it('never lets a background task prefer the expensive model', () => {
    // The rule that stops Mochi quietly spending the user's money.
    expect(TASKS.phrase.prefer).toBe('cheap');
    expect(TASKS.briefing.prefer).toBe('cheap');
    expect(TASKS.triage.prefer).toBe('cheap');
  });
});
