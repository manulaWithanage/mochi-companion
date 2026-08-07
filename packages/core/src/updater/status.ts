/**
 * What the updater is doing, in a shape the settings panel can render without
 * knowing that electron-updater exists.
 *
 * Until this existed the update process was **entirely invisible**. It checked
 * at launch and every six hours after, downloaded in the background and
 * installed on quit, and reported none of it anywhere a user could look. When an
 * install stayed on an old version there was no way to tell which stage it had
 * reached — or whether it had failed — short of reading `main.log` off the
 * machine. Two devices sat on v0.1.4 for exactly that reason.
 *
 * `failed` is a first-class state rather than a console line for the same
 * reason: an update that cannot be fetched, cannot be parsed or is refused by
 * the operating system is precisely the case the user needs told about, and it
 * is the case that used to be swallowed.
 */

export type UpdateStatus =
  /** Not a packaged build. There is no feed to read, and saying "up to date" would be a lie. */
  | { readonly state: 'unsupported' }
  /** Packaged, but nothing has been asked yet this session. */
  | { readonly state: 'idle' }
  | { readonly state: 'checking' }
  | { readonly state: 'current'; readonly checkedAt: number }
  | { readonly state: 'downloading'; readonly version: string; readonly percent: number }
  /** On disk and waiting for the app to quit. */
  | { readonly state: 'ready'; readonly version: string }
  | { readonly state: 'failed'; readonly reason: string; readonly at: number };

/**
 * Whether asking again would do anything.
 *
 * False mid-flight so the button cannot stack a second check on top of a
 * running one, and false once an update is on disk — there is nothing left to
 * find, and re-checking would only replace a useful "ready" with "up to date".
 */
export function canCheckForUpdates(status: UpdateStatus): boolean {
  return status.state === 'idle' || status.state === 'current' || status.state === 'failed';
}

/** Whether the app has an update on disk that a restart would apply. */
export function updateAwaitsRestart(status: UpdateStatus): status is {
  readonly state: 'ready';
  readonly version: string;
} {
  return status.state === 'ready';
}

/**
 * One line of plain English for the settings panel.
 *
 * `now` is passed rather than read so the relative times are testable.
 */
export function describeUpdateStatus(status: UpdateStatus, now: number): string {
  switch (status.state) {
    case 'unsupported':
      return 'Updates are only checked in an installed build.';
    case 'idle':
      return 'Not checked yet this session.';
    case 'checking':
      return 'Checking for updates…';
    case 'current':
      return `Up to date. Checked ${describeAgo(now - status.checkedAt)}.`;
    case 'downloading':
      return `Downloading ${status.version}, ${Math.round(status.percent)}%.`;
    case 'ready':
      // Both routes named, because they are not the same offer: the button
      // reinstalls silently and brings Mochi back, while quitting applies it
      // and leaves the app closed, which is what someone quitting wants.
      return `${status.version} is ready. Restart to finish, or it installs next time you quit.`;
    case 'failed':
      return status.reason;
  }
}

/** `just now`, `4 minutes ago`, `2 hours ago`. */
function describeAgo(elapsedMs: number): string {
  const mins = Math.floor(Math.max(0, elapsedMs) / 60_000);
  if (mins < 1) return 'just now';
  if (mins === 1) return '1 minute ago';
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
}

/**
 * Turn an electron-updater failure into something worth showing.
 *
 * Its own messages are written for a log — stack-shaped, and often just an
 * errno. Showing them raw makes a user feel the app is broken without telling
 * them whether it is their wifi, our release, or Windows refusing the file. The
 * cases below are the ones actually seen or expected; anything unrecognised is
 * passed through rather than flattened into "something went wrong", because a
 * message we did not anticipate is exactly the one worth reading verbatim.
 */
export function summariseUpdateFailure(message: string): string {
  const text = message.trim();
  const lower = text.toLowerCase();

  if (/enotfound|eai_again|enetunreach|econnrefused|etimedout|network/.test(lower)) {
    return 'Could not reach GitHub to check for updates. This usually means no connection.';
  }
  if (/err_updater_channel_file_not_found|404/.test(lower)) {
    return 'No update information was published for the latest release. Nothing to install yet.';
  }
  if (/signature|signed|not trusted|publisher/.test(lower)) {
    // Mochi ships unsigned, so this is a real possibility rather than a
    // theoretical one, and "check your connection" would send the user the
    // wrong way entirely.
    return 'Windows refused the downloaded update because Mochi is not code-signed yet. Install the new version manually from the website.';
  }
  if (/eperm|eacces|permission denied|access is denied/.test(lower)) {
    return 'Mochi could not write the update to disk. Antivirus or a permissions rule usually causes this.';
  }
  if (/enospc|no space/.test(lower)) {
    return 'Not enough disk space to download the update.';
  }

  return text.length > 0 ? text : 'The update check failed, and said nothing about why.';
}
