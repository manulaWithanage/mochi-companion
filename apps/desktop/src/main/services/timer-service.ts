/**
 * Owns the live TimerState and persists it.
 *
 * All the decision logic lives in @mochi/core as pure functions; this class
 * only wires those to storage and notifies listeners (RULE 2).
 */

import { randomUUID } from 'node:crypto';
import {
  elapsedMs,
  emptyTimerState,
  stopSession,
  switchProject,
  toggle,
  type StorageAdapter,
  type TimerSnapshot,
  type TimerState,
  type WorkSession,
} from '@mochi/core';
import { DEFAULT_PROJECT } from '@mochi/db';

export class TimerService {
  private state: TimerState = emptyTimerState;
  private readonly listeners = new Set<(snapshot: TimerSnapshot) => void>();

  constructor(private readonly storage: StorageAdapter) {}

  /**
   * Recover a session that was running when the app last exited.
   *
   * An unclean shutdown must not silently discard tracked time. We keep the
   * session open rather than guessing an end time — the user can stop it and
   * see a duration that includes the downtime, which is visible and
   * correctable, unlike silently losing the session.
   */
  async restore(): Promise<TimerSnapshot> {
    const running = await this.storage.getRunningSession();
    if (running !== null && running.endedAt === null) {
      this.state = { active: running };
    }
    return this.snapshot();
  }

  snapshot(now: number = Date.now()): TimerSnapshot {
    const active = this.state.active;
    return {
      running: active !== null,
      session: active,
      projectId: active?.projectId ?? null,
      elapsedMs: active === null ? 0 : elapsedMs(active, now),
    };
  }

  /**
   * A session whose project does not exist can never be written.
   *
   * `sessions.project_id` is `NOT NULL REFERENCES projects(id)` and foreign
   * keys are enforced, so an unknown id starts happily — the running session
   * is JSON in `app_state`, which has no constraint — and then explodes on
   * stop, when the completed row finally hits the table. The time is lost, the
   * stale running session stays on disk, and the next launch restores a
   * phantom that can never be stopped.
   *
   * So the id is checked here, before anything starts. A caller passing an id
   * that is not a project is a bug in the caller, which is why this shouts
   * rather than failing quietly, but it falls back to the default project so
   * the user still gets their time tracked somewhere real.
   */
  private async resolveProjectId(projectId: string): Promise<string> {
    const projects = await this.storage.listProjects();
    if (projects.some((p) => p.id === projectId)) return projectId;

    console.error(
      `[timer] no project "${projectId}" — tracking under ${DEFAULT_PROJECT.id} instead. ` +
        'This is a caller bug: the id must come from projects.list().',
    );
    return DEFAULT_PROJECT.id;
  }

  /**
   * One click on the mascot, or on a category: start, stop, or switch.
   *
   * Clicking a *different* category switches to it. `toggle` from core ignores
   * its projectId once something is running and merely stops — so this used to
   * stop the old session and start nothing, leaving the user staring at a
   * category they had just clicked with no clock running.
   */
  async toggle(projectId: string, now: number = Date.now()): Promise<TimerSnapshot> {
    const wanted = await this.resolveProjectId(projectId);
    const active = this.state.active;

    const result =
      active !== null && active.projectId !== wanted
        ? switchProject(this.state, { projectId: wanted, now, id: randomUUID() })
        : toggle(this.state, { projectId: wanted, now, id: randomUUID() });

    // Persist before touching in-memory state, so a failed write leaves the
    // session running and retryable rather than silently discarded.
    if (result.completed !== null) await this.storage.saveSession(result.completed);
    await this.storage.setRunningSession(result.state.active);

    this.state = result.state;
    return this.emit(now);
  }

  async stop(now: number = Date.now()): Promise<TimerSnapshot> {
    const result = stopSession(this.state, now);
    if (!result.ok) return this.snapshot(now);

    // Write first, then clear. The old order cleared `this.state` before the
    // save, so a rejected write lost the session from memory *and* failed to
    // record it — and skipped clearing the stored running session, so the next
    // launch restored something unstoppable.
    await this.storage.saveSession(result.value.completed);
    await this.storage.setRunningSession(null);

    this.state = result.value.state;
    return this.emit(now);
  }

  async listSessions(projectId?: string): Promise<readonly WorkSession[]> {
    return this.storage.listSessions(
      projectId !== undefined ? { projectId, limit: 200 } : { limit: 200 },
    );
  }

  get isRunning(): boolean {
    return this.state.active !== null;
  }

  onChange(listener: (snapshot: TimerSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(now: number): TimerSnapshot {
    const snapshot = this.snapshot(now);
    for (const listener of this.listeners) listener(snapshot);
    return snapshot;
  }
}
