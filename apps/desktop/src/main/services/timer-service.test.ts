import { describe, expect, it } from 'vitest';
import { InMemoryStorageAdapter, type StorageAdapter, type WorkSession } from '@mochi/core';
import { DEFAULT_PROJECT } from '@mochi/db';
import { TimerService } from './timer-service.js';

/**
 * These cover three bugs that were all silent in different ways, so each test
 * asserts the observable consequence rather than the mechanism.
 */

const WORK = 'project-work';
const PERSONAL = 'project-personal';

async function storageWithProjects(): Promise<StorageAdapter> {
  const storage = new InMemoryStorageAdapter();
  await storage.createProject({ id: DEFAULT_PROJECT.id, name: 'General', colour: '#fff' });
  await storage.createProject({ id: WORK, name: 'Work', colour: '#f00' });
  await storage.createProject({ id: PERSONAL, name: 'Personal', colour: '#0f0' });
  return storage;
}

describe('switching category', () => {
  it('switches instead of just stopping', async () => {
    // The bug: core's toggle() ignores its projectId once something is running
    // and merely stops, so clicking a different category stopped the clock and
    // started nothing.
    const storage = await storageWithProjects();
    const timer = new TimerService(storage);

    await timer.toggle(WORK);
    const after = await timer.toggle(PERSONAL);

    expect(after.running).toBe(true);
    expect(after.projectId).toBe(PERSONAL);
  });

  it('closes the previous session rather than losing it', async () => {
    const storage = await storageWithProjects();
    const timer = new TimerService(storage);

    await timer.toggle(WORK);
    await timer.toggle(PERSONAL);

    const saved = await storage.listSessions();
    const work = saved.filter((s) => s.projectId === WORK);
    expect(work).toHaveLength(1);
    expect(work[0]!.endedAt).not.toBeNull();
  });

  it('still stops when the same category is clicked twice', async () => {
    const storage = await storageWithProjects();
    const timer = new TimerService(storage);

    await timer.toggle(WORK);
    const after = await timer.toggle(WORK);

    expect(after.running).toBe(false);
    expect(await storage.getRunningSession()).toBeNull();
  });
});

describe('an unknown project id', () => {
  it('is redirected to the default project rather than started unsaveably', async () => {
    // sessions.project_id is NOT NULL REFERENCES projects(id) with foreign keys
    // enforced. An unknown id started fine — the running session is JSON with no
    // constraint — then failed forever on stop, losing the time.
    const storage = await storageWithProjects();
    const timer = new TimerService(storage);

    const started = await timer.toggle('general'); // not a project id; 'default' is
    expect(started.running).toBe(true);
    expect(started.projectId).toBe(DEFAULT_PROJECT.id);
  });

  it('produces a session that actually references a real project', async () => {
    const storage = await storageWithProjects();
    const timer = new TimerService(storage);

    await timer.toggle('general');
    await timer.stop();

    const saved = await storage.listSessions();
    const projects = await storage.listProjects();
    expect(saved).toHaveLength(1);
    expect(projects.map((p) => p.id)).toContain(saved[0]!.projectId);
  });
});

describe('a failing write', () => {
  /** Storage whose session write always rejects, like an FK violation would. */
  class RejectingStorage extends InMemoryStorageAdapter {
    override async saveSession(_session: WorkSession): Promise<void> {
      return Promise.reject(new Error('FOREIGN KEY constraint failed'));
    }
  }

  it('leaves the session running instead of discarding the time', async () => {
    // The old order cleared in-memory state *before* the write, so a rejected
    // save lost the session from memory and never recorded it — and skipped
    // clearing the stored running session, so the next launch restored
    // something that could never be stopped.
    const storage = new RejectingStorage();
    await storage.createProject({ id: WORK, name: 'Work', colour: '#f00' });
    const timer = new TimerService(storage);

    await timer.toggle(WORK);
    await expect(timer.stop()).rejects.toThrow(/FOREIGN KEY/);

    // Still running, and still on disk: the user can retry, nothing is lost.
    expect(timer.isRunning).toBe(true);
    expect(await storage.getRunningSession()).not.toBeNull();
  });
});
