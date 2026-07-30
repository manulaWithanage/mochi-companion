/**
 * User settings written by the 3-step setup window.
 *
 * V1 holds no secrets. When the BYOK vault lands in V2 it goes in
 * safeStorage in the main process, never here (RULE 1).
 */

import { DEFAULT_WORK_HOURS, parseHhMm, type WorkHours } from '../mascot/state.js';

export interface OverlayPosition {
  readonly x: number;
  readonly y: number;
  /** Which display this position was captured on, so we can re-clamp sanely. */
  readonly displayId: number;
}

export interface MochiSettings {
  readonly assistantName: string;
  readonly skinName: string;
  readonly workHours: WorkHours;
  readonly overlayPosition: OverlayPosition | null;
  /** False until the 3-step window is finished; drives first-run detection. */
  readonly setupCompleted: boolean;
  /** Mochi is hidden entirely. */
  readonly paused: boolean;
  /**
   * Mochi is visible but silent. Distinct from `paused`: the mascot still
   * animates and the stopwatch still works, it just never speaks unprompted.
   */
  readonly doNotDisturb: boolean;
  /** When a routine reminder triggers, float to center of screen with smooth animation. */
  readonly centerScreenAlerts: boolean;
  /** IDs of up to 3 primary quick-select time tracking projects shown above Mochi. */
  readonly primaryProjectIds: readonly string[];
  /**
   * Base URLs for local model servers, when the default port is wrong.
   *
   * Not a secret, so it belongs here rather than in the vault — it is a host
   * and port, and putting it in safeStorage would mean the user could not see
   * or fix what Mochi is trying to reach. Keyed by provider id; absent means
   * "use the documented default".
   */
  readonly localEndpoints: Readonly<Record<string, string>>;
}

export const DEFAULT_SETTINGS: MochiSettings = {
  assistantName: 'Mochi',
  skinName: 'default',
  workHours: DEFAULT_WORK_HOURS,
  overlayPosition: null,
  setupCompleted: false,
  paused: false,
  doNotDisturb: false,
  centerScreenAlerts: true,
  primaryProjectIds: [],
  localEndpoints: {},
};

export const MAX_NAME_LENGTH = 24;

export type SettingsIssue = { readonly field: keyof MochiSettings; readonly message: string };

/**
 * Normalize partial/untrusted settings into a complete, valid object.
 *
 * Always returns something usable — a corrupted settings file must not stop
 * Mochi from starting. Issues are reported alongside for logging.
 */
export function normalizeSettings(raw: unknown): {
  readonly settings: MochiSettings;
  readonly issues: readonly SettingsIssue[];
} {
  const issues: SettingsIssue[] = [];
  if (typeof raw !== 'object' || raw === null) {
    return { settings: DEFAULT_SETTINGS, issues };
  }
  const input = raw as Partial<Record<keyof MochiSettings, unknown>>;

  let assistantName = DEFAULT_SETTINGS.assistantName;
  if (typeof input.assistantName === 'string') {
    const trimmed = input.assistantName.trim();
    if (trimmed.length === 0) {
      issues.push({ field: 'assistantName', message: 'empty, using default' });
    } else {
      assistantName = trimmed.slice(0, MAX_NAME_LENGTH);
    }
  }

  const skinName =
    typeof input.skinName === 'string' && input.skinName.length > 0
      ? input.skinName
      : DEFAULT_SETTINGS.skinName;

  let workHours = DEFAULT_SETTINGS.workHours;
  const rawHours = input.workHours;
  if (typeof rawHours === 'object' && rawHours !== null) {
    const { start, end } = rawHours as Partial<WorkHours>;
    if (
      typeof start === 'string' &&
      typeof end === 'string' &&
      parseHhMm(start) !== null &&
      parseHhMm(end) !== null &&
      start !== end
    ) {
      workHours = { start, end };
    } else {
      issues.push({ field: 'workHours', message: 'invalid range, using default' });
    }
  }

  let overlayPosition: OverlayPosition | null = null;
  const rawPos = input.overlayPosition;
  if (typeof rawPos === 'object' && rawPos !== null) {
    const { x, y, displayId } = rawPos as Partial<OverlayPosition>;
    if (
      typeof x === 'number' &&
      Number.isFinite(x) &&
      typeof y === 'number' &&
      Number.isFinite(y) &&
      typeof displayId === 'number'
    ) {
      overlayPosition = { x, y, displayId };
    } else {
      issues.push({ field: 'overlayPosition', message: 'malformed, will re-place' });
    }
  }

  let primaryProjectIds: string[] = [];
  if (Array.isArray(input.primaryProjectIds)) {
    primaryProjectIds = input.primaryProjectIds
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
      .slice(0, 3);
  }

  // Only http(s) origins are kept. This value is fed to fetch() in the main
  // process, so a settings file someone hand-edited must not be able to point
  // it at file:// or a non-URL.
  const localEndpoints: Record<string, string> = {};
  const rawEndpoints = input.localEndpoints;
  if (typeof rawEndpoints === 'object' && rawEndpoints !== null) {
    for (const [id, value] of Object.entries(rawEndpoints as Record<string, unknown>)) {
      if (typeof value !== 'string') continue;
      const url = value.trim();
      if (/^https?:\/\/[^\s]+$/i.test(url)) localEndpoints[id] = url.replace(/\/+$/, '');
      else if (url.length > 0) {
        issues.push({ field: 'localEndpoints', message: `${id}: not an http(s) URL, ignored` });
      }
    }
  }

  return {
    settings: {
      assistantName,
      skinName,
      workHours,
      overlayPosition,
      setupCompleted: input.setupCompleted === true,
      paused: input.paused === true,
      doNotDisturb: input.doNotDisturb === true,
      centerScreenAlerts: input.centerScreenAlerts !== false,
      primaryProjectIds,
      localEndpoints,
    },
    issues,
  };
}
