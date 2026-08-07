import { describe, expect, it } from 'vitest';
import {
  canCheckForUpdates,
  describeUpdateStatus,
  summariseUpdateFailure,
  updateAwaitsRestart,
  type UpdateStatus,
} from './status.js';

const NOW = 1_700_000_000_000;

describe('canCheckForUpdates', () => {
  it('allows another check once one has settled', () => {
    expect(canCheckForUpdates({ state: 'idle' })).toBe(true);
    expect(canCheckForUpdates({ state: 'current', checkedAt: NOW })).toBe(true);
    expect(canCheckForUpdates({ state: 'failed', reason: 'nope', at: NOW })).toBe(true);
  });

  it('refuses while a check or download is in flight', () => {
    expect(canCheckForUpdates({ state: 'checking' })).toBe(false);
    expect(canCheckForUpdates({ state: 'downloading', version: '0.2.0', percent: 40 })).toBe(false);
  });

  it('refuses once an update is on disk', () => {
    // Re-checking here would replace a useful "ready to install" with
    // "up to date", which is true and useless.
    expect(canCheckForUpdates({ state: 'ready', version: '0.2.0' })).toBe(false);
  });

  it('refuses in a build with no update feed', () => {
    expect(canCheckForUpdates({ state: 'unsupported' })).toBe(false);
  });
});

describe('updateAwaitsRestart', () => {
  it('is true only when a version is on disk', () => {
    expect(updateAwaitsRestart({ state: 'ready', version: '0.2.0' })).toBe(true);
    expect(updateAwaitsRestart({ state: 'downloading', version: '0.2.0', percent: 99 })).toBe(
      false,
    );
    expect(updateAwaitsRestart({ state: 'current', checkedAt: NOW })).toBe(false);
  });
});

describe('describeUpdateStatus', () => {
  it('never claims to be up to date when there is no feed to read', () => {
    // The distinction that matters: a dev build has not checked and cannot,
    // and reporting "up to date" would be an outright false statement.
    expect(describeUpdateStatus({ state: 'unsupported' }, NOW)).toBe(
      'Updates are only checked in an installed build.',
    );
  });

  it('reads the elapsed time back in whole units', () => {
    const at = (msAgo: number): UpdateStatus => ({ state: 'current', checkedAt: NOW - msAgo });
    expect(describeUpdateStatus(at(20_000), NOW)).toContain('just now');
    expect(describeUpdateStatus(at(60_000), NOW)).toContain('1 minute ago');
    expect(describeUpdateStatus(at(4 * 60_000), NOW)).toContain('4 minutes ago');
    expect(describeUpdateStatus(at(60 * 60_000), NOW)).toContain('1 hour ago');
    expect(describeUpdateStatus(at(3 * 60 * 60_000), NOW)).toContain('3 hours ago');
  });

  it('rounds the download percentage rather than printing a float', () => {
    expect(
      describeUpdateStatus({ state: 'downloading', version: '0.2.0', percent: 41.7 }, NOW),
    ).toBe('Downloading 0.2.0, 42%.');
  });

  it('says what has to happen for a ready update to apply', () => {
    // The whole reason two devices sat on an old version: downloaded is not
    // installed, and nothing said so. Both routes are named because they end
    // differently — the button brings Mochi back, quitting does not.
    expect(describeUpdateStatus({ state: 'ready', version: '0.1.5' }, NOW)).toBe(
      '0.1.5 is ready. Restart to finish, or it installs next time you quit.',
    );
  });

  it('shows the failure reason verbatim', () => {
    expect(
      describeUpdateStatus({ state: 'failed', reason: 'Could not reach GitHub.', at: NOW }, NOW),
    ).toBe('Could not reach GitHub.');
  });
});

describe('summariseUpdateFailure', () => {
  it('turns a network errno into something actionable', () => {
    expect(summariseUpdateFailure('getaddrinfo ENOTFOUND github.com')).toContain('no connection');
    expect(summariseUpdateFailure('connect ETIMEDOUT 140.82.121.3:443')).toContain('no connection');
  });

  it('names code signing, because Mochi ships unsigned', () => {
    // Routing this to "check your connection" would send someone hunting their
    // router for a problem Windows is causing.
    const summary = summariseUpdateFailure('New version is not signed by the application owner');
    expect(summary).toContain('not code-signed');
    expect(summary).toContain('manually');
  });

  it('separates a missing feed from a broken one', () => {
    expect(summariseUpdateFailure('ERR_UPDATER_CHANNEL_FILE_NOT_FOUND')).toContain(
      'Nothing to install yet',
    );
  });

  it('distinguishes a disk refusal from a network one', () => {
    expect(summariseUpdateFailure('EPERM: operation not permitted, rename ...')).toContain(
      'Antivirus',
    );
    expect(summariseUpdateFailure('ENOSPC: no space left on device')).toContain('disk space');
  });

  it('passes an unrecognised message through instead of flattening it', () => {
    // A message nobody anticipated is the one most worth reading exactly.
    expect(summariseUpdateFailure('Cannot parse latest.yml: unexpected token')).toBe(
      'Cannot parse latest.yml: unexpected token',
    );
  });

  it('still says something when the error said nothing', () => {
    expect(summariseUpdateFailure('   ')).toBe(
      'The update check failed, and said nothing about why.',
    );
  });
});
