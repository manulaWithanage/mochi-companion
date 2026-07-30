/**
 * Owns the user's brain: the graph in memory, an encrypted file on disk.
 *
 * **In memory, not read per query.** Law 3 promises sub-millisecond graph
 * lookups, and that is only true of a cached graph — parsing a multi-megabyte
 * JSON file is tens of milliseconds, and the graph is expected to grow. The file
 * is durability, never the read path.
 *
 * **Encrypted with safeStorage, like the API keys.** A record of when someone
 * works, what they use and how they write is at least as sensitive as a
 * revocable API key. Storing keys encrypted and behavioural history in
 * plaintext beside them would be inconsistent.
 *
 * Main process only. The renderer sees beliefs described in words, never the
 * file (RULE 1).
 */

import { app, safeStorage } from 'electron';
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  assembleContext,
  buildWorkProfile,
  confidenceOf,
  correct,
  describeConfidence,
  describeProvenance,
  emptyGraph,
  isSpent,
  observe,
  parseGraph,
  suppress,
  upsertNode,
  type BrainGraph,
  type ContextPackage,
  type Observation,
  type WorkProfile,
} from '@mochi/core';
import type { StorageAdapter } from '@mochi/core';

/** How often to flush a dirty graph. Batched: writes are cheap but not free. */
const FLUSH_DEBOUNCE_MS = 4000;

export interface BeliefView {
  readonly from: string;
  readonly to: string;
  readonly relation: string;
  /** Words, never a decimal — the Memory tab is for humans. */
  readonly strength: string;
  readonly source: string;
  readonly usable: boolean;
  readonly observations: number;
}

export class BrainService {
  private graph: BrainGraph = emptyGraph;
  private profile: WorkProfile | null = null;
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly filePath: string;

  constructor(
    private readonly storage: StorageAdapter,
    filePath?: string,
  ) {
    this.filePath = filePath ?? join(app.getPath('userData'), 'brain', 'brain.json');
    this.load();
  }

  private load(): void {
    try {
      const raw = readFileSync(this.filePath);
      if (!safeStorage.isEncryptionAvailable()) {
        console.warn('[brain] encrypted storage unavailable; private memory will stay in RAM');
        this.graph = emptyGraph;
        return;
      }

      let text: string;
      let legacyPlaintext = false;
      try {
        text = safeStorage.decryptString(raw);
      } catch {
        // Older builds could write plain JSON. Accept that exact legacy shape
        // once, then immediately replace it with an encrypted file. Arbitrary
        // undecryptable bytes are never interpreted as user data.
        text = raw.toString('utf8');
        if (!text.trimStart().startsWith('{')) throw new Error('Unrecognised brain envelope');
        legacyPlaintext = true;
      }
      this.graph = parseGraph(JSON.parse(text));
      if (legacyPlaintext) {
        this.flush();
        console.log('[brain] migrated legacy plaintext memory to protected storage');
      }
      console.log(
        `[brain] loaded ${this.graph.nodes.length} nodes, ${this.graph.edges.length} edges`,
      );
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        // Never fatal. A corrupt brain is a lost profile, not a broken app.
        console.warn('[brain] unreadable, starting fresh');
      }
      this.graph = emptyGraph;
    }
  }

  private scheduleFlush(): void {
    if (this.flushTimer !== null) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, FLUSH_DEBOUNCE_MS);
  }

  /** Write now. Called on the debounce and before quit. */
  flush(): void {
    try {
      if (!safeStorage.isEncryptionAvailable()) {
        console.warn('[brain] encrypted storage unavailable; refusing plaintext persistence');
        return;
      }
      if (this.graph.nodes.length === 0 && this.graph.edges.length === 0) {
        if (existsSync(this.filePath)) rmSync(this.filePath, { force: true });
        return;
      }
      mkdirSync(dirname(this.filePath), { recursive: true });
      const text = JSON.stringify(this.graph);
      const payload = safeStorage.encryptString(text);

      // Temp-then-rename: a crash mid-write must not leave a truncated brain.
      const tmp = `${this.filePath}.tmp`;
      writeFileSync(tmp, payload);
      renameSync(tmp, this.filePath);
    } catch (error) {
      console.error('[brain] failed to persist:', error);
    }
  }

  /**
   * Recompute the Tier 0 profile from the session history.
   *
   * Deterministic and cheap, so it is recomputed rather than cached to disk —
   * a stored statistic can disagree with the sessions it came from, and then
   * there is no way to tell which is wrong.
   */
  async refreshProfile(now: Date = new Date()): Promise<WorkProfile> {
    const sessions = await this.storage.listSessions();
    this.profile = buildWorkProfile(sessions, now);
    return this.profile;
  }

  /** Record an observation. Nodes are created on demand. */
  record(observation: Observation, labels?: Readonly<Record<string, string>>): void {
    for (const id of [observation.from, observation.to]) {
      this.graph = upsertNode(this.graph, {
        id,
        type: 'habit',
        ...(labels?.[id] !== undefined ? { label: labels[id]! } : {}),
      });
    }
    this.graph = observe(this.graph, observation);
    this.scheduleFlush();
  }

  /** The context package for an Executive Brain call. */
  async contextFor(focus: readonly string[] = [], now: Date = new Date()): Promise<ContextPackage> {
    const profile = this.profile ?? (await this.refreshProfile(now));
    return assembleContext({ graph: this.graph, profile, now: now.getTime(), focus });
  }

  /** Everything Mochi believes, in words, for the Memory tab. */
  beliefs(now: Date = new Date()): readonly BeliefView[] {
    const at = now.getTime();
    return this.graph.edges.map((edge) => {
      const value = confidenceOf(edge, { now: at });
      return {
        from: edge.from,
        to: edge.to,
        relation: edge.relation,
        strength: describeConfidence(value),
        source: describeProvenance(edge.provenance),
        usable: value >= 0.5,
        observations: edge.confirms.length + edge.contradicts.length,
      };
    });
  }

  /**
   * The user corrected something. Highest-quality signal available, so it
   * clears the accumulated machine evidence rather than adding one vote to it.
   */
  applyCorrection(observation: Observation): void {
    this.graph = correct(this.graph, observation);
    this.scheduleFlush();
  }

  /** The user deleted a belief. Stays suppressed so it is not relearned. */
  forget(spec: { from: string; to: string; relation: string }): void {
    this.graph = suppress(this.graph, spec);
    this.scheduleFlush();
  }

  /**
   * Drop edges whose evidence has decayed to nothing.
   *
   * Being near the prior is the test, not being old — an edge confirmed a
   * hundred times last year still says something.
   */
  compact(now: Date = new Date()): number {
    const before = this.graph.edges.length;
    const kept = this.graph.edges.filter((e) => !isSpent(e, { now: now.getTime() }));
    if (kept.length === before) return 0;
    this.graph = { ...this.graph, edges: kept };
    this.scheduleFlush();
    return before - kept.length;
  }

  dispose(): void {
    if (this.flushTimer !== null) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    this.flush();
  }
}
