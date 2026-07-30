import { describe, expect, it } from 'vitest';
import {
  BRAIN_SCHEMA_VERSION,
  correct,
  edgeKey,
  emptyGraph,
  findEdge,
  observe,
  parseGraph,
  suppress,
  upsertNode,
  type BrainEdge,
  type BrainGraph,
} from './graph.js';
import {
  confidenceOf,
  describeConfidence,
  isDrifting,
  isSpent,
  isUsable,
  USABILITY_FLOOR,
  weightedCount,
  DAY_MS,
} from './confidence.js';
import {
  buildWorkProfile,
  currentStreak,
  deepWorkRatio,
  hourLabel,
  median,
  peakWindow,
  sustainedCeilingMs,
  MIN_SAMPLE,
} from './stats.js';
import { assembleContext, CONTEXT_TOKEN_CEILING, estimateTokens } from './context.js';
import type { WorkSession } from '../timer/session.js';

const NOW = new Date('2026-07-30T18:00:00').getTime();
const daysAgo = (n: number): number => NOW - n * DAY_MS;

const session = (startedAt: number, minutes: number, projectId = 'p1'): WorkSession => ({
  id: `s-${startedAt}-${minutes}`,
  projectId,
  startedAt,
  endedAt: startedAt + minutes * 60_000,
});

/** A session starting at a given hour, `d` days ago. */
const at = (hour: number, minutes: number, d = 0): WorkSession => {
  const day = new Date(NOW);
  day.setDate(day.getDate() - d);
  day.setHours(hour, 0, 0, 0);
  return session(day.getTime(), minutes);
};

// ---------------------------------------------------------------------------
// Law 1 — graph
// ---------------------------------------------------------------------------

describe('graph', () => {
  const seeded = upsertNode(
    upsertNode(emptyGraph, { id: 'VS_Code', type: 'app' }),
    { id: 'peak', type: 'time_window' },
  );

  it('creates an edge on first observation', () => {
    const g = observe(seeded, {
      from: 'VS_Code',
      to: 'peak',
      relation: 'active_during',
      provenance: 'inferred',
      at: NOW,
    });
    expect(findEdge(g, { from: 'VS_Code', to: 'peak', relation: 'active_during' })?.confirms)
      .toHaveLength(1);
  });

  it('accumulates observations on the same edge rather than duplicating it', () => {
    let g = seeded;
    for (let i = 0; i < 3; i++) {
      g = observe(g, {
        from: 'VS_Code',
        to: 'peak',
        relation: 'active_during',
        provenance: 'inferred',
        at: daysAgo(i),
      });
    }
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0]?.confirms).toHaveLength(3);
  });

  it('records disagreement as a contradiction, not a separate edge', () => {
    // Contradiction being just an observation is what lets one formula handle
    // reinforcement, decay and regime shift together.
    let g = observe(seeded, {
      from: 'VS_Code',
      to: 'peak',
      relation: 'active_during',
      provenance: 'inferred',
      at: daysAgo(2),
    });
    g = observe(g, {
      from: 'VS_Code',
      to: 'peak',
      relation: 'active_during',
      provenance: 'inferred',
      at: NOW,
      agrees: false,
    });
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0]?.contradicts).toHaveLength(1);
  });

  it('upgrades provenance when a guess is later confirmed by the user', () => {
    let g = observe(seeded, {
      from: 'VS_Code',
      to: 'peak',
      relation: 'active_during',
      provenance: 'inferred',
      at: NOW,
    });
    g = observe(g, {
      from: 'VS_Code',
      to: 'peak',
      relation: 'active_during',
      provenance: 'declared',
      at: NOW,
    });
    expect(g.edges[0]?.provenance).toBe('declared');
  });

  it('never downgrades provenance', () => {
    let g = observe(seeded, {
      from: 'VS_Code',
      to: 'peak',
      relation: 'active_during',
      provenance: 'declared',
      at: NOW,
    });
    g = observe(g, {
      from: 'VS_Code',
      to: 'peak',
      relation: 'active_during',
      provenance: 'inferred',
      at: NOW,
    });
    expect(g.edges[0]?.provenance).toBe('declared');
  });

  it('lets a correction outrank piles of machine evidence at once', () => {
    let g = seeded;
    for (let i = 0; i < 20; i++) {
      g = observe(g, {
        from: 'VS_Code',
        to: 'peak',
        relation: 'active_during',
        provenance: 'inferred',
        at: daysAgo(i),
      });
    }
    g = correct(g, {
      from: 'VS_Code',
      to: 'peak',
      relation: 'active_during',
      provenance: 'declared',
      at: NOW,
      agrees: false,
    });
    const edge = g.edges[0]!;
    // Clearing rather than adding: the user should not have to out-vote twenty
    // stale observations one click at a time.
    expect(edge.confirms).toHaveLength(0);
    expect(edge.contradicts).toHaveLength(1);
  });

  it('keeps a deleted belief suppressed so it is not relearned', () => {
    const g = suppress(
      observe(seeded, {
        from: 'VS_Code',
        to: 'peak',
        relation: 'active_during',
        provenance: 'inferred',
        at: NOW,
      }),
      { from: 'VS_Code', to: 'peak', relation: 'active_during' },
    );
    expect(g.edges[0]?.suppressed).toBe(true);
    expect(confidenceOf(g.edges[0]!, { now: NOW })).toBe(0);
  });

  it('builds a stable edge key', () => {
    expect(edgeKey({ from: 'a', to: 'b', relation: 'r' })).toBe('a|r|b');
  });
});

describe('parseGraph', () => {
  it('returns an empty graph for junk rather than throwing', () => {
    // The brain file is on disk and may be corrupted; it must not stop startup.
    for (const junk of [null, undefined, 42, 'nope', [], {}]) {
      expect(parseGraph(junk).nodes).toEqual([]);
    }
  });

  it('drops edges pointing at nodes that do not exist', () => {
    // A dangling edge would render into a context package naming nothing.
    const parsed = parseGraph({
      nodes: [{ id: 'a', type: 'app' }],
      edges: [{ from: 'a', to: 'ghost', relation: 'x' }],
    });
    expect(parsed.edges).toHaveLength(0);
  });

  it('drops nodes with an unknown type', () => {
    expect(parseGraph({ nodes: [{ id: 'a', type: 'wormhole' }] }).nodes).toHaveLength(0);
  });

  it('defaults unknown provenance to inferred, the least trusted', () => {
    const parsed = parseGraph({
      nodes: [
        { id: 'a', type: 'app' },
        { id: 'b', type: 'habit' },
      ],
      edges: [{ from: 'a', to: 'b', relation: 'x', provenance: 'gospel' }],
    });
    expect(parsed.edges[0]?.provenance).toBe('inferred');
  });

  it('stamps the current schema version', () => {
    expect(parseGraph({}).version).toBe(BRAIN_SCHEMA_VERSION);
  });
});

// ---------------------------------------------------------------------------
// Law 2 — evidence model
// ---------------------------------------------------------------------------

const inferred = (confirms: readonly number[], contradicts: readonly number[] = []): BrainEdge => ({
  from: 'a',
  to: 'b',
  relation: 'r',
  provenance: 'inferred',
  confirms,
  contradicts,
});

describe('weightedCount', () => {
  it('weights a fresh observation at ~1', () => {
    expect(weightedCount([NOW], NOW)).toBeCloseTo(1, 5);
  });

  it('discounts older observations', () => {
    expect(weightedCount([daysAgo(30)], NOW)).toBeLessThan(weightedCount([daysAgo(1)], NOW));
  });

  it('does not let a future timestamp manufacture confidence', () => {
    // A clock change or a hand-edited file must not exceed weight 1.
    expect(weightedCount([NOW + 999 * DAY_MS], NOW)).toBeCloseTo(1, 5);
  });

  it('scales the half-life to the pattern cadence', () => {
    // The fix for the original contradiction: a weekly habit judged on a daily
    // clock decayed before its second confirmation could ever arrive.
    const weekOld = [daysAgo(14)];
    expect(weightedCount(weekOld, NOW, 'weekly')).toBeGreaterThan(
      weightedCount(weekOld, NOW, 'daily'),
    );
  });
});

describe('confidenceOf', () => {
  it('quarantines a single guess below the usability floor', () => {
    expect(confidenceOf(inferred([NOW]), { now: NOW })).toBeLessThan(USABILITY_FLOOR);
  });

  it('lets repeated confirmation cross the floor', () => {
    const many = [0, 1, 2, 3, 4, 5, 6].map((d) => daysAgo(d));
    expect(confidenceOf(inferred(many), { now: NOW })).toBeGreaterThanOrEqual(USABILITY_FLOOR);
  });

  it('trusts what the user declared immediately', () => {
    // This is the cold-start fix. The original seeded onboarding answers at 0.30
    // and then filtered below 0.50, silently discarding the questionnaire.
    const declared: BrainEdge = { ...inferred([NOW]), provenance: 'declared' };
    expect(confidenceOf(declared, { now: NOW })).toBe(1);
    expect(isUsable(declared, { now: NOW })).toBe(true);
  });

  it('trusts computed arithmetic immediately', () => {
    const computed: BrainEdge = { ...inferred([NOW]), provenance: 'computed' };
    expect(confidenceOf(computed, { now: NOW })).toBe(1);
  });

  it('stops trusting a declaration the user has since contradicted', () => {
    const stale: BrainEdge = {
      ...inferred([daysAgo(200)], [NOW, daysAgo(1), daysAgo(2)]),
      provenance: 'declared',
    };
    expect(confidenceOf(stale, { now: NOW })).toBeLessThan(1);
  });

  it('lets a job change overturn a long-held habit', () => {
    // The original said core habits "never decay", which made this permanently
    // unlearnable and then needed separate drift detection to work around it.
    const oldHabit = [10, 12, 14, 16, 18, 20, 22, 24].map((d) => daysAgo(d));
    const before = confidenceOf(inferred(oldHabit), { now: NOW });
    const after = confidenceOf(
      inferred(oldHabit, [0, 1, 2, 3, 4, 5].map((d) => daysAgo(d))),
      { now: NOW },
    );
    expect(before).toBeGreaterThanOrEqual(USABILITY_FLOOR);
    expect(after).toBeLessThan(USABILITY_FLOOR);
  });

  it('lets a weekly habit become usable, given weeks', () => {
    // The case the original design made impossible.
    const fridays = [0, 7, 14, 21, 28, 35].map((d) => daysAgo(d));
    expect(confidenceOf(inferred(fridays), { now: NOW, cadence: 'weekly' })).toBeGreaterThanOrEqual(
      USABILITY_FLOOR,
    );
  });

  it('returns zero for a suppressed edge whatever its evidence', () => {
    const many = [0, 1, 2, 3, 4, 5, 6, 7].map((d) => daysAgo(d));
    expect(confidenceOf({ ...inferred(many), suppressed: true }, { now: NOW })).toBe(0);
  });
});

describe('isSpent', () => {
  it('marks a stale one-off as carrying no information', () => {
    expect(isSpent(inferred([daysAgo(400)]), { now: NOW })).toBe(true);
  });

  it('keeps a heavily confirmed edge even when it is old', () => {
    const many = Array.from({ length: 40 }, (_, i) => daysAgo(30 + i));
    expect(isSpent(inferred(many), { now: NOW })).toBe(false);
  });

  it('never discards what the user declared', () => {
    const declared: BrainEdge = { ...inferred([daysAgo(999)]), provenance: 'declared' };
    expect(isSpent(declared, { now: NOW })).toBe(false);
  });
});

describe('isDrifting', () => {
  it('spots recent evidence turning against a belief', () => {
    const edge = inferred(
      [10, 12, 14, 16].map((d) => daysAgo(d)),
      [0, 1].map((d) => daysAgo(d)),
    );
    expect(isDrifting(edge, { now: NOW })).toBe(true);
  });

  it('is quiet for a consistently confirmed belief', () => {
    expect(isDrifting(inferred([0, 1, 2, 3].map((d) => daysAgo(d))), { now: NOW })).toBe(false);
  });
});

describe('describeConfidence', () => {
  it('never shows the user a bare decimal', () => {
    for (const v of [0, 0.2, 0.4, 0.55, 0.7, 0.9, 1]) {
      expect(describeConfidence(v)).toMatch(/[a-z]/);
    }
  });
});

// ---------------------------------------------------------------------------
// Tier 0 — deterministic extractor
// ---------------------------------------------------------------------------

describe('median', () => {
  it('handles odd and even counts', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });

  it('returns 0 for nothing rather than NaN', () => {
    expect(median([])).toBe(0);
  });
});

describe('peakWindow', () => {
  it('finds the busiest contiguous stretch', () => {
    const sessions = [
      at(14, 50),
      at(15, 45),
      at(16, 40),
      at(14, 55, 1),
      at(15, 50, 1),
      at(9, 10, 1),
    ];
    const peak = peakWindow(sessions);
    expect(peak?.startHour).toBe(14);
    expect(peak?.share).toBeGreaterThan(0.5);
  });

  it('wraps midnight for a night owl', () => {
    // A 22:00-01:00 pattern would otherwise be split across the ends of the
    // hour array and missed entirely.
    const sessions = [at(23, 60), at(23, 55, 1), at(0, 50, 1), at(0, 45, 2), at(23, 40, 3)];
    const peak = peakWindow(sessions);
    expect(peak).not.toBeNull();
    expect([22, 23]).toContain(peak?.startHour);
  });

  it('refuses to guess from too few sessions', () => {
    expect(peakWindow([at(14, 50), at(15, 45)])).toBeNull();
  });

  it('ignores misclicks', () => {
    // Two-second sessions would otherwise vote on the peak window.
    const real = [at(14, 50), at(14, 45, 1), at(14, 55, 2), at(14, 40, 3), at(14, 47, 4)];
    const withNoise = [...real, ...[0, 1, 2, 3, 4].map((d) => at(3, 0, d))];
    expect(peakWindow(withNoise)?.startHour).toBe(peakWindow(real)?.startHour);
  });
});

describe('sustainedCeilingMs', () => {
  it('reports roughly the long end of observed sessions', () => {
    const sessions = [10, 20, 30, 40, 50, 60, 120].map((m, i) => at(10, m, i));
    const ceiling = sustainedCeilingMs(sessions);
    expect(ceiling).not.toBeNull();
    expect(ceiling! / 60_000).toBeGreaterThanOrEqual(60);
  });

  it('stays silent below the sample threshold', () => {
    expect(sustainedCeilingMs([at(10, 30)])).toBeNull();
  });
});

describe('currentStreak', () => {
  it('counts consecutive days back from today', () => {
    const sessions = [at(10, 30, 0), at(10, 30, 1), at(10, 30, 2)];
    expect(currentStreak(sessions, new Date(NOW))).toBe(3);
  });

  it('does not break the streak before today has started', () => {
    // Counting from yesterday when today is still empty; otherwise every streak
    // resets to zero at midnight.
    const sessions = [at(10, 30, 1), at(10, 30, 2)];
    expect(currentStreak(sessions, new Date(NOW))).toBe(2);
  });

  it('stops at a gap', () => {
    const sessions = [at(10, 30, 0), at(10, 30, 1), at(10, 30, 5)];
    expect(currentStreak(sessions, new Date(NOW))).toBe(2);
  });

  it('is zero with no sessions', () => {
    expect(currentStreak([], new Date(NOW))).toBe(0);
  });
});

describe('deepWorkRatio', () => {
  it('is 1 when every session is long', () => {
    expect(deepWorkRatio([0, 1, 2, 3, 4].map((d) => at(10, 45, d)))).toBe(1);
  });

  it('is 0 when every session is short but still meaningful', () => {
    expect(deepWorkRatio([0, 1, 2, 3, 4].map((d) => at(10, 10, d)))).toBe(0);
  });
});

describe('buildWorkProfile', () => {
  it('is not ready on thin data', () => {
    const profile = buildWorkProfile([at(14, 50)], new Date(NOW));
    expect(profile.ready).toBe(false);
    expect(profile.typicalSessionMs).toBeNull();
  });

  it('becomes ready at the sample threshold', () => {
    const sessions = Array.from({ length: MIN_SAMPLE }, (_, i) => at(14, 45, i));
    const profile = buildWorkProfile(sessions, new Date(NOW));
    expect(profile.ready).toBe(true);
    expect(profile.typicalSessionMs).toBe(45 * 60_000);
  });

  it('ignores sessions still running', () => {
    const open: WorkSession = { id: 'open', projectId: 'p1', startedAt: NOW, endedAt: null };
    const sessions = [...Array.from({ length: MIN_SAMPLE }, (_, i) => at(14, 45, i)), open];
    expect(buildWorkProfile(sessions, new Date(NOW)).sampleSize).toBe(MIN_SAMPLE);
  });
});

describe('hourLabel', () => {
  it('reads as a human clock', () => {
    expect(hourLabel(0)).toBe('12am');
    expect(hourLabel(9)).toBe('9am');
    expect(hourLabel(12)).toBe('12pm');
    expect(hourLabel(14)).toBe('2pm');
    expect(hourLabel(24)).toBe('12am');
  });
});

// ---------------------------------------------------------------------------
// Law 3 — bounded handoff
// ---------------------------------------------------------------------------

describe('assembleContext', () => {
  const readyProfile = buildWorkProfile(
    Array.from({ length: 10 }, (_, i) => at(14, 45, i)),
    new Date(NOW),
  );

  const styleGraph = (): BrainGraph => {
    let g = upsertNode(emptyGraph, { id: 'style', type: 'style', label: 'writing' });
    g = upsertNode(g, { id: 'concise', type: 'style', label: 'short bullets' });
    for (let i = 0; i < 8; i++) {
      g = observe(g, {
        from: 'style',
        to: 'concise',
        relation: 'prefers',
        provenance: 'inferred',
        at: daysAgo(i),
      });
    }
    return g;
  };

  it('reports cold start when nothing is known', () => {
    const pkg = assembleContext({
      graph: emptyGraph,
      profile: buildWorkProfile([], new Date(NOW)),
      now: NOW,
    });
    expect(pkg.coldStart).toBe(true);
    expect(pkg.text).toBe('');
  });

  it('states the measured profile first, because it is exact', () => {
    const pkg = assembleContext({ graph: emptyGraph, profile: readyProfile, now: NOW });
    expect(pkg.text).toContain('peaks 2pm');
    expect(pkg.text).toContain('45m blocks');
  });

  it('includes a learned belief once it is confirmed', () => {
    const pkg = assembleContext({ graph: styleGraph(), profile: readyProfile, now: NOW });
    expect(pkg.text).toContain('short bullets');
  });

  it('never leaks a quarantined guess', () => {
    // One observation is below the floor, so however relevant it looks it must
    // not reach the Executive Brain.
    let g = upsertNode(emptyGraph, { id: 'style', type: 'style', label: 'writing' });
    g = upsertNode(g, { id: 'wild', type: 'style', label: 'ALL CAPS' });
    g = observe(g, {
      from: 'style',
      to: 'wild',
      relation: 'prefers',
      provenance: 'inferred',
      at: NOW,
    });
    const pkg = assembleContext({ graph: g, profile: readyProfile, now: NOW, focus: ['style'] });
    expect(pkg.text).not.toContain('ALL CAPS');
  });

  it('never exceeds the ceiling, however much it knows', () => {
    // The failure this law exists to prevent: 100 tokens today, 400 in six
    // months, noticed only via a bill or a context-window error.
    let g = emptyGraph;
    for (let i = 0; i < 120; i++) {
      g = upsertNode(g, { id: `n${i}`, type: 'habit', label: `habit number ${i}` });
      g = upsertNode(g, { id: `v${i}`, type: 'habit', label: `value number ${i}` });
      for (let k = 0; k < 8; k++) {
        g = observe(g, {
          from: `n${i}`,
          to: `v${i}`,
          relation: 'relates to',
          provenance: 'inferred',
          at: daysAgo(k),
        });
      }
    }
    const pkg = assembleContext({ graph: g, profile: readyProfile, now: NOW });
    expect(pkg.tokens).toBeLessThanOrEqual(CONTEXT_TOKEN_CEILING);
    expect(pkg.dropped).toBeGreaterThan(0);
  });

  it('honours a tightened ceiling', () => {
    const pkg = assembleContext({
      graph: styleGraph(),
      profile: readyProfile,
      now: NOW,
      ceiling: 20,
    });
    expect(pkg.tokens).toBeLessThanOrEqual(20);
  });

  it('prefers focused nodes when the budget is tight', () => {
    let g = styleGraph();
    g = upsertNode(g, { id: 'unrelated', type: 'app', label: 'Solitaire' });
    g = upsertNode(g, { id: 'evening', type: 'time_window', label: 'evenings' });
    for (let i = 0; i < 8; i++) {
      g = observe(g, {
        from: 'unrelated',
        to: 'evening',
        relation: 'active during',
        provenance: 'inferred',
        at: daysAgo(i),
      });
    }
    const pkg = assembleContext({
      graph: g,
      profile: buildWorkProfile([], new Date(NOW)),
      now: NOW,
      focus: ['style'],
      ceiling: 16,
    });
    expect(pkg.text).toContain('short bullets');
    expect(pkg.text).not.toContain('Solitaire');
  });

  it('counts what it dropped rather than hiding it', () => {
    const pkg = assembleContext({
      graph: styleGraph(),
      profile: readyProfile,
      now: NOW,
      ceiling: 12,
    });
    expect(pkg.dropped).toBeGreaterThan(0);
  });
});

describe('estimateTokens', () => {
  it('is zero for empty', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('grows with length', () => {
    expect(estimateTokens('a'.repeat(400))).toBeGreaterThan(estimateTokens('a'.repeat(40)));
  });
});
