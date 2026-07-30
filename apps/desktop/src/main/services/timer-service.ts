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
  toggle,
  type StorageAdapter,
  type TimerSnapshot,
  type TimerState,
  type WorkSession,
} from '@mochi/core';

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

  /** One click on the mascot: start if idle, stop if running. */
  async toggle(projectId: string, now: number = Date.now()): Promise<TimerSnapshot> {
    const result = toggle(this.state, { projectId, now, id: randomUUID() });
    this.state = result.state;

    if (result.completed !== null) {
      await this.storage.saveSession(result.completed);
      await this.storage.setRunningSession(null);
    } else if (this.state.active !== null) {
      await this.storage.setRunningSession(this.state.active);
    }

    return this.emit(now);
  }

  async stop(now: number = Date.now()): Promise<TimerSnapshot> {
    const result = stopSession(this.state, now);
    if (!result.ok) return this.snapshot(now);

    this.state = result.value.state;
    await this.storage.saveSession(result.value.completed);
    await this.storage.setRunningSession(null);
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
