/**
 * Turns foreground samples into stored activity spans.
 *
 * Buffers in memory and flushes periodically rather than writing every sample:
 * at one sample per ten seconds a write-through design would be 8,640 rows a
 * day, all of which collapse into a few dozen spans.
 *
 * **Idle time is dropped, not attributed.** Without that, a machine left
 * unlocked overnight reports eight hours in whatever happened to be on screen,
 * and every number downstream — the retrospective, the brain, the briefing —
 * inherits the lie.
 */

import {
  classifyProcess,
  samplesToSpans,
  type ActivitySample,
  type ActivitySpan,
  type StorageAdapter,
} from '@mochi/core';
import { createForegroundSource, type ForegroundSource } from './activity-sampler.js';

/** How often the foreground is read. Slow on purpose; the answer changes slowly. */
export const SAMPLE_SECONDS = 10;
const SAMPLE_MS = SAMPLE_SECONDS * 1000;

/**
 * No input for this long means the person is not there.
 *
 * Three minutes rather than thirty seconds: reading, watching and thinking all
 * involve long stretches without a keystroke, and treating those as absence
 * would erase exactly the deep work this is meant to measure.
 */
const IDLE_THRESHOLD_MS = 3 * 60_000;

/** Write buffered spans this often. */
const FLUSH_INTERVAL_MS = 2 * 60_000;

/** Discard anything older than this. */
export const RETENTION_DAYS = 90;

export class ActivityService {
  private readonly source: ForegroundSource;
  private buffer: ActivitySample[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private pruneTimer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly storage: StorageAdapter,
    private readonly isEnabled: () => boolean,
    source?: ForegroundSource,
  ) {
    this.source = source ?? createForegroundSource(SAMPLE_SECONDS);
  }

  get supported(): boolean {
    return this.source.supported;
  }

  start(): void {
    if (this.running || !this.source.supported) return;
    this.running = true;

    this.source.start((sample) => {
      // Checked per sample rather than at start, so switching tracking off in
      // Settings takes effect immediately instead of at the next restart.
      if (!this.isEnabled()) return;
      if (sample.idleMs >= IDLE_THRESHOLD_MS) return;
      if (sample.process.length === 0) return;

      const resolved = classifyProcess(sample.process);
      this.buffer.push({ at: Date.now(), app: resolved.app, category: resolved.category });
    });

    this.flushTimer = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);
    this.flushTimer.unref?.();

    // Daily prune. Retention is the only thing standing between this and a
    // database that grows for ever.
    this.pruneTimer = setInterval(() => void this.prune(), 24 * 60 * 60_000);
    this.pruneTimer.unref?.();

    console.log(`[activity] sampling every ${SAMPLE_SECONDS}s (process names only, no titles)`);
  }

  /**
   * Write buffered samples as spans.
   *
   * The final sample is held back: it may still be extended by the next one,
   * and flushing it now would produce a short span that a later flush repeats
   * as a longer one. Keeping it means every written span is complete.
   */
  async flush(): Promise<void> {
    if (this.buffer.length < 2) return;

    const pending = this.buffer.slice(0, -1);
    const last = this.buffer[this.buffer.length - 1]!;
    this.buffer = [last];

    const spans = samplesToSpans(pending, SAMPLE_MS);
    if (spans.length === 0) return;

    try {
      await this.storage.saveActivitySpans(spans);
    } catch (error) {
      console.error('[activity] could not persist spans:', error);
      // Put them back: a failed write should not silently lose the day.
      this.buffer = [...pending, ...this.buffer];
    }
  }

  /** Spans in a window, including anything still buffered. */
  async list(since: number, until: number): Promise<readonly ActivitySpan[]> {
    const stored = await this.storage.listActivitySpans(since, until);
    // The buffer holds up to two minutes that is not on disk yet. Leaving it
    // out makes the current app look like it was abandoned.
    const live = samplesToSpans(this.buffer, SAMPLE_MS).filter(
      (span) => span.endedAt > since && span.startedAt < until,
    );
    return [...stored, ...live].sort((a, b) => a.startedAt - b.startedAt);
  }

  async prune(): Promise<void> {
    try {
      await this.storage.pruneActivitySpans(Date.now() - RETENTION_DAYS * 24 * 60 * 60_000);
    } catch {
      // Retention failing is not worth interrupting anything over.
    }
  }

  /** Forget everything recorded. The Activity tab offers this outright. */
  async forgetAll(): Promise<void> {
    this.buffer = [];
    await this.storage.pruneActivitySpans(Date.now() + 1);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.flushTimer !== null) clearInterval(this.flushTimer);
    if (this.pruneTimer !== null) clearInterval(this.pruneTimer);
    this.flushTimer = null;
    this.pruneTimer = null;
    this.source.stop();
    // Flush what is left, including the sample normally held back.
    if (this.buffer.length > 0) {
      const spans = samplesToSpans(this.buffer, SAMPLE_MS);
      this.buffer = [];
      try {
        await this.storage.saveActivitySpans(spans);
      } catch {
        /* shutting down anyway */
      }
    }
  }
}
