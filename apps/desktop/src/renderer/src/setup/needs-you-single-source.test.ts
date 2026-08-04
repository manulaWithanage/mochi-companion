import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A guard, not a unit test.
 *
 * The nav badge said 5 while the Overview page said 3, because each counted the
 * same thing separately: the badge fetched 100 cached emails and ran
 * `buildReplyQueue`, while the "Needs a reply" card fetched 25, applied its own
 * filter, truncated the list to three, and then printed the truncated array's
 * length as "N WAITING". Three ways to disagree, in one screen.
 *
 * Both now render from a single `NeedsYou` object. That is structural, so this
 * only has to stop a second fetch reappearing — which is how the divergence
 * started, and it looked perfectly reasonable at the time.
 *
 * Reading the source is deliberate: the invariant is "there is one query", and
 * that is not observable from the rendered output of a passing component.
 */

const read = (file: string): string => readFileSync(join(import.meta.dirname, file), 'utf8');

/** Strip comments, so prose about the old bug does not trip this. */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('one count, one source', () => {
  it('only useNeedsYou queries the cached inbox', () => {
    const hook = stripComments(read('useNeedsYou.ts'));
    expect(hook).toContain('listCached');
  });

  it('the Overview tab does not fetch its own copy of the inbox', () => {
    // A second fetch is a second answer. Even with identical filtering, a
    // different `limit` or a different moment is enough to disagree.
    const tab = stripComments(read('tabs/TodayTab.tsx'));

    expect(
      tab.includes('listCached'),
      'TodayTab must render from the NeedsYou passed in, not query again',
    ).toBe(false);
  });

  it('the reply count comes from buildReplyQueue, not a local filter', () => {
    // needsReplyReminder alone omits the replied/dismissed check, so a card using
    // it directly counts threads the user has already dealt with.
    const tab = stripComments(read('tabs/TodayTab.tsx'));

    expect(tab).not.toContain('needsReplyReminder');
  });

  it('the badge reads the same total the page renders', () => {
    const dashboard = stripComments(read('Dashboard.tsx'));

    expect(dashboard).toContain('needsYou.total');
    expect(dashboard).toContain('needsYou={needsYou}');
  });
});
