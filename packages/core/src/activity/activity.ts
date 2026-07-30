/**
 * What you were actually doing, at application granularity.
 *
 * **Process names only. Window titles are never read.**
 *
 * The earlier design in MOCHI_BRAIN.md proposed hashing unrecognised window
 * titles. That is false comfort — titles are low-entropy and a hash of one is
 * reversible by dictionary attack in seconds. Not reading them at all is the
 * only version of this that is actually private: no client names from a Slack
 * channel, no document names, no URLs, no patient portal in a browser tab.
 *
 * The cost is real and worth naming: `chrome.exe` cannot distinguish research
 * from YouTube. Everything here is app-level, and it stays that way.
 *
 * Pure logic. The sampling lives in apps/desktop (RULE 2).
 */

export type ActivityCategory =
  | 'coding'
  | 'design'
  | 'writing'
  | 'communication'
  | 'meeting'
  | 'browsing'
  | 'terminal'
  | 'other';

export interface ActivityCategoryInfo {
  readonly id: ActivityCategory;
  readonly label: string;
  /** Counts toward focused work in the summaries. */
  readonly focused: boolean;
}

export const ACTIVITY_CATEGORIES: readonly ActivityCategoryInfo[] = [
  { id: 'coding', label: 'Coding', focused: true },
  { id: 'design', label: 'Design', focused: true },
  { id: 'writing', label: 'Writing', focused: true },
  { id: 'terminal', label: 'Terminal', focused: true },
  { id: 'meeting', label: 'Meetings', focused: false },
  { id: 'communication', label: 'Chat & mail', focused: false },
  { id: 'browsing', label: 'Browsing', focused: false },
  { id: 'other', label: 'Other', focused: false },
];

export function activityCategoryInfo(id: ActivityCategory): ActivityCategoryInfo {
  return ACTIVITY_CATEGORIES.find((c) => c.id === id) ?? ACTIVITY_CATEGORIES[7]!;
}

interface AppRule {
  /** Lowercase executable name, without the extension. */
  readonly process: string;
  readonly app: string;
  readonly category: ActivityCategory;
}

/**
 * Known applications, for a friendly name and a category.
 *
 * Deliberately *not* an allowlist. Unknown apps are still tracked under their
 * process name and categorised 'other' — an allowlist would make the tracker
 * useless to anyone whose tools are not on someone else's list, and a process
 * name is an application, not a document. What protects privacy here is never
 * reading titles, not refusing to name the app.
 */
const APP_RULES: readonly AppRule[] = [
  // Editors and IDEs
  { process: 'code', app: 'VS Code', category: 'coding' },
  { process: 'code - insiders', app: 'VS Code', category: 'coding' },
  { process: 'cursor', app: 'Cursor', category: 'coding' },
  { process: 'antigravity', app: 'Antigravity', category: 'coding' },
  { process: 'claude', app: 'Claude', category: 'coding' },
  { process: 'windsurf', app: 'Windsurf', category: 'coding' },
  { process: 'zed', app: 'Zed', category: 'coding' },
  { process: 'devenv', app: 'Visual Studio', category: 'coding' },
  { process: 'idea64', app: 'IntelliJ', category: 'coding' },
  { process: 'pycharm64', app: 'PyCharm', category: 'coding' },
  { process: 'webstorm64', app: 'WebStorm', category: 'coding' },
  { process: 'goland64', app: 'GoLand', category: 'coding' },
  { process: 'clion64', app: 'CLion', category: 'coding' },
  { process: 'datagrip64', app: 'DataGrip', category: 'coding' },
  { process: 'rider64', app: 'Rider', category: 'coding' },
  { process: 'sublime_text', app: 'Sublime Text', category: 'coding' },
  { process: 'atom', app: 'Atom', category: 'coding' },
  { process: 'neovide', app: 'Neovim', category: 'coding' },
  { process: 'androidstudio', app: 'Android Studio', category: 'coding' },
  { process: 'studio64', app: 'Android Studio', category: 'coding' },
  { process: 'xcode', app: 'Xcode', category: 'coding' },
  { process: 'unity', app: 'Unity', category: 'coding' },
  { process: 'godot', app: 'Godot', category: 'coding' },
  { process: 'postman', app: 'Postman', category: 'coding' },
  { process: 'insomnia', app: 'Insomnia', category: 'coding' },
  { process: 'docker desktop', app: 'Docker Desktop', category: 'coding' },
  { process: 'github desktop', app: 'GitHub Desktop', category: 'coding' },
  { process: 'sourcetree', app: 'Sourcetree', category: 'coding' },
  { process: 'tableplus', app: 'TablePlus', category: 'coding' },

  // Design
  { process: 'figma', app: 'Figma', category: 'design' },
  { process: 'photoshop', app: 'Photoshop', category: 'design' },
  { process: 'illustrator', app: 'Illustrator', category: 'design' },
  { process: 'afterfx', app: 'After Effects', category: 'design' },
  { process: 'adobe premiere pro', app: 'Premiere Pro', category: 'design' },
  { process: 'indesign', app: 'InDesign', category: 'design' },
  { process: 'blender', app: 'Blender', category: 'design' },
  { process: 'affinity photo', app: 'Affinity Photo', category: 'design' },
  { process: 'affinity designer', app: 'Affinity Designer', category: 'design' },
  { process: 'inkscape', app: 'Inkscape', category: 'design' },
  { process: 'gimp', app: 'GIMP', category: 'design' },
  { process: 'krita', app: 'Krita', category: 'design' },
  { process: 'canva', app: 'Canva', category: 'design' },

  // Writing and documents
  { process: 'winword', app: 'Word', category: 'writing' },
  { process: 'notion', app: 'Notion', category: 'writing' },
  { process: 'obsidian', app: 'Obsidian', category: 'writing' },
  { process: 'notepad', app: 'Notepad', category: 'writing' },
  { process: 'notepad++', app: 'Notepad++', category: 'writing' },
  { process: 'excel', app: 'Excel', category: 'writing' },
  { process: 'powerpnt', app: 'PowerPoint', category: 'writing' },
  { process: 'onenote', app: 'OneNote', category: 'writing' },
  { process: 'acrobat', app: 'Acrobat', category: 'writing' },
  { process: 'acrord32', app: 'Acrobat Reader', category: 'writing' },
  { process: 'typora', app: 'Typora', category: 'writing' },
  { process: 'logseq', app: 'Logseq', category: 'writing' },
  { process: 'evernote', app: 'Evernote', category: 'writing' },
  { process: 'sumatrapdf', app: 'SumatraPDF', category: 'writing' },

  // Terminals
  { process: 'windowsterminal', app: 'Terminal', category: 'terminal' },
  { process: 'wt', app: 'Terminal', category: 'terminal' },
  { process: 'powershell', app: 'PowerShell', category: 'terminal' },
  { process: 'pwsh', app: 'PowerShell', category: 'terminal' },
  { process: 'cmd', app: 'Command Prompt', category: 'terminal' },
  { process: 'conhost', app: 'Console', category: 'terminal' },
  { process: 'alacritty', app: 'Alacritty', category: 'terminal' },
  { process: 'wezterm-gui', app: 'WezTerm', category: 'terminal' },
  { process: 'ubuntu', app: 'WSL', category: 'terminal' },
  { process: 'putty', app: 'PuTTY', category: 'terminal' },

  // Meetings
  { process: 'zoom', app: 'Zoom', category: 'meeting' },
  { process: 'teams', app: 'Teams', category: 'meeting' },
  { process: 'ms-teams', app: 'Teams', category: 'meeting' },
  { process: 'webex', app: 'Webex', category: 'meeting' },
  { process: 'gotomeeting', app: 'GoToMeeting', category: 'meeting' },
  { process: 'bluejeans', app: 'BlueJeans', category: 'meeting' },

  // Chat and mail
  { process: 'slack', app: 'Slack', category: 'communication' },
  { process: 'discord', app: 'Discord', category: 'communication' },
  { process: 'outlook', app: 'Outlook', category: 'communication' },
  { process: 'thunderbird', app: 'Thunderbird', category: 'communication' },
  { process: 'whatsapp', app: 'WhatsApp', category: 'communication' },
  { process: 'telegram', app: 'Telegram', category: 'communication' },
  { process: 'signal', app: 'Signal', category: 'communication' },
  { process: 'skype', app: 'Skype', category: 'communication' },
  { process: 'mailbird', app: 'Mailbird', category: 'communication' },

  // Browsers
  { process: 'chrome', app: 'Chrome', category: 'browsing' },
  { process: 'msedge', app: 'Edge', category: 'browsing' },
  { process: 'firefox', app: 'Firefox', category: 'browsing' },
  { process: 'brave', app: 'Brave', category: 'browsing' },
  { process: 'arc', app: 'Arc', category: 'browsing' },
  { process: 'opera', app: 'Opera', category: 'browsing' },
  { process: 'vivaldi', app: 'Vivaldi', category: 'browsing' },
  { process: 'chromium', app: 'Chromium', category: 'browsing' },

  // Explicitly 'other', so the LLM is never asked about them
  { process: 'explorer', app: 'File Explorer', category: 'other' },
  { process: 'spotify', app: 'Spotify', category: 'other' },
  { process: 'vlc', app: 'VLC', category: 'other' },
  { process: 'steam', app: 'Steam', category: 'other' },
  { process: 'systemsettings', app: 'Settings', category: 'other' },
  { process: 'lockapp', app: 'Lock screen', category: 'other' },
  { process: 'searchhost', app: 'Search', category: 'other' },
  { process: 'shellexperiencehost', app: 'Windows Shell', category: 'other' },
  { process: 'applicationframehost', app: 'Windows App', category: 'other' },
];

export interface ResolvedApp {
  readonly app: string;
  readonly category: ActivityCategory;
}

/** Tidy an unknown executable name into something readable. */
function prettify(process: string): string {
  const cleaned = process.replace(/[-_]+/g, ' ').trim();
  if (cleaned.length === 0) return 'Unknown';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/**
 * Resolve a raw executable name to an app and category.
 *
 * Matching is on the whole name, not a substring: `code` must not claim
 * `vscode-helper`, and a substring rule for `arc` would match half the
 * executables on a machine.
 */
/**
 * Categories learned for apps the built-in table does not know, keyed by the
 * resolved display name.
 *
 * Filled by a model, and correctable by the user.
 */
export type LearnedCategories = Readonly<Record<string, ActivityCategory>>;

export function classifyProcess(raw: string, learned: LearnedCategories = {}): ResolvedApp {
  const name = raw
    .trim()
    .toLowerCase()
    .replace(/\.exe$/i, '');
  if (name.length === 0) return { app: 'Unknown', category: 'other' };

  const rule = APP_RULES.find((r) => r.process === name);
  if (rule !== undefined) return { app: rule.app, category: rule.category };

  // Windows reports some packaged apps with a suffix — WhatsApp appears as
  // `WhatsApp.Root`. Falling back to the leading segment catches those without
  // resorting to substring matching, which would misclassify far more than it
  // fixed.
  const head = name.split('.')[0] ?? '';
  if (head.length > 0 && head !== name) {
    const byHead = APP_RULES.find((r) => r.process === head);
    if (byHead !== undefined) return { app: byHead.app, category: byHead.category };
    return withLearned(prettify(head), learned);
  }

  return withLearned(prettify(name), learned);
}

/**
 * Apply a learned category, but only where the built-in table had nothing.
 *
 * A curated rule always wins. A model that decides Photoshop is "browsing"
 * should not be able to overwrite a fact the table already knows, and the
 * asymmetry costs nothing: the learned map exists to fill gaps, not to argue.
 */
function withLearned(app: string, learned: LearnedCategories): ResolvedApp {
  const category = learned[app];
  return { app, category: category ?? 'other' };
}

export interface ActivitySample {
  readonly at: number;
  /** Raw executable name. Resolved on the way in, never stored raw. */
  readonly app: string;
  readonly category: ActivityCategory;
}

export interface ActivitySpan {
  readonly app: string;
  readonly category: ActivityCategory;
  readonly startedAt: number;
  readonly endedAt: number;
}

export const spanMs = (span: ActivitySpan): number => span.endedAt - span.startedAt;

/**
 * Stable id for a span.
 *
 * Start time plus app: one application cannot begin two spans in the same
 * millisecond, and deriving it means re-flushing an unchanged buffer after a
 * crash overwrites rather than double-counting.
 */
export const activitySpanId = (span: ActivitySpan): string => `${span.startedAt}:${span.app}`;

/**
 * Collapse a sample series into spans.
 *
 * `sampleMs` is how often samples are taken, and a span is extended by that
 * much per sample — the last sample of a span still represents real time. A
 * gap larger than `maxGapMs` ends the span rather than bridging it, so a
 * machine that was asleep does not turn into eight hours of VS Code.
 */
export function samplesToSpans(
  samples: readonly ActivitySample[],
  sampleMs: number,
  maxGapMs = sampleMs * 3,
): readonly ActivitySpan[] {
  const ordered = [...samples].sort((a, b) => a.at - b.at);
  const spans: ActivitySpan[] = [];
  let current: { app: string; category: ActivityCategory; startedAt: number; last: number } | null =
    null;

  for (const sample of ordered) {
    if (
      current !== null &&
      current.app === sample.app &&
      sample.at - current.last <= maxGapMs
    ) {
      current.last = sample.at;
      continue;
    }
    if (current !== null) {
      spans.push({
        app: current.app,
        category: current.category,
        startedAt: current.startedAt,
        endedAt: current.last + sampleMs,
      });
    }
    current = {
      app: sample.app,
      category: sample.category,
      startedAt: sample.at,
      last: sample.at,
    };
  }

  if (current !== null) {
    spans.push({
      app: current.app,
      category: current.category,
      startedAt: current.startedAt,
      endedAt: current.last + sampleMs,
    });
  }

  return spans;
}

export interface AppTotal {
  readonly app: string;
  readonly category: ActivityCategory;
  readonly ms: number;
  readonly share: number;
}

export function totalsByApp(spans: readonly ActivitySpan[]): readonly AppTotal[] {
  const totals = new Map<string, { category: ActivityCategory; ms: number }>();
  for (const span of spans) {
    const existing = totals.get(span.app);
    if (existing === undefined) totals.set(span.app, { category: span.category, ms: spanMs(span) });
    else existing.ms += spanMs(span);
  }
  const grand = [...totals.values()].reduce((sum, t) => sum + t.ms, 0);

  return [...totals.entries()]
    .map(([app, t]) => ({
      app,
      category: t.category,
      ms: t.ms,
      share: grand === 0 ? 0 : t.ms / grand,
    }))
    .sort((a, b) => b.ms - a.ms);
}

export interface CategoryTotal {
  readonly category: ActivityCategory;
  readonly label: string;
  readonly ms: number;
  readonly share: number;
}

/** Always every category, in a fixed order, so a legend cannot reflow. */
export function totalsByCategory(spans: readonly ActivitySpan[]): readonly CategoryTotal[] {
  const totals = new Map<ActivityCategory, number>(
    ACTIVITY_CATEGORIES.map((c) => [c.id, 0]),
  );
  for (const span of spans) {
    totals.set(span.category, (totals.get(span.category) ?? 0) + spanMs(span));
  }
  const grand = [...totals.values()].reduce((sum, ms) => sum + ms, 0);

  return ACTIVITY_CATEGORIES.map((c) => ({
    category: c.id,
    label: c.label,
    ms: totals.get(c.id) ?? 0,
    share: grand === 0 ? 0 : (totals.get(c.id) ?? 0) / grand,
  }));
}

/** Time in categories marked as focused work. */
export function focusedMs(spans: readonly ActivitySpan[]): number {
  return spans
    .filter((span) => activityCategoryInfo(span.category).focused)
    .reduce((sum, span) => sum + spanMs(span), 0);
}

/**
 * How often you changed application.
 *
 * Spans shorter than `minSpanMs` are ignored: alt-tabbing to check something
 * for four seconds is not a context switch in any sense the user cares about,
 * and counting it makes the number meaningless.
 */
export function switchCount(spans: readonly ActivitySpan[], minSpanMs = 30_000): number {
  const meaningful = spans.filter((span) => spanMs(span) >= minSpanMs);
  let switches = 0;
  for (let i = 1; i < meaningful.length; i += 1) {
    if (meaningful[i]!.app !== meaningful[i - 1]!.app) switches += 1;
  }
  return switches;
}

/**
 * The longest unbroken stretch in one application.
 *
 * The counterpart to switchCount: a day can have few switches and still be
 * shallow if nothing lasted.
 */
export function longestStretchMs(spans: readonly ActivitySpan[]): number {
  return spans.reduce((max, span) => Math.max(max, spanMs(span)), 0);
}

/** Spans overlapping a window, clipped to it. */
export function spansWithin(
  spans: readonly ActivitySpan[],
  from: number,
  to: number,
): readonly ActivitySpan[] {
  return spans
    .filter((span) => span.endedAt > from && span.startedAt < to)
    .map((span) => ({
      ...span,
      startedAt: Math.max(span.startedAt, from),
      endedAt: Math.min(span.endedAt, to),
    }));
}

// ---------------------------------------------------------------------------
// Learning categories for unknown apps
// ---------------------------------------------------------------------------

/**
 * Ask a model to categorise applications it has never been told about.
 *
 * This is the Tier 1 job MOCHI_BRAIN.md describes: genuinely fuzzy world
 * knowledge, not arithmetic. "Is Godot design or coding?" needs to know what
 * Godot is; nothing in this repo does, and a rule table can never be finished.
 *
 * Only the application name is sent. No window titles, no file names, no
 * counts — the request carries less than the Activity tab already shows on
 * screen, which is what makes it safe to send to a cloud model.
 */
export function appCategoryPrompt(apps: readonly string[]): string {
  const list = apps.map((a) => `- ${a}`).join('\n');
  const allowed = ACTIVITY_CATEGORIES.map((c) => c.id).join(', ');

  return [
    'Categorise each desktop application by what a person uses it for.',
    `Allowed categories: ${allowed}.`,
    'Use "other" when unsure, when it is a system utility, or when it is entertainment.',
    'Reply with JSON only: an object mapping each name exactly as given to one category.',
    'No prose, no code fences, no extra keys.',
    '',
    list,
  ].join('\n');
}

const CATEGORY_IDS: readonly string[] = ACTIVITY_CATEGORIES.map((c) => c.id);

export const isActivityCategoryId = (value: unknown): value is ActivityCategory =>
  typeof value === 'string' && CATEGORY_IDS.includes(value);

/**
 * Read a model's reply, keeping only answers that pass.
 *
 * The schema guard from MOCHI_BRAIN.md §8.3, applied strictly: an entry is kept
 * only if it names an app that was actually asked about and a category that
 * actually exists. Everything else is dropped in silence.
 *
 * `asked` is checked because a model will occasionally invent an entry, and an
 * invented app would sit in the learned map for ever, matching nothing and
 * never being re-asked.
 */
export function parseAppCategories(
  text: string,
  asked: readonly string[],
): Readonly<Record<string, ActivityCategory>> {
  // Models wrap JSON in fences however firmly they are told not to.
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};

  const wanted = new Set(asked);
  const result: Record<string, ActivityCategory> = {};

  for (const [app, category] of Object.entries(parsed as Record<string, unknown>)) {
    if (!wanted.has(app)) continue;
    if (!isActivityCategoryId(category)) continue;
    result[app] = category;
  }
  return result;
}

/** Below this the app is a passing glance, not worth spending a call on. */
export const MIN_MS_BEFORE_CLASSIFYING = 5 * 60_000;

/** One request should not carry the whole Start menu. */
export const MAX_APPS_PER_REQUEST = 12;

/**
 * Which apps are worth asking about.
 *
 * Uncategorised, used for a meaningful amount of time, and not already known.
 * Ordered by time so a budget spends itself on what the user actually lives in.
 */
export function appsNeedingCategory(
  spans: readonly ActivitySpan[],
  learned: LearnedCategories,
  minMs = MIN_MS_BEFORE_CLASSIFYING,
): readonly string[] {
  const totals = new Map<string, number>();
  for (const span of spans) {
    if (span.category !== 'other') continue;
    if (learned[span.app] !== undefined) continue;
    totals.set(span.app, (totals.get(span.app) ?? 0) + spanMs(span));
  }

  return [...totals.entries()]
    .filter(([, ms]) => ms >= minMs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_APPS_PER_REQUEST)
    .map(([app]) => app);
}
