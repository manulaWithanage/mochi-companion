/**
 * Gmail's inbox categories — the Primary/Social/Promotions/Updates/Forums tabs.
 *
 * **Why this is worth having.** "You have 14 unread emails" is useless when 11
 * of them are newsletters. Categories are what turn the Gmail tab from a list
 * into triage, and they are what stop the governor interrupting someone about
 * a promotion.
 *
 * **How we get them, which is not the obvious way.** Gmail exposes categories
 * three ways and only one is available to us:
 *
 * 1. `labelIds: ['CATEGORY_PROMOTIONS']` on the Gmail API — real, but the API
 *    needs an OAuth restricted scope, which means CASA assessment and a Cloud
 *    project. That is the whole thing the App Password path exists to avoid.
 * 2. `category:promotions` in Gmail search syntax — available over IMAP via the
 *    `X-GM-RAW` extension, which Google documents as accepting "the full Gmail
 *    search syntax", interpreted as in the web interface. **This is the one we
 *    use.**
 * 3. `X-GM-LABELS` on a FETCH — commonly claimed to carry categories. It does
 *    not. Google documents its system labels as `\Inbox`, `\Sent`, `\Drafts`,
 *    `\Starred`, `\Important`, `\Spam` and `\Trash`; `CATEGORY_*` is a Gmail
 *    API concept with no IMAP equivalent. Building on it would appear to work
 *    on an account with matching user labels and silently return nothing on
 *    everyone else's.
 *
 * Pure logic: the queries live here, the IMAP calls live in apps/desktop
 * (RULE 2).
 */

export type EmailCategory = 'primary' | 'social' | 'promotions' | 'updates' | 'forums';

export interface CategoryInfo {
  readonly id: EmailCategory;
  readonly label: string;
  /**
   * The Gmail search fragment, passed through `X-GM-RAW`.
   *
   * `category:primary` rather than `category:personal`: they are aliases, but
   * primary is the name shown in the Gmail UI, so it is the one a user can
   * check our behaviour against.
   */
  readonly query: string;
  /**
   * Whether an unread message here justifies interrupting the user.
   *
   * The default answer is no. A companion that pops up about a sale is the
   * single fastest way to get itself muted, and the cost of being wrong in
   * this direction is only a slightly later notice.
   */
  readonly worthInterrupting: boolean;
}

/**
 * Ordered by how much attention each deserves, which is also the precedence
 * used when a message somehow matches more than one.
 */
export const CATEGORIES: readonly CategoryInfo[] = [
  { id: 'primary', label: 'Primary', query: 'category:primary', worthInterrupting: true },
  { id: 'updates', label: 'Updates', query: 'category:updates', worthInterrupting: false },
  { id: 'forums', label: 'Forums', query: 'category:forums', worthInterrupting: false },
  { id: 'social', label: 'Social', query: 'category:social', worthInterrupting: false },
  { id: 'promotions', label: 'Promotions', query: 'category:promotions', worthInterrupting: false },
];

export const CATEGORY_IDS: readonly EmailCategory[] = CATEGORIES.map((c) => c.id);

export function categoryInfo(id: EmailCategory): CategoryInfo {
  // CATEGORIES covers every member of the union, so this cannot miss.
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[0]!;
}

/** The categories Mochi may raise a bubble about. */
export const INTERRUPTIBLE_CATEGORIES: readonly EmailCategory[] = CATEGORIES.filter(
  (c) => c.worthInterrupting,
).map((c) => c.id);

export function worthInterrupting(id: EmailCategory): boolean {
  return categoryInfo(id).worthInterrupting;
}

/**
 * The `X-GM-RAW` query for unread mail in one category.
 *
 * `is:unread` is folded in here rather than left to an IMAP `UNSEEN` flag
 * alongside it: mixing an X-GM-RAW term with a standard IMAP search key is
 * legal but the two are evaluated by different engines, and Gmail's own
 * definition of unread is the one that matches what the user sees.
 */
export function unreadInCategory(id: EmailCategory): string {
  return `is:unread in:inbox ${categoryInfo(id).query}`;
}

/**
 * Assign one category per message id from per-category search results.
 *
 * Gmail puts a message in exactly one tab, but the searches are independent
 * and an unusual account can return the same id twice. Resolving by declared
 * precedence keeps the result deterministic instead of depending on which
 * search happened to finish last.
 *
 * Ids absent from every list are simply absent from the map — the caller
 * decides whether that means "uncategorised" or "not in the inbox".
 */
export function assignCategories<T>(
  results: readonly { readonly category: EmailCategory; readonly ids: readonly T[] }[],
): Map<T, EmailCategory> {
  const assigned = new Map<T, EmailCategory>();

  // Walk in precedence order so the first assignment is the winning one.
  for (const { id } of CATEGORIES) {
    for (const result of results) {
      if (result.category !== id) continue;
      for (const messageId of result.ids) {
        if (!assigned.has(messageId)) assigned.set(messageId, id);
      }
    }
  }

  return assigned;
}

/**
 * Select newest unread INBOX UIDs while treating categories as annotation.
 *
 * Gmail can emit IMAP EXISTS before its X-GM-RAW category index includes the
 * message. An unassigned UID therefore defaults to Primary instead of being
 * dropped from the snapshot.
 */
export function selectNewestInboxUids(
  unreadUids: readonly number[],
  assigned: ReadonlyMap<number, EmailCategory>,
  only: readonly EmailCategory[],
  limit: number,
): readonly number[] {
  const wanted = new Set(only);
  return [...new Set(unreadUids)]
    .filter((uid) => wanted.has(assigned.get(uid) ?? 'primary'))
    .sort((a, b) => b - a)
    .slice(0, Math.min(100, Math.max(1, limit)));
}

export interface CategoryCount {
  readonly category: EmailCategory;
  readonly label: string;
  readonly count: number;
}

/**
 * Counts per category, always in the same order and always including zeroes.
 *
 * Zeroes are included so the filter chips do not reflow as mail arrives — a
 * row of controls that changes width while being clicked is worse than a chip
 * reading "Social 0".
 */
export function countByCategory<T>(
  assigned: ReadonlyMap<T, EmailCategory>,
): readonly CategoryCount[] {
  const counts = new Map<EmailCategory, number>(CATEGORY_IDS.map((id) => [id, 0]));
  for (const category of assigned.values()) {
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return CATEGORIES.map((c) => ({
    category: c.id,
    label: c.label,
    count: counts.get(c.id) ?? 0,
  }));
}

/** Narrow an untrusted string — category ids cross the IPC boundary. */
export function parseCategory(value: unknown): EmailCategory | null {
  return typeof value === 'string' && (CATEGORY_IDS as readonly string[]).includes(value)
    ? (value as EmailCategory)
    : null;
}
