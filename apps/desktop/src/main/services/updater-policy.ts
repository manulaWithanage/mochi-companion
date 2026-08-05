/**
 * When to check for an update, and what to say about one.
 *
 * Split from the electron-updater wiring so the decisions are testable without a
 * packaged app, a GitHub release, or a network. `updater.ts` is then thin enough
 * to read in one go and has nothing in it worth testing.
 */

/** Long enough that a quick restart does not re-check; short enough to be current. */
export const CHECK_INTERVAL_MS = 6 * 60 * 60_000;

export interface UpdaterEnvironment {
  /** False in development, where there is no update feed and the check throws. */
  readonly packaged: boolean;
  /** Whether a check has already happened this session, and when. */
  readonly lastCheckedAt: number | null;
  readonly now: number;
}

export type CheckDecision =
  { readonly check: true } | { readonly check: false; readonly because: string };

/**
 * Whether to ask GitHub about a newer version right now.
 *
 * The development guard is not defensive tidiness. `checkForUpdates` throws in an
 * unpackaged app because there is no app-update.yml to read, and an unhandled
 * rejection at startup is a rough way to learn that.
 */
export function shouldCheck(env: UpdaterEnvironment): CheckDecision {
  if (!env.packaged) {
    return { check: false, because: 'not a packaged build — there is no update feed to read' };
  }
  if (env.lastCheckedAt !== null && env.now - env.lastCheckedAt < CHECK_INTERVAL_MS) {
    const mins = Math.round((env.now - env.lastCheckedAt) / 60_000);
    return { check: false, because: `checked ${mins} min ago` };
  }
  return { check: true };
}

/**
 * What Mochi says once a new version is on disk and waiting.
 *
 * Said *after* the download, not before: asking permission to fetch something the
 * user cannot evaluate is a question with no useful answer, while telling them
 * their app changed is information they can act on. The install still waits for
 * them to close the app — nothing is swapped underneath a running session.
 *
 * Deliberately not `checkForUpdatesAndNotify()`, which raises a native OS
 * notification. Mochi has exactly one door to attention and the governor owns it;
 * a native toast is a second door that ignores quiet hours, Do Not Disturb and
 * the hourly budget. An update notice is the least urgent thing in the app and
 * has no business jumping that queue.
 */
export function describeReadyUpdate(version: string): string {
  const clean = version.trim().replace(/^v/, '');
  return clean.length === 0
    ? 'An update is ready. It will finish next time you close Mochi.'
    : `Update ${clean} is ready. It will finish next time you close Mochi.`;
}

/** Governor subject, so one version cannot nag twice. */
export function updateSubject(version: string): string {
  return `update:${version.trim().replace(/^v/, '')}`;
}
