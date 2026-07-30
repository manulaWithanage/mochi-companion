/**
 * MNMA Law 3 — the bounded handoff contract.
 *
 * The Executive Brain is never asked to learn the user from scratch. It gets a
 * pre-assembled summary, highest-value facts first, under a hard ceiling.
 *
 * The ceiling is the whole point. A profile that costs 100 tokens today grows
 * quietly to 400 as it gets richer, and nobody notices until a bill or a
 * context-window error. Enforced here at assembly time, it cannot drift.
 *
 * Pure. Takes a graph, a profile and a clock; returns a string.
 */

import { confidenceOf, isUsable, type Cadence } from './confidence.js';
import type { BrainEdge, BrainGraph } from './graph.js';
import { findNode } from './graph.js';
import { hourLabel, type WorkProfile } from './stats.js';

/**
 * Hard ceiling, in tokens. Tunable, never exceeded at runtime.
 *
 * 120 rather than the 100 the blueprint quoted: the deterministic profile alone
 * is worth about 45, and leaving only 55 for everything learned made the graph
 * almost unrepresentable. The number matters far less than the fact that it is
 * enforced.
 */
export const CONTEXT_TOKEN_CEILING = 120;

/**
 * Token estimate without a tokenizer.
 *
 * ~4 characters per token is the usual English approximation. It is an estimate,
 * so the ceiling is enforced with a margin rather than to the token — the goal
 * is preventing unbounded growth, not exact accounting.
 */
export function estimateTokens(text: string): number {
  if (text.length === 0) return 0;
  return Math.ceil(text.length / 4);
}

export interface ContextRequest {
  readonly graph: BrainGraph;
  readonly profile: WorkProfile;
  readonly now: number;
  /**
   * Node ids relevant to the task at hand, most relevant first. An email draft
   * passes the contact and the writing-style node; a week plan passes projects.
   */
  readonly focus?: readonly string[];
  readonly cadence?: Cadence;
  readonly ceiling?: number;
}

export interface ContextPackage {
  /** Ready to use as a system prompt fragment. Empty when nothing is known. */
  readonly text: string;
  readonly tokens: number;
  /** Facts left out because the budget ran out — surfaced, not hidden. */
  readonly dropped: number;
  /** True while there is too little data to describe the user at all. */
  readonly coldStart: boolean;
}

interface Fact {
  readonly text: string;
  /** Higher wins a place in the budget. */
  readonly priority: number;
}

/**
 * The measured profile, phrased compactly.
 *
 * First in the budget because it is exact. Everything here came from
 * arithmetic, so it is the least likely part of the package to be wrong.
 */
function profileFacts(profile: WorkProfile): readonly Fact[] {
  const facts: Fact[] = [];
  if (!profile.ready) return facts;

  if (profile.peak !== null && profile.peak.share >= 0.25) {
    facts.push({
      text: `peaks ${hourLabel(profile.peak.startHour)}-${hourLabel(profile.peak.endHour)}`,
      priority: 100,
    });
  }
  if (profile.typicalSessionMs !== null) {
    facts.push({
      text: `works in ${Math.round(profile.typicalSessionMs / 60_000)}m blocks`,
      priority: 95,
    });
  }
  if (profile.sustainedCeilingMs !== null) {
    facts.push({
      text: `rarely past ${Math.round(profile.sustainedCeilingMs / 60_000)}m`,
      priority: 70,
    });
  }
  if (profile.deepWorkRatio !== null && profile.deepWorkRatio >= 0.5) {
    facts.push({
      text: `${Math.round(profile.deepWorkRatio * 100)}% deep work`,
      priority: 60,
    });
  }
  if (profile.streakDays >= 3) {
    facts.push({ text: `${profile.streakDays}-day streak`, priority: 40 });
  }
  return facts;
}

/**
 * Rank a learned edge.
 *
 * Confidence dominates, focus relevance is a large bonus, and recency breaks
 * ties. Style edges are lifted because "sounds like me" is the single most
 * visible thing the Executive Brain does — getting the tone wrong is noticed
 * immediately, while a missing streak count is not.
 */
function edgePriority(
  edge: BrainEdge,
  graph: BrainGraph,
  focus: readonly string[],
  now: number,
  cadence: Cadence,
): number {
  const confidence = confidenceOf(edge, { now, cadence });
  const focused = focus.includes(edge.from) || focus.includes(edge.to);
  const fromNode = findNode(graph, edge.from);
  const isStyle = fromNode?.type === 'style' || findNode(graph, edge.to)?.type === 'style';

  const newest = Math.max(0, ...edge.confirms);
  const ageDays = newest === 0 ? 999 : (now - newest) / 86_400_000;
  const recency = Math.max(0, 10 - ageDays / 3);

  return confidence * 50 + (focused ? 30 : 0) + (isStyle ? 15 : 0) + recency;
}

function edgeText(edge: BrainEdge, graph: BrainGraph): string {
  const label = (id: string): string => findNode(graph, id)?.label ?? id;
  return `${label(edge.from)} ${edge.relation.replace(/_/g, ' ')} ${label(edge.to)}`;
}

/**
 * Assemble the package.
 *
 * Facts are ranked, then added while the budget allows. Anything that does not
 * fit is counted rather than silently discarded, so a persistently high
 * `dropped` is a signal that the ceiling needs revisiting — the failure mode
 * this law exists to prevent.
 */
export function assembleContext(request: ContextRequest): ContextPackage {
  const { graph, profile, now } = request;
  const focus = request.focus ?? [];
  const cadence = request.cadence ?? 'daily';
  const ceiling = request.ceiling ?? CONTEXT_TOKEN_CEILING;

  const learned = graph.edges
    .filter((e) => e.suppressed !== true)
    // The quarantine: an unconfirmed guess never reaches the Executive Brain,
    // however relevant it looks.
    .filter((e) => isUsable(e, { now, cadence }))
    .map((e) => ({
      text: edgeText(e, graph),
      priority: edgePriority(e, graph, focus, now, cadence),
    }));

  const ranked = [...profileFacts(profile), ...learned].sort((a, b) => b.priority - a.priority);

  if (ranked.length === 0) {
    return { text: '', tokens: 0, dropped: 0, coldStart: true };
  }

  const chosen: string[] = [];
  let dropped = 0;
  const prefix = 'User: ';

  for (const fact of ranked) {
    const candidate = `${prefix}${[...chosen, fact.text].join('; ')}.`;
    if (estimateTokens(candidate) > ceiling) {
      dropped += 1;
      continue;
    }
    chosen.push(fact.text);
  }

  const text = chosen.length === 0 ? '' : `${prefix}${chosen.join('; ')}.`;
  return {
    text,
    tokens: estimateTokens(text),
    dropped,
    coldStart: !profile.ready && learned.length === 0,
  };
}
