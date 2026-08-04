import { describe, expect, it } from 'vitest';
import { InMemoryStorageAdapter } from '@mochi/core';
import { ActivityService } from './activity-service.js';
import type { ForegroundSample, ForegroundSource } from './activity-sampler.js';

/**
 * A privacy claim the app makes about itself, asserted rather than commented.
 *
 * `[activity] sampling every 10s (process names only, no titles)` was printed
 * unconditionally, including when opt-in site tracking was on and titles were
 * being read. It is the one line a user might go looking for to check what is
 * being collected, so it saying the wrong thing is worse than it saying nothing.
 *
 * The guarantee that matters — no `GetWindowText` in the generated script when
 * tracking is off — lives in activity-sampler.test.ts. This is about not
 * describing the state wrongly.
 */

/** A source that never spawns PowerShell. */
function stubSource(): ForegroundSource {
  return {
    supported: true,
    start: (_onSample: (s: ForegroundSample) => void) => undefined,
    stop: () => undefined,
  };
}

function serviceWithSites(tracksSites: boolean): ActivityService {
  return new ActivityService(
    new InMemoryStorageAdapter(),
    () => true,
    undefined,
    () => tracksSites,
    stubSource(),
  );
}

describe('what the app says it is collecting', () => {
  it('does not mention titles when site tracking is off', () => {
    const description = serviceWithSites(false).describeCollection();

    expect(description).toContain('process names only');
    expect(description).toContain('no window titles');
  });

  it('admits to titles when site tracking is on', () => {
    // The failure this replaces: claiming "no titles" while reading them.
    const description = serviceWithSites(true).describeCollection();

    expect(description).toContain('window titles');
    expect(description).not.toContain('no window titles');
    // And says what happens to them, so "reads titles" is not left hanging.
    expect(description).toContain('discarded');
  });

  it('reads the flag each time rather than caching it', () => {
    // Site tracking can be switched in Settings while the app runs, and the
    // description has to follow it or it becomes a lie on the next print.
    let tracking = false;
    const service = new ActivityService(
      new InMemoryStorageAdapter(),
      () => true,
      undefined,
      () => tracking,
      stubSource(),
    );

    expect(service.describeCollection()).toContain('no window titles');
    tracking = true;
    expect(service.describeCollection()).not.toContain('no window titles');
  });
});
