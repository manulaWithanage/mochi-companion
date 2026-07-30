import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_CATEGORIES,
  classifyProcess,
  focusedMs,
  longestStretchMs,
  samplesToSpans,
  spansWithin,
  switchCount,
  totalsByApp,
  totalsByCategory,
  type ActivityCategory,
  type ActivitySample,
  type ActivitySpan,
} from './activity.js';

const T0 = new Date('2026-08-03T09:00:00').getTime();
const SAMPLE_MS = 10_000;
const at = (seconds: number): number => T0 + seconds * 1000;

const sample = (
  seconds: number,
  app: string,
  category: ActivityCategory = 'coding',
): ActivitySample => ({
  at: at(seconds),
  app,
  category,
});

const span = (
  app: string,
  fromSec: number,
  toSec: number,
  category: ActivityCategory = 'coding',
): ActivitySpan => ({
  app,
  category,
  startedAt: at(fromSec),
  endedAt: at(toSec),
});

describe('classifyProcess', () => {
  it('resolves known apps to a friendly name and category', () => {
    expect(classifyProcess('Code.exe')).toEqual({ app: 'VS Code', category: 'coding' });
    expect(classifyProcess('figma')).toEqual({ app: 'Figma', category: 'design' });
    expect(classifyProcess('ZOOM.EXE')).toEqual({ app: 'Zoom', category: 'meeting' });
  });

  it('matches the whole name, not a substring', () => {
    // A substring rule for `code` would claim every helper process, and `arc`
    // would match half the executables on a machine.
    expect(classifyProcess('vscode-helper').category).toBe('other');
    expect(classifyProcess('arcane-launcher').category).toBe('other');
  });

  it('still names unknown apps rather than hiding them', () => {
    // Not an allowlist: an allowlist makes the tracker useless to anyone whose
    // tools are not on someone else's list. A process name is an application,
    // not a document.
    expect(classifyProcess('godot.exe')).toEqual({ app: 'Godot', category: 'other' });
  });

  it('handles the suffix Windows adds to packaged apps', () => {
    // Observed on a real machine: WhatsApp reports as `WhatsApp.Root`. Exact
    // matching alone missed it, and substring matching would misclassify far
    // more than it fixed.
    expect(classifyProcess('WhatsApp.Root')).toEqual({
      app: 'WhatsApp',
      category: 'communication',
    });
  });

  it('still names an unknown packaged app by its leading segment', () => {
    expect(classifyProcess('SomeTool.Root').app).toBe('Sometool');
  });

  it('tidies an awkward executable name', () => {
    expect(classifyProcess('my_weird-tool.exe').app).toBe('My weird tool');
  });

  it('degrades safely on empty input', () => {
    expect(classifyProcess('')).toEqual({ app: 'Unknown', category: 'other' });
    expect(classifyProcess('   ')).toEqual({ app: 'Unknown', category: 'other' });
  });
});

describe('samplesToSpans', () => {
  it('collapses consecutive samples of one app', () => {
    const spans = samplesToSpans(
      [sample(0, 'VS Code'), sample(10, 'VS Code'), sample(20, 'VS Code')],
      SAMPLE_MS,
    );
    expect(spans).toHaveLength(1);
    // The last sample still represents real time, so the span runs one
    // interval past it.
    expect(spans[0]!.endedAt).toBe(at(30));
  });

  it('splits when the app changes', () => {
    const spans = samplesToSpans(
      [sample(0, 'VS Code'), sample(10, 'Chrome', 'browsing'), sample(20, 'VS Code')],
      SAMPLE_MS,
    );
    expect(spans.map((s) => s.app)).toEqual(['VS Code', 'Chrome', 'VS Code']);
  });

  it('does not bridge a long gap', () => {
    // A machine that was asleep must not turn into eight hours of VS Code.
    const spans = samplesToSpans([sample(0, 'VS Code'), sample(3600, 'VS Code')], SAMPLE_MS);
    expect(spans).toHaveLength(2);
  });

  it('tolerates one missed sample', () => {
    // A single dropped poll is normal and should not fragment the span.
    const spans = samplesToSpans([sample(0, 'VS Code'), sample(20, 'VS Code')], SAMPLE_MS);
    expect(spans).toHaveLength(1);
  });

  it('sorts unordered input', () => {
    const spans = samplesToSpans([sample(20, 'VS Code'), sample(0, 'VS Code')], SAMPLE_MS);
    expect(spans).toHaveLength(1);
    expect(spans[0]!.startedAt).toBe(at(0));
  });

  it('returns nothing for no samples', () => {
    expect(samplesToSpans([], SAMPLE_MS)).toEqual([]);
  });
});

describe('totalsByApp', () => {
  it('sums and sorts by time', () => {
    const totals = totalsByApp([
      span('VS Code', 0, 60),
      span('Chrome', 60, 90, 'browsing'),
      span('VS Code', 90, 120),
    ]);
    expect(totals[0]!.app).toBe('VS Code');
    expect(totals[0]!.ms).toBe(90_000);
    expect(totals[1]!.app).toBe('Chrome');
  });

  it('computes shares that add to one', () => {
    const totals = totalsByApp([span('A', 0, 60), span('B', 60, 120, 'browsing')]);
    expect(totals.reduce((sum, t) => sum + t.share, 0)).toBeCloseTo(1);
  });

  it('does not divide by zero on empty input', () => {
    expect(totalsByApp([])).toEqual([]);
  });
});

describe('totalsByCategory', () => {
  it('always returns every category in a fixed order', () => {
    // A legend that reflows as the day goes on is worse than one showing zeroes.
    const totals = totalsByCategory([]);
    expect(totals).toHaveLength(ACTIVITY_CATEGORIES.length);
    expect(totals.map((t) => t.category)).toEqual(ACTIVITY_CATEGORIES.map((c) => c.id));
    expect(totals.every((t) => t.ms === 0)).toBe(true);
  });

  it('accumulates across apps in the same category', () => {
    const totals = totalsByCategory([
      span('VS Code', 0, 60),
      span('Cursor', 60, 120),
      span('Chrome', 120, 150, 'browsing'),
    ]);
    expect(totals.find((t) => t.category === 'coding')?.ms).toBe(120_000);
    expect(totals.find((t) => t.category === 'browsing')?.ms).toBe(30_000);
  });
});

describe('focusedMs', () => {
  it('counts only categories marked as focused work', () => {
    const total = focusedMs([
      span('VS Code', 0, 60),
      span('Slack', 60, 120, 'communication'),
      span('Chrome', 120, 180, 'browsing'),
    ]);
    expect(total).toBe(60_000);
  });
});

describe('switchCount', () => {
  it('counts changes of application', () => {
    const spans = [
      span('VS Code', 0, 120),
      span('Chrome', 120, 240, 'browsing'),
      span('VS Code', 240, 360),
    ];
    expect(switchCount(spans)).toBe(2);
  });

  it('ignores a momentary glance at another window', () => {
    // Alt-tabbing for four seconds is not a context switch in any sense the
    // user cares about, and counting it makes the number meaningless.
    const spans = [
      span('VS Code', 0, 120),
      span('Chrome', 120, 124, 'browsing'),
      span('VS Code', 124, 300),
    ];
    expect(switchCount(spans)).toBe(0);
  });

  it('is zero for a single span', () => {
    expect(switchCount([span('VS Code', 0, 600)])).toBe(0);
  });
});

describe('longestStretchMs', () => {
  it('finds the longest unbroken span', () => {
    expect(
      longestStretchMs([span('VS Code', 0, 60), span('Chrome', 60, 300, 'browsing')]),
    ).toBe(240_000);
  });

  it('is zero with nothing tracked', () => {
    expect(longestStretchMs([])).toBe(0);
  });
});

describe('spansWithin', () => {
  it('clips a span straddling the window edge', () => {
    const clipped = spansWithin([span('VS Code', 0, 600)], at(120), at(300));
    expect(clipped[0]!.startedAt).toBe(at(120));
    expect(clipped[0]!.endedAt).toBe(at(300));
  });

  it('drops spans fully outside', () => {
    expect(spansWithin([span('VS Code', 0, 60)], at(120), at(300))).toHaveLength(0);
  });
});
