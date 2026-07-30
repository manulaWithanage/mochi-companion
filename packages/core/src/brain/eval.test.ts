import { describe, expect, it } from 'vitest';
import {
  ACCEPT_THRESHOLD,
  assignArm,
  brierScore,
  evaluatePredictive,
  levenshtein,
  MIN_TRIALS_PER_ARM,
  prefixSurvival,
  replayEdge,
  scoreTrial,
  summariseArms,
  TRIAL_ARMS,
  type Trial,
} from './eval.js';
import { DAY_MS } from './confidence.js';
import type { BrainEdge } from './graph.js';

const NOW = new Date('2026-07-30T12:00:00').getTime();
const daysAgo = (n: number): number => NOW - n * DAY_MS;

const edge = (confirms: readonly number[], contradicts: readonly number[] = []): BrainEdge => ({
  from: 'a',
  to: 'b',
  relation: 'r',
  provenance: 'inferred',
  confirms,
  contradicts,
});

describe('assignArm', () => {
  it('is deterministic for a given message', () => {
    // Derived rather than drawn, so an assignment cannot be quietly re-rolled,
    // which is the easiest way to bias an n=1 study.
    expect(assignArm('msg-1')).toBe(assignArm('msg-1'));
  });

  it('only ever returns a declared arm', () => {
    for (let i = 0; i < 200; i++) {
      expect(TRIAL_ARMS).toContain(assignArm(`msg-${i}`));
    }
  });

  it('spreads roughly evenly across arms', () => {
    const counts = new Map(TRIAL_ARMS.map((a) => [a, 0]));
    for (let i = 0; i < 2000; i++) {
      const arm = assignArm(`msg-${i}`);
      counts.set(arm, (counts.get(arm) ?? 0) + 1);
    }
    for (const arm of TRIAL_ARMS) {
      // 500 expected. A wide band: this checks for gross skew, not uniformity.
      expect(counts.get(arm)!).toBeGreaterThan(350);
      expect(counts.get(arm)!).toBeLessThan(650);
    }
  });

  it('re-randomises cleanly under a different salt', () => {
    let differences = 0;
    for (let i = 0; i < 200; i++) {
      if (assignArm(`m${i}`, 'study-1') !== assignArm(`m${i}`, 'study-2')) differences += 1;
    }
    expect(differences).toBeGreaterThan(80);
  });
});

describe('levenshtein', () => {
  it('is zero for identical strings', () => {
    expect(levenshtein('hello', 'hello')).toBe(0);
  });

  it('counts single edits', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
  });

  it('handles an empty side', () => {
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', '')).toBe(3);
  });

  it('does not stall on very long input', () => {
    // Capped, because an accidental novel-length comparison must not block main.
    const long = 'a'.repeat(50_000);
    expect(() => levenshtein(long, `${long}b`)).not.toThrow();
  });
});

describe('scoreTrial', () => {
  it('reports zero distance for a draft sent verbatim', () => {
    const outcome = scoreTrial('Hey Alex, shipping today', 'Hey Alex, shipping today');
    expect(outcome.editDistance).toBe(0);
    expect(outcome.acceptedUnedited).toBe(true);
  });

  it('ignores reflowing and case', () => {
    // Rewrapping a paragraph is not an edit of substance.
    const outcome = scoreTrial('Hey Alex,\n\nShipping   today', 'hey alex, shipping today');
    expect(outcome.editDistance).toBe(0);
  });

  it('reports a high distance for a full rewrite', () => {
    const outcome = scoreTrial(
      'Dear Sir or Madam, I am writing to inform you of the progress',
      'yo, done with the thing',
    );
    expect(outcome.editDistance).toBeGreaterThan(0.5);
    expect(outcome.acceptedUnedited).toBe(false);
  });

  it('treats a punctuation-only change as accepted', () => {
    const draft = 'Hey Alex, the coding work is finished and ready for review today.';
    const sent = 'Hey Alex, the coding work is finished and ready for review today!';
    expect(scoreTrial(draft, sent).editDistance).toBeLessThan(ACCEPT_THRESHOLD);
  });

  it('does not treat a changed word as unedited', () => {
    // The threshold means "sent essentially verbatim". Swapping a word is a real
    // edit and must count as one, or the accept rate flatters every arm equally.
    const draft = 'Hey Alex, the coding work is finished and ready for review today';
    const sent = 'Hey Alex, the coding work is finished and ready for review now';
    expect(scoreTrial(draft, sent).acceptedUnedited).toBe(false);
  });

  it('never returns NaN for two empty strings', () => {
    expect(scoreTrial('', '').editDistance).toBe(0);
  });

  it('returns only numbers, never the text', () => {
    // The privacy property: a trial can be logged without keeping the message.
    const outcome = scoreTrial('secret content here', 'other secret content');
    for (const value of Object.values(outcome)) {
      expect(['number', 'boolean']).toContain(typeof value);
    }
  });
});

describe('prefixSurvival', () => {
  it('is 1 when the opening is kept', () => {
    expect(prefixSurvival('Hey Alex, all good', 'Hey Alex, all good and shipped')).toBe(1);
  });

  it('falls when the salutation is rewritten', () => {
    // Salutation and tone are what a style profile most directly affects.
    const kept = prefixSurvival('Hey Alex, the update is ready', 'Hey Alex, the update is done');
    const changed = prefixSurvival('Dear Alexander, the update is ready', 'yo the update is done');
    expect(changed).toBeLessThan(kept);
  });
});

describe('summariseArms', () => {
  const trials = (arm: Trial['arm'], n: number, distance: number): Trial[] =>
    Array.from({ length: n }, () => ({ arm, editDistance: distance }));

  it('covers every arm even with no data', () => {
    const summary = summariseArms([]);
    expect(summary).toHaveLength(TRIAL_ARMS.length);
    expect(summary.every((s) => s.medianEditDistance === null)).toBe(true);
  });

  it('withholds a verdict until the pre-registered minimum is met', () => {
    // Guards against reading a difference off three trials.
    const summary = summariseArms(trials('mnma', 3, 0.2));
    expect(summary.find((s) => s.arm === 'mnma')?.reportable).toBe(false);
  });

  it('becomes reportable at the minimum', () => {
    const summary = summariseArms(trials('mnma', MIN_TRIALS_PER_ARM, 0.2));
    expect(summary.find((s) => s.arm === 'mnma')?.reportable).toBe(true);
  });

  it('computes a median per arm', () => {
    const summary = summariseArms([...trials('none', 15, 0.6), ...trials('mnma', 15, 0.2)]);
    expect(summary.find((s) => s.arm === 'none')?.medianEditDistance).toBeCloseTo(0.6);
    expect(summary.find((s) => s.arm === 'mnma')?.medianEditDistance).toBeCloseTo(0.2);
  });
});

describe('replayEdge', () => {
  it('skips the first observation, which only measures the prior', () => {
    expect(replayEdge(edge([daysAgo(3)]))).toHaveLength(0);
    expect(replayEdge(edge([daysAgo(3), daysAgo(2)]))).toHaveLength(1);
  });

  it('forecasts using only evidence from before each observation', () => {
    // Held out by construction: this is what makes it a genuine test rather
    // than a fit to the data.
    const points = replayEdge(edge([daysAgo(5), daysAgo(4), daysAgo(3)]));
    expect(points).toHaveLength(2);
    expect(points[1]!.predicted).toBeGreaterThan(points[0]!.predicted);
  });

  it('labels contradictions as 0', () => {
    const points = replayEdge(edge([daysAgo(5)], [daysAgo(4)]));
    expect(points[0]?.actual).toBe(0);
  });

  it('orders mixed evidence chronologically', () => {
    const points = replayEdge(edge([daysAgo(1), daysAgo(5)], [daysAgo(3)]));
    expect(points.map((p) => p.actual)).toEqual([0, 1]);
  });

  it('does not let provenance short-circuit the forecast', () => {
    // declared and computed return confidence 1, which would make the forecast
    // trivially perfect and measure nothing.
    const declared: BrainEdge = { ...edge([daysAgo(3), daysAgo(2)]), provenance: 'declared' };
    expect(replayEdge(declared)[0]!.predicted).toBeLessThan(1);
  });
});

describe('brierScore', () => {
  it('is 0 for a perfect forecast', () => {
    expect(
      brierScore([
        { predicted: 1, actual: 1 },
        { predicted: 0, actual: 0 },
      ]),
    ).toBe(0);
  });

  it('is 1 for a confidently wrong forecast', () => {
    expect(brierScore([{ predicted: 0, actual: 1 }])).toBe(1);
  });

  it('is null with nothing to score', () => {
    expect(brierScore([])).toBeNull();
  });
});

describe('evaluatePredictive', () => {
  it('reports positive skill when edges genuinely differ from each other', () => {
    // Heterogeneous on purpose: some beliefs hold, some are being overturned.
    // That is the case per-edge confidence can win, because a single constant
    // cannot describe both. A set of all-confirming edges would make the base
    // rate perfect and skill undefined.
    const reliable = Array.from({ length: 6 }, (_, i) =>
      edge(Array.from({ length: 8 }, (_, k) => daysAgo(i * 40 + k))),
    );
    const failing = Array.from({ length: 6 }, (_, i) =>
      edge(
        [daysAgo(i * 40 + 20)],
        Array.from({ length: 7 }, (_, k) => daysAgo(i * 40 + 19 - k)),
      ),
    );
    const result = evaluatePredictive([...reliable, ...failing]);
    expect(result.points).toBeGreaterThan(0);
    expect(result.skill).not.toBeNull();
    expect(result.skill!).toBeGreaterThan(0);
  });

  it('reports skill as undefined when every observation agreed', () => {
    // A constant predictor is already perfect, so there is nothing to improve on.
    const allConfirm = Array.from({ length: 5 }, (_, i) =>
      edge([daysAgo(i * 10 + 2), daysAgo(i * 10 + 1), daysAgo(i * 10)]),
    );
    const result = evaluatePredictive(allConfirm);
    expect(result.brier).not.toBeNull();
    expect(result.skill).toBeNull();
  });

  it('shows little skill when outcomes carry no signal', () => {
    // Alternating confirm and contradict is unpredictable, so the model should
    // not beat a constant by much. If it did, the metric would be wrong.
    const noisy = Array.from({ length: 10 }, (_, i) =>
      edge(
        [0, 2, 4, 6].map((d) => daysAgo(i * 20 + d)),
        [1, 3, 5, 7].map((d) => daysAgo(i * 20 + d)),
      ),
    );
    expect(evaluatePredictive(noisy).skill!).toBeLessThan(0.25);
  });

  it('returns nulls rather than NaN on an empty graph', () => {
    const result = evaluatePredictive([]);
    expect(result.points).toBe(0);
    expect(result.brier).toBeNull();
    expect(result.skill).toBeNull();
  });
});
