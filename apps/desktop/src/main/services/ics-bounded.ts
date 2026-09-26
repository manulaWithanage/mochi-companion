/**
 * Parse an ICS feed off the main thread, with a deadline.
 *
 * `parseIcs` is synchronous and its caps are checked between ical.js iterator
 * steps, but ical.js can loop forever *inside* one step on a recurrence rule
 * that never matches (see `isImpossibleRecurrence`). Run on the main process,
 * that freezes the whole app, and because the calendar refreshes at startup it
 * freezes it again on every launch. No cap inside the parser can bound a loop
 * the parser does not own, so the bound lives outside it: a worker thread that
 * is terminated when it runs out of time.
 *
 * A timeout is a failure, not an empty calendar. An empty result would replace
 * the cached events and report a successful sync, which is exactly the silent
 * success an unreadable feed must never produce.
 *
 * No electron import, and no build-tool import either: the worker entry's path
 * is resolved by index.ts and handed in, so this file stays testable.
 */

import { Worker } from 'node:worker_threads';
import type { CalendarEvent } from '@mochi/core';
import type { IcsParseOptions } from './ics.js';

/**
 * How long one parse may take before it is abandoned.
 *
 * A real feed with years of history parses in well under a second; this is
 * generous headroom for a slow machine, and still short enough that a hostile
 * feed costs a few seconds of one background thread rather than the app.
 */
export const ICS_PARSE_TIMEOUT_MS = 5_000;

/**
 * What crosses into the worker.
 *
 * Must be structured-cloneable, which is why the window is epoch milliseconds
 * rather than Dates or ical.js objects.
 */
export interface IcsWorkerInput {
  readonly text: string;
  readonly options: IcsParseOptions;
}

/** The slice of `Worker` this module uses, so tests can supply a fake. */
export interface IcsWorkerLike {
  on(event: 'message', listener: (value: unknown) => void): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
  on(event: 'exit', listener: (code: number) => void): unknown;
  terminate(): Promise<number>;
}

/** Starts a worker that parses `input` and posts back the event list. */
export type IcsWorkerFactory = (input: IcsWorkerInput) => IcsWorkerLike;

export type IcsParseResult =
  | { readonly ok: true; readonly events: readonly CalendarEvent[] }
  | { readonly ok: false; readonly error: string };

/**
 * How CalendarService turns feed text into events.
 *
 * Injected rather than imported so production always goes through the worker
 * while tests can parse in-process without spawning threads.
 */
export type IcsParser = (text: string, options: IcsParseOptions) => Promise<IcsParseResult>;

/** The real factory: one short-lived thread per parse, running ics-worker.ts. */
export function icsWorkerFactory(workerPath: string): IcsWorkerFactory {
  return (input) => new Worker(workerPath, { workerData: input });
}

/**
 * Parse `text` in a worker, giving up after `timeoutMs`.
 *
 * Never rejects. Every way the worker can fail (timeout, crash, exiting
 * without an answer) resolves to `{ ok: false }` with a message fit to show
 * the user, and the caller keeps its last good events.
 */
export function parseIcsBounded(
  text: string,
  options: IcsParseOptions,
  spawn: IcsWorkerFactory,
  timeoutMs: number = ICS_PARSE_TIMEOUT_MS,
): Promise<IcsParseResult> {
  return new Promise((resolve) => {
    let settled = false;
    let worker: IcsWorkerLike;

    const finish = (result: IcsParseResult, stop: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // terminate() is what actually reclaims a thread stuck inside ical.js;
      // settling the promise alone would leave it spinning a core forever.
      if (stop) void worker.terminate().catch(() => undefined);
      resolve(result);
    };

    const timer = setTimeout(() => {
      console.warn(`[calendar] feed parse exceeded ${timeoutMs}ms; worker terminated`);
      finish(
        {
          ok: false,
          error:
            'That calendar took too long to read. It may contain a repeating event Mochi cannot expand.',
        },
        true,
      );
    }, timeoutMs);

    try {
      worker = spawn({ text, options });
    } catch (error) {
      clearTimeout(timer);
      settled = true;
      console.error('[calendar] could not start the feed parser:', error);
      resolve({ ok: false, error: 'Could not read the calendar.' });
      return;
    }

    worker.on('message', (value) => {
      if (!Array.isArray(value)) {
        finish({ ok: false, error: 'Could not read the calendar.' }, true);
        return;
      }
      finish({ ok: true, events: value as CalendarEvent[] }, false);
    });
    worker.on('error', (error) => {
      console.error('[calendar] feed parser crashed:', error);
      finish({ ok: false, error: 'Could not read the calendar.' }, true);
    });
    // An exit before any message means the worker died without answering;
    // after a message, `settled` makes this a no-op.
    worker.on('exit', () => {
      finish({ ok: false, error: 'Could not read the calendar.' }, false);
    });
  });
}
