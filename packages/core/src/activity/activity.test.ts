import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_CATEGORIES,
  activityCategoryInfo,
  appCategoryPrompt,
  appsNeedingCategory,
  classifyProcess,
  KNOWN_SITES,
  matchBrowsingSite,
  MAX_APPS_PER_REQUEST,
  parseAppCategories,
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
    expect(classifyProcess('reaper.exe')).toEqual({ app: 'Reaper', category: 'other' });
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
    expect(longestStretchMs([span('VS Code', 0, 60), span('Chrome', 60, 300, 'browsing')])).toBe(
      240_000,
    );
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

describe('learned categories', () => {
  it('fills a gap the built-in table has', () => {
    expect(classifyProcess('godot-custom.exe').category).toBe('other');
    expect(classifyProcess('godot-custom.exe', { 'Godot custom': 'coding' }).category).toBe(
      'coding',
    );
  });

  it('never overrides a curated rule', () => {
    // A model that decides Photoshop is browsing must not overwrite a fact the
    // table already knows. The learned map fills gaps; it does not argue.
    expect(classifyProcess('photoshop', { Photoshop: 'browsing' }).category).toBe('design');
  });

  it('applies to packaged apps resolved by their leading segment', () => {
    expect(classifyProcess('SomeTool.Root', { Sometool: 'writing' }).category).toBe('writing');
  });
});

describe('newly added rules', () => {
  it('knows the editors that were showing as Other', () => {
    expect(classifyProcess('Antigravity')).toEqual({ app: 'Antigravity', category: 'coding' });
    expect(classifyProcess('Claude')).toEqual({ app: 'Claude', category: 'coding' });
  });

  it('pins system noise to other, so it is never sent to a model', () => {
    for (const p of ['explorer', 'SearchHost', 'LockApp', 'ApplicationFrameHost']) {
      expect(classifyProcess(p).category).toBe('other');
    }
  });
});

describe('appCategoryPrompt', () => {
  it('sends only application names', () => {
    // The privacy property: this request carries less than the tab already
    // shows on screen.
    const prompt = appCategoryPrompt(['Godot', 'Reaper']);
    expect(prompt).toContain('Godot');
    expect(prompt).toContain('Reaper');
    expect(prompt).not.toMatch(/title|document|file|url/i);
  });

  it('lists the categories a model is allowed to use', () => {
    const prompt = appCategoryPrompt(['Godot']);
    for (const c of ACTIVITY_CATEGORIES) expect(prompt).toContain(c.id);
  });
});

describe('parseAppCategories', () => {
  const asked = ['Godot', 'Reaper'];

  it('reads a clean reply', () => {
    expect(parseAppCategories('{"Godot":"coding","Reaper":"design"}', asked)).toEqual({
      Godot: 'coding',
      Reaper: 'design',
    });
  });

  it('survives code fences, which models add regardless', () => {
    expect(parseAppCategories('```json\n{"Godot":"coding"}\n```', asked)).toEqual({
      Godot: 'coding',
    });
  });

  it('survives surrounding prose', () => {
    expect(parseAppCategories('Sure! {"Godot":"coding"} Hope that helps.', asked)).toEqual({
      Godot: 'coding',
    });
  });

  it('drops a category that does not exist', () => {
    // The schema guard: a plausible-sounding invention must not enter the graph.
    expect(parseAppCategories('{"Godot":"gamedev"}', asked)).toEqual({});
  });

  it('drops an app that was never asked about', () => {
    // An invented app would sit in the learned map for ever, matching nothing
    // and never being re-asked.
    expect(parseAppCategories('{"Photoshop":"design"}', asked)).toEqual({});
  });

  it('keeps the good entries when one is bad', () => {
    expect(parseAppCategories('{"Godot":"coding","Reaper":"nonsense"}', asked)).toEqual({
      Godot: 'coding',
    });
  });

  it('returns nothing for junk rather than throwing', () => {
    for (const junk of ['', 'no idea', '[]', '{', 'null', '{"a":']) {
      expect(() => parseAppCategories(junk, asked)).not.toThrow();
      expect(parseAppCategories(junk, asked)).toEqual({});
    }
  });
});

describe('appsNeedingCategory', () => {
  const longSpan = (app: string, minutes: number, category: ActivityCategory = 'other') => ({
    app,
    category,
    startedAt: at(0),
    endedAt: at(minutes * 60),
  });

  it('ignores apps used only briefly', () => {
    // Not worth a model call for a passing glance.
    expect(appsNeedingCategory([longSpan('Blip', 1)], {})).toEqual([]);
  });

  it('picks up an app used for a meaningful stretch', () => {
    expect(appsNeedingCategory([longSpan('Godot', 30)], {})).toEqual(['Godot']);
  });

  it('never asks twice about the same app', () => {
    expect(appsNeedingCategory([longSpan('Godot', 30)], { Godot: 'coding' })).toEqual([]);
  });

  it('ignores apps the table already categorised', () => {
    expect(appsNeedingCategory([longSpan('VS Code', 30, 'coding')], {})).toEqual([]);
  });

  it('asks about the most-used first, so a budget is spent well', () => {
    const spans = [longSpan('Small', 6), longSpan('Big', 120), longSpan('Middle', 40)];
    expect(appsNeedingCategory(spans, {})).toEqual(['Big', 'Middle', 'Small']);
  });

  it('caps how many go in one request', () => {
    const spans = Array.from({ length: 40 }, (_, i) => longSpan(`App${i}`, 30));
    expect(appsNeedingCategory(spans, {}).length).toBeLessThanOrEqual(MAX_APPS_PER_REQUEST);
  });
});

describe('gaming', () => {
  it('recognises the launchers', () => {
    expect(classifyProcess('Steam')).toEqual({ app: 'Steam', category: 'gaming' });
    expect(classifyProcess('EpicGamesLauncher').category).toBe('gaming');
    expect(classifyProcess('Battle.net').category).toBe('gaming');
  });

  it('leaves individual titles to the model', () => {
    // No table will ever hold every game, which is what the learned map is for.
    expect(classifyProcess('witcher3.exe').category).toBe('other');
    expect(classifyProcess('witcher3.exe', { Witcher3: 'gaming' }).category).toBe('gaming');
  });

  it('offers gaming as a category the model may choose', () => {
    expect(appCategoryPrompt(['Witcher3'])).toContain('gaming');
  });

  it('does not count as focused work', () => {
    expect(activityCategoryInfo('gaming').focused).toBe(false);
  });

  it('resolves every category by id, not by position', () => {
    // An index-based fallback silently returns the wrong category the moment a
    // new one is added above it.
    for (const c of ACTIVITY_CATEGORIES) {
      expect(activityCategoryInfo(c.id).id).toBe(c.id);
    }
  });
});

describe('matchBrowsingSite', () => {
  it('recognises a site from a browser title', () => {
    expect(matchBrowsingSite('Some video - YouTube - Google Chrome')).toEqual({
      site: 'YouTube',
      category: 'media',
    });
  });

  it('handles the em dash Firefox uses', () => {
    expect(matchBrowsingSite('A thread — Reddit — Mozilla Firefox')?.site).toBe('Reddit');
  });

  it('returns null for anything unrecognised, which is the point', () => {
    // An unmatched title yields nothing, so the caller has nothing to keep.
    expect(matchBrowsingSite('Q3 forecast.xlsx - Excel')).toBeNull();
    expect(matchBrowsingSite('Acme Corp contract review - Google Chrome')).toBeNull();
    expect(matchBrowsingSite('')).toBeNull();
  });

  it('matches whole segments, not substrings', () => {
    // Substring matching would let arbitrary text decide what gets recorded —
    // a document called "youtube budget" is not YouTube.
    expect(matchBrowsingSite('youtube budget 2026 - Google Docs')?.site).toBe('Google Docs');
    expect(matchBrowsingSite('my youtube plan - Notepad')).toBeNull();
  });

  it('categorises work sites as work', () => {
    expect(matchBrowsingSite('mochi - GitHub - Chrome')).toEqual({
      site: 'GitHub',
      category: 'coding',
    });
  });

  it('publishes the full list it can ever record', () => {
    // The tab shows this outright, so a user can see the whole surface.
    expect(KNOWN_SITES).toContain('YouTube');
    expect(KNOWN_SITES.length).toBeGreaterThan(10);
  });
});
