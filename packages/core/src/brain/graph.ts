/**
 * MNMA Law 1 — typed weighted graph storage.
 *
 * Behavioural knowledge is stored as typed nodes and edges, never as prose, so
 * TypeScript can rank relevance without any model involvement.
 *
 * **What is deliberately not stored: confidence.** It is derived from the
 * evidence counts and the clock (see confidence.ts). Storing it as a field
 * would let it drift out of sync with the evidence it is supposed to summarise,
 * and there would be no way to tell which one was wrong.
 *
 * Pure logic. No fs, no clock of its own — every function that needs "now"
 * takes it as an argument, so the whole model is testable without mocking time
 * (RULE 2).
 */

export type NodeType =
  'app' | 'time_window' | 'habit' | 'style' | 'routine' | 'contact' | 'project';

/**
 * Where a belief came from. This decides which rules apply to it, and it is the
 * field that resolves the cold-start problem.
 *
 * The original design gave onboarding answers a low confidence and then
 * excluded everything below a floor — which silently discarded the entire
 * onboarding questionnaire. Provenance separates "we are unsure" from "a model
 * guessed this", which are not the same thing.
 */
export type Provenance =
  /** The user told us. Trusted immediately; only observation overrides it. */
  | 'declared'
  /** Tier 0 arithmetic. Exact by construction, so also trusted immediately. */
  | 'computed'
  /** A small model's judgement. Must earn its way past the usability floor. */
  | 'inferred';

export interface BrainNode {
  readonly id: string;
  readonly type: NodeType;
  /** Free-form grouping, e.g. 'deep_work'. Never shown to a model verbatim. */
  readonly category?: string;
  /** Short human-readable form, for the Memory tab. */
  readonly label?: string;
}

export interface BrainEdge {
  readonly from: string;
  readonly to: string;
  readonly relation: string;
  readonly provenance: Provenance;
  /**
   * Observation timestamps, newest last. Kept rather than a bare count because
   * recency weighting needs to know *when*, not just how many — an edge with
   * twenty confirmations from last year should not outrank one with three from
   * this week.
   */
  readonly confirms: readonly number[];
  readonly contradicts: readonly number[];
  /**
   * Set when the user deletes a belief, so the same wrong inference cannot be
   * silently relearned next week.
   */
  readonly suppressed?: boolean;
}

export interface BrainGraph {
  readonly nodes: readonly BrainNode[];
  readonly edges: readonly BrainEdge[];
  /** Schema version, so a future migration can recognise old files. */
  readonly version: number;
}

export const BRAIN_SCHEMA_VERSION = 1;

export const emptyGraph: BrainGraph = { nodes: [], edges: [], version: BRAIN_SCHEMA_VERSION };

/** Stable identity for an edge: one relation between one pair of nodes. */
export const edgeKey = (e: Pick<BrainEdge, 'from' | 'to' | 'relation'>): string =>
  `${e.from}|${e.relation}|${e.to}`;

export function findNode(graph: BrainGraph, id: string): BrainNode | undefined {
  return graph.nodes.find((n) => n.id === id);
}

export function findEdge(
  graph: BrainGraph,
  spec: Pick<BrainEdge, 'from' | 'to' | 'relation'>,
): BrainEdge | undefined {
  const key = edgeKey(spec);
  return graph.edges.find((e) => edgeKey(e) === key);
}

export function upsertNode(graph: BrainGraph, node: BrainNode): BrainGraph {
  const existing = findNode(graph, node.id);
  if (existing === undefined) return { ...graph, nodes: [...graph.nodes, node] };
  return {
    ...graph,
    nodes: graph.nodes.map((n) => (n.id === node.id ? { ...n, ...node } : n)),
  };
}

export interface Observation {
  readonly from: string;
  readonly to: string;
  readonly relation: string;
  readonly provenance: Provenance;
  readonly at: number;
  /** False records a contradiction — the opposite of what we believed. */
  readonly agrees?: boolean;
}

/**
 * Record one observation against an edge, creating it if new.
 *
 * A single entry point for every write, so there is exactly one place where
 * evidence enters the graph. The previous design had reinforcement, decay and
 * contradiction as three separate mechanisms that each had to agree with the
 * others; here contradiction is just an observation with `agrees: false`.
 */
export function observe(graph: BrainGraph, observation: Observation): BrainGraph {
  const { from, to, relation, provenance, at } = observation;
  const agrees = observation.agrees !== false;
  const existing = findEdge(graph, { from, to, relation });

  if (existing === undefined) {
    const edge: BrainEdge = {
      from,
      to,
      relation,
      provenance,
      confirms: agrees ? [at] : [],
      contradicts: agrees ? [] : [at],
    };
    return { ...graph, edges: [...graph.edges, edge] };
  }

  const key = edgeKey(existing);
  return {
    ...graph,
    edges: graph.edges.map((e) => {
      if (edgeKey(e) !== key) return e;
      return {
        ...e,
        // A declared or computed observation upgrades an inferred edge: once
        // the user has confirmed something, it stops being a guess.
        provenance: rank(provenance) > rank(e.provenance) ? provenance : e.provenance,
        confirms: agrees ? [...e.confirms, at] : e.confirms,
        contradicts: agrees ? e.contradicts : [...e.contradicts, at],
      };
    }),
  };
}

const rank = (p: Provenance): number => (p === 'declared' ? 2 : p === 'computed' ? 1 : 0);

/**
 * Apply a user correction from the Memory tab.
 *
 * Clears accumulated inferred evidence rather than adding to it. A correction
 * is the highest-quality signal available, and making the user out-vote twenty
 * stale machine observations one click at a time would be absurd.
 */
export function correct(graph: BrainGraph, spec: Observation): BrainGraph {
  const key = edgeKey(spec);
  const cleared: BrainGraph = {
    ...graph,
    edges: graph.edges.map((e) =>
      edgeKey(e) === key ? { ...e, confirms: [], contradicts: [] } : e,
    ),
  };
  return observe(cleared, { ...spec, provenance: 'declared' });
}

/** Mark a belief as wrong and keep it marked, so it is not relearned. */
export function suppress(
  graph: BrainGraph,
  spec: Pick<BrainEdge, 'from' | 'to' | 'relation'>,
): BrainGraph {
  const key = edgeKey(spec);
  return {
    ...graph,
    edges: graph.edges.map((e) => (edgeKey(e) === key ? { ...e, suppressed: true } : e)),
  };
}

/** Every edge touching a node, in either direction. */
export function edgesFor(graph: BrainGraph, nodeId: string): readonly BrainEdge[] {
  return graph.edges.filter((e) => e.from === nodeId || e.to === nodeId);
}

/**
 * Narrow an untrusted parsed file into a graph.
 *
 * The brain file is on disk and may be hand-edited or corrupted; a bad one must
 * not stop Mochi from starting. Anything unrecognised is dropped rather than
 * repaired, because a half-understood belief is worse than a missing one.
 */
export function parseGraph(raw: unknown): BrainGraph {
  if (typeof raw !== 'object' || raw === null) return emptyGraph;
  const obj = raw as Record<string, unknown>;

  const nodes = asArray(obj['nodes']).flatMap((n): BrainNode[] => {
    if (typeof n !== 'object' || n === null) return [];
    const o = n as Record<string, unknown>;
    const id = str(o['id']);
    const type = str(o['type']);
    if (id === null || type === null || !isNodeType(type)) return [];
    return [
      {
        id,
        type,
        ...(str(o['category']) !== null ? { category: str(o['category'])! } : {}),
        ...(str(o['label']) !== null ? { label: str(o['label'])! } : {}),
      },
    ];
  });

  const known = new Set(nodes.map((n) => n.id));

  const edges = asArray(obj['edges']).flatMap((e): BrainEdge[] => {
    if (typeof e !== 'object' || e === null) return [];
    const o = e as Record<string, unknown>;
    const from = str(o['from']);
    const to = str(o['to']);
    const relation = str(o['relation']);
    const provenance = str(o['provenance']);
    if (from === null || to === null || relation === null) return [];
    // Dangling edges would rank into a context package naming a node that does
    // not exist, producing a prompt fragment referring to nothing.
    if (!known.has(from) || !known.has(to)) return [];
    return [
      {
        from,
        to,
        relation,
        provenance: isProvenance(provenance) ? provenance : 'inferred',
        confirms: stamps(o['confirms']),
        contradicts: stamps(o['contradicts']),
        ...(o['suppressed'] === true ? { suppressed: true } : {}),
      },
    ];
  });

  return { nodes, edges, version: BRAIN_SCHEMA_VERSION };
}

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const stamps = (v: unknown): readonly number[] =>
  asArray(v).filter((n): n is number => typeof n === 'number' && Number.isFinite(n));

const NODE_TYPES: readonly string[] = [
  'app',
  'time_window',
  'habit',
  'style',
  'routine',
  'contact',
  'project',
];
const isNodeType = (v: string): v is NodeType => NODE_TYPES.includes(v);
const isProvenance = (v: string | null): v is Provenance =>
  v === 'declared' || v === 'computed' || v === 'inferred';
