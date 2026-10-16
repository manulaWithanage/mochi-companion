/**
 * Start-at-sign-in, reconciled against the OS rather than remembered.
 *
 * The settings file cannot be the source of truth for this. A login item is
 * removed by Task Manager's Startup tab on Windows and by System Settings →
 * General → Login Items on macOS, and neither tells the application. A stored
 * boolean would then say "on" for ever while nothing started — the same
 * failure shape as the first-run checkboxes that were wired to nothing
 * ([[silent-success]]).
 *
 * The OS is reached through `LoginItemOs` rather than `electron.app` so this
 * file stays electron-free and therefore testable, per the note in
 * `vitest.config.ts`. The electron-backed implementation lives next door in
 * `login-item-electron.ts`.
 */

/** The two things we need from the operating system, and nothing more. */
export interface LoginItemOs {
  /** Whether a login item for this application currently exists. */
  read(): boolean;
  /** Ask for one to be created or removed. May silently do nothing. */
  write(enabled: boolean): void;
  /** `process.platform`, injected so the support check is testable. */
  readonly platform: string;
}

/**
 * Linux has no `setLoginItemSettings` implementation in Electron: the call is
 * a no-op and the getter always answers false, so a toggle there is a control
 * that cannot work. It is still offered — refusals are reported in the UI —
 * but nothing in this module pretends otherwise.
 */
export function loginItemSupported(platform: string): boolean {
  return platform === 'win32' || platform === 'darwin';
}

/** What the OS currently believes, which is the only thing that matters. */
export function readLaunchOnLogin(os: LoginItemOs): boolean {
  if (!loginItemSupported(os.platform)) return false;
  try {
    return os.read();
  } catch (error) {
    console.warn('[login-item] could not read login item settings:', error);
    return false;
  }
}

/**
 * Ask the OS to change the login item, then report what it says.
 *
 * Returns the value read back *after* the write, never the value requested. A
 * locked registry key or a managed Mac is exactly the case this exists for: it
 * is where "the switch moved but nothing happened" becomes visible.
 */
export function applyLaunchOnLogin(os: LoginItemOs, enabled: boolean): boolean {
  if (!loginItemSupported(os.platform)) return false;
  try {
    os.write(enabled);
  } catch (error) {
    console.warn('[login-item] could not write login item settings:', error);
  }
  return readLaunchOnLogin(os);
}

/**
 * Bring the stored setting into line with the OS at startup.
 *
 * One direction only: the OS wins. Writing the stored value back to the OS
 * instead would silently re-create a login item the user had just removed by
 * hand, which is the opposite of helpful.
 */
export function reconcileLaunchOnLogin(os: LoginItemOs, stored: boolean): boolean {
  const actual = readLaunchOnLogin(os);
  if (actual !== stored) {
    console.log(
      `[login-item] settings said ${stored}, the OS says ${actual} — taking the OS's answer`,
    );
  }
  return actual;
}
