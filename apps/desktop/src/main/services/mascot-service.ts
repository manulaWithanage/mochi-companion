/**
 * Derives the mascot's visual state and pushes changes to the overlay.
 *
 * Deliberately in main, not the renderer: the renderer draws frames and
 * nothing else. This is also where the interruption governor will slot in
 * for V2 — sources will feed this instead of it polling.
 */

import { powerMonitor } from 'electron';
import { deriveMascotState, type MascotState, type WorkHours } from '@mochi/core';

/** How often to re-derive. Cheap, and only changes state on a transition. */
const TICK_MS = 15_000;

export interface MascotInputs {
  isTimerRunning(): boolean;
  getWorkHours(): WorkHours;
}

export class MascotService {
  private current: MascotState = 'idle';
  private timer: NodeJS.Timeout | null = null;
  private readonly listeners = new Set<(state: MascotState) => void>();

  constructor(private readonly inputs: MascotInputs) {}

  start(): void {
    this.evaluate();
    this.timer = setInterval(() => this.evaluate(), TICK_MS);
    // Node keeps the process alive for interval handles; this one is
    // ambient bookkeeping and should never do that.
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  get state(): MascotState {
    return this.current;
  }

  /** Call after anything that could change the derived state. */
  evaluate(now: Date = new Date()): MascotState {
    const next = deriveMascotState({
      timerRunning: this.inputs.isTimerRunning(),
      now,
      workHours: this.inputs.getWorkHours(),
      userIdleMs: powerMonitor.getSystemIdleTime() * 1000,
    });

    if (next !== this.current) {
      this.current = next;
      for (const listener of this.listeners) listener(next);
    }
    return next;
  }

  onChange(listener: (state: MascotState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
