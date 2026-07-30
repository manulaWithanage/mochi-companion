import { describe, expect, it } from 'vitest';
import {
  assignCategories,
  CATEGORIES,
  CATEGORY_IDS,
  categoryInfo,
  countByCategory,
  INTERRUPTIBLE_CATEGORIES,
  parseCategory,
  unreadInCategory,
  worthInterrupting,
  type EmailCategory,
} from './categories.js';

describe('CATEGORIES', () => {
  it('covers exactly Gmail’s five inbox tabs', () => {
    expect(CATEGORY_IDS).toEqual(['primary', 'updates', 'forums', 'social', 'promotions']);
  });

  it('uses category: search syntax, not CATEGORY_ label names', () => {
    // CATEGORY_PROMOTIONS is a Gmail API labelId. Over IMAP it does not exist,
    // and X-GM-LABELS will never return it — only the search operator works.
    for (const c of CATEGORIES) {
      expect(c.query).toMatch(/^category:/);
      expect(c.query).not.toMatch(/CATEGORY_/);
    }
  });

  it('interrupts for Primary only', () => {
    // The whole point of categorising: a promotion must never raise a bubble.
    expect(INTERRUPTIBLE_CATEGORIES).toEqual(['primary']);
    expect(worthInterrupting('primary')).toBe(true);
    for (const id of ['promotions', 'social', 'forums', 'updates'] as const) {
      expect(worthInterrupting(id)).toBe(false);
    }
  });

  it('resolves info for every member of the union', () => {
    for (const id of CATEGORY_IDS) {
      expect(categoryInfo(id).id).toBe(id);
    }
  });
});

describe('unreadInCategory', () => {
  it('scopes to unread inbox mail in that category', () => {
    expect(unreadInCategory('promotions')).toBe('is:unread in:inbox category:promotions');
  });

  it('uses Gmail’s own unread notion rather than the IMAP flag', () => {
    // Mixing X-GM-RAW with an IMAP UNSEEN key means two engines deciding
    // "unread" separately; this keeps it to the one the user can see.
    for (const id of CATEGORY_IDS) {
      expect(unreadInCategory(id)).toContain('is:unread');
    }
  });
});

describe('assignCategories', () => {
  it('assigns each id to its category', () => {
    const assigned = assignCategories([
      { category: 'primary', ids: [1, 2] },
      { category: 'promotions', ids: [3] },
    ]);
    expect(assigned.get(1)).toBe('primary');
    expect(assigned.get(3)).toBe('promotions');
  });

  it('resolves an id in two categories by precedence, not search order', () => {
    // Independent searches can overlap on unusual accounts. Without a fixed
    // precedence the answer would depend on which one returned last.
    const promotionsFirst = assignCategories([
      { category: 'promotions', ids: [7] },
      { category: 'primary', ids: [7] },
    ]);
    const primaryFirst = assignCategories([
      { category: 'primary', ids: [7] },
      { category: 'promotions', ids: [7] },
    ]);
    expect(promotionsFirst.get(7)).toBe('primary');
    expect(primaryFirst.get(7)).toBe('primary');
  });

  it('omits ids that matched nothing', () => {
    const assigned = assignCategories([{ category: 'primary', ids: [] }]);
    expect(assigned.size).toBe(0);
  });

  it('handles empty input', () => {
    expect(assignCategories([]).size).toBe(0);
  });
});

describe('countByCategory', () => {
  it('counts per category', () => {
    const assigned = new Map<number, EmailCategory>([
      [1, 'primary'],
      [2, 'primary'],
      [3, 'promotions'],
    ]);
    const counts = countByCategory(assigned);
    expect(counts.find((c) => c.category === 'primary')?.count).toBe(2);
    expect(counts.find((c) => c.category === 'promotions')?.count).toBe(1);
  });

  it('includes zeroes in a stable order so filter chips do not reflow', () => {
    const counts = countByCategory(new Map<number, EmailCategory>());
    expect(counts).toHaveLength(CATEGORY_IDS.length);
    expect(counts.map((c) => c.category)).toEqual(CATEGORY_IDS);
    expect(counts.every((c) => c.count === 0)).toBe(true);
  });
});

describe('parseCategory', () => {
  it('accepts every valid id', () => {
    for (const id of CATEGORY_IDS) expect(parseCategory(id)).toBe(id);
  });

  it('rejects anything else, because these cross the IPC boundary', () => {
    for (const junk of ['', 'PRIMARY', 'category:primary', 'inbox', null, 42, {}, []]) {
      expect(parseCategory(junk)).toBeNull();
    }
  });
});
