import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CHECK_INTERVAL_MS,
  describeReadyUpdate,
  shouldCheck,
  updateSubject,
} from './updater-policy.js';

/**
 * Split out from the electron-updater wiring so these are reachable without a
 * packaged app, a GitHub release or a network.
 *
 * The development guard is the one that earns its keep: `checkForUpdates` throws
 * in an unpackaged app, because there is no app-update.yml to read. Every tutorial
 * calls it unconditionally at startup.
 */

const NOW = new Date(2026, 7, 5, 10, 0, 0).getTime();

describe('whether to check', () => {
  it('checks in a packaged build that has not checked yet', () => {
    expect(shouldCheck({ packaged: true, lastCheckedAt: null, now: NOW })).toEqual({ check: true });
  });

  it('never checks in development', () => {
    const decision = shouldCheck({ packaged: false, lastCheckedAt: null, now: NOW });

    expect(decision.check).toBe(false);
    expect(decision).toMatchObject({ because: expect.stringContaining('packaged') });
  });

  it('does not re-check on a quick restart', () => {
    const decision = shouldCheck({ packaged: true, lastCheckedAt: NOW - 60_000, now: NOW });

    expect(decision.check).toBe(false);
    expect(decision).toMatchObject({ because: 'checked 1 min ago' });
  });

  it('checks again once the interval has passed', () => {
    const past = NOW - CHECK_INTERVAL_MS - 1;
    expect(shouldCheck({ packaged: true, lastCheckedAt: past, now: NOW }).check).toBe(true);
  });

  it('says why it is not checking, so a silent no-op is not a mystery', () => {
    const decision = shouldCheck({ packaged: false, lastCheckedAt: null, now: NOW });
    expect(decision.check === false && decision.because.length > 0).toBe(true);
  });
});

describe('what it says', () => {
  it('names the version and when it takes effect', () => {
    const text = describeReadyUpdate('1.0.2');

    expect(text).toContain('1.0.2');
    expect(text).toContain('close Mochi');
  });

  it('reports the update as already downloaded, not as a request', () => {
    // Asking permission to fetch something the user cannot evaluate is a question
    // with no useful answer. Telling them their app changed is information.
    expect(describeReadyUpdate('1.0.2')).toMatch(/is ready/);
  });

  it('tolerates a v prefix', () => {
    expect(describeReadyUpdate('v1.0.2')).toContain('1.0.2');
    expect(describeReadyUpdate('v1.0.2')).not.toContain('v1.0.2');
  });

  it('still says something useful with no version at all', () => {
    expect(describeReadyUpdate('   ')).toContain('close Mochi');
  });
});

describe('the governor subject', () => {
  it('is per version, so one version cannot nag twice', () => {
    expect(updateSubject('1.0.2')).toBe('update:1.0.2');
    expect(updateSubject('1.0.3')).not.toBe(updateSubject('1.0.2'));
  });

  it('matches whether or not the version carried a v', () => {
    // Otherwise dismissing v1.0.2 would not silence 1.0.2 — the governor keys on
    // the subject string, so these have to agree.
    expect(updateSubject('v1.0.2')).toBe(updateSubject('1.0.2'));
  });
});

/**
 * A guard, not a unit test.
 *
 * `CHECK_INTERVAL_MS` was defined here and respected by `shouldCheck`, and
 * nothing ever drove it: `UpdaterService.start()` was called once at boot and
 * never again. So the interval was real, tested, and dead — anyone who left Mochi
 * running for days never learned an update existed. A companion is meant to stay
 * open; "restart to find out" is the wrong shape for one.
 *
 * The wiring lives beside `electron` imports with no seam to test through, so
 * this reads the source instead.
 */
describe('the check actually repeats', () => {
  const source = (): string =>
    readFileSync(join(import.meta.dirname, 'updater.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

  it('drives the interval with a timer', () => {
    const code = source();

    expect(code, 'a constant nothing schedules is a constant nobody obeys').toMatch(
      /setInterval\([^)]*CHECK_INTERVAL_MS|setInterval\(\s*\(\)\s*=>\s*this\.check\(\),\s*CHECK_INTERVAL_MS/,
    );
  });

  it('unrefs it, so bookkeeping cannot hold the process open', () => {
    expect(source()).toMatch(/unref\?\.\(\)/);
  });

  it('wires the electron-updater listeners behind a once-only flag', () => {
    // Its emitter is global. Wiring twice would stack a second copy of every
    // listener, and one downloaded update would announce itself twice.
    const code = source();

    expect(code).toMatch(/if \(this\.wired\) return;/);
    expect(code).toMatch(/this\.wired = true;/);
  });

  it('can be stopped', () => {
    expect(source()).toMatch(/clearInterval\(this\.timer\)/);
  });
});
