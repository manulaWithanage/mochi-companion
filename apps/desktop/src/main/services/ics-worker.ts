/**
 * Worker-thread entry for ICS parsing.
 *
 * Bundled as its own file by electron-vite (index.ts imports it with the
 * `?modulePath` suffix) and run by ics-bounded.ts, which terminates it if it
 * does not answer in time. Deliberately nothing but a call to the pure parser:
 * any logic here would be logic the tests cannot reach.
 */

import { parentPort, workerData } from 'node:worker_threads';
import { parseIcs } from './ics.js';
import type { IcsWorkerInput } from './ics-bounded.js';

const { text, options } = workerData as IcsWorkerInput;
parentPort?.postMessage(parseIcs(text, options));
