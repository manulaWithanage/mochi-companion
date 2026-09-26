import { EventEmitter } from 'node:events';
import { Worker } from 'node:worker_threads';
import { describe, expect, it } from 'vitest';
import { parseIcsBounded, type IcsWorkerFactory, type IcsWorkerLike } from './ics-bounded.js';

const OPTIONS = { from: 0, to: 1 };

/** A worker that does whatever the test tells it to, and records terminate(). */
class FakeWorker extends EventEmitter implements IcsWorkerLike {
  terminated = 0;
  terminate(): Promise<number> {
    this.terminated += 1;
    return Promise.resolve(1);
  }
}

function fakeFactory(behave: (worker: FakeWorker) => void = () => undefined): {
  spawn: IcsWorkerFactory;
  workers: FakeWorker[];
} {
  const workers: FakeWorker[] = [];
  return {
    workers,
    spawn: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      // Deferred, as a real worker's messages are: listeners are attached
      // after spawn returns.
      queueMicrotask(() => behave(worker));
      return worker;
    },
  };
}

describe('parseIcsBounded', () => {
  it('returns the events the worker posts', async () => {
    const { spawn, workers } = fakeFactory((w) => w.emit('message', [{ id: 'a' }]));
    const result = await parseIcsBounded('ics', OPTIONS, spawn, 1_000);
    expect(result).toEqual({ ok: true, events: [{ id: 'a' }] });
    expect(workers[0]?.terminated).toBe(0);
  });

  it('fails and terminates the worker when it never answers', async () => {
    // The hang this exists for: ical.js looping inside one iterator step.
    const { spawn, workers } = fakeFactory();
    const result = await parseIcsBounded('ics', OPTIONS, spawn, 20);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/too long/i);
    expect(workers[0]?.terminated).toBe(1);
  });

  it('ignores a late answer after the timeout', async () => {
    const { spawn, workers } = fakeFactory();
    const result = await parseIcsBounded('ics', OPTIONS, spawn, 10);
    workers[0]?.emit('message', [{ id: 'late' }]);
    expect(result.ok).toBe(false);
  });

  it('fails when the worker crashes', async () => {
    const { spawn, workers } = fakeFactory((w) => w.emit('error', new Error('boom')));
    const result = await parseIcsBounded('ics', OPTIONS, spawn, 1_000);
    expect(result.ok).toBe(false);
    expect(workers[0]?.terminated).toBe(1);
  });

  it('fails when the worker exits without answering', async () => {
    const { spawn } = fakeFactory((w) => w.emit('exit', 0));
    expect((await parseIcsBounded('ics', OPTIONS, spawn, 1_000)).ok).toBe(false);
  });

  it('fails on an answer that is not an event list', async () => {
    const { spawn } = fakeFactory((w) => w.emit('message', 'nonsense'));
    expect((await parseIcsBounded('ics', OPTIONS, spawn, 1_000)).ok).toBe(false);
  });

  it('fails rather than throws when the worker cannot start', async () => {
    const spawn: IcsWorkerFactory = () => {
      throw new Error('no such file');
    };
    expect((await parseIcsBounded('ics', OPTIONS, spawn, 1_000)).ok).toBe(false);
  });

  it('really stops a thread stuck in a synchronous loop', async () => {
    // The fakes prove the bookkeeping; this proves terminate() reclaims a
    // thread that never yields, which is what a hung ical.js iterator is.
    let worker: Worker | undefined;
    const spawn: IcsWorkerFactory = () => {
      worker = new Worker('for (;;) {}', { eval: true });
      return worker;
    };
    const exited = new Promise<void>((resolve) => {
      queueMicrotask(() => worker?.once('exit', () => resolve()));
    });

    const result = await parseIcsBounded('ics', OPTIONS, spawn, 200);
    expect(result.ok).toBe(false);
    await exited;
  });
});
