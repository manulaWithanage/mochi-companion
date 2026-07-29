/**
 * Provider identification, model discovery endpoints, and capability tiers.
 *
 * **No model ID is ever written down here.** Every hardcoded model list is
 * stale within a quarter, so the provider is detected from the key prefix and
 * the model list is fetched live at runtime. The user's choice is stored as a
 * plain string.
 *
 * Pure logic: this module knows *where* to ask and *how to read the answer*.
 * It performs no network calls — apps/desktop does that (RULE 2).
 */

export type ProviderId = 'openai' | 'anthropic' | 'google' | 'ollama' | 'azure';

/**
 * What a task needs from a model.
 *
 * Tiers exist because local models are unreliable at tool calling. Tagging
 * each feature lets Mochi degrade *visibly* — "this needs tool calling, your
 * model doesn't support it" — rather than failing in a way that reads as the
 * app being broken.
 */
export type Capability = 'text' | 'tools' | 'vision';

export interface ProviderInfo {
  readonly id: ProviderId;
  readonly label: string;
  /** Endpoint returning the provider's current model list. */
  readonly modelsUrl: string;
  /** True when no API key is involved — the zero-key path. */
  readonly local: boolean;
}

export const OLLAMA_DEFAULT_HOST = 'http://127.0.0.1:11434';

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  openai: {
    id: 'openai',
    label: 'OpenAI',
    modelsUrl: 'https://api.openai.com/v1/models',
    local: false,
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    modelsUrl: 'https://api.anthropic.com/v1/models',
    local: false,
  },
  google: {
    id: 'google',
    label: 'Google Gemini',
    modelsUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    local: false,
  },
  ollama: {
    id: 'ollama',
    label: 'Ollama',
    modelsUrl: `${OLLAMA_DEFAULT_HOST}/api/tags`,
    local: true,
  },
  azure: {
    id: 'azure',
    label: 'Azure OpenAI',
    // modelsUrl is dynamic — built from the user's resource name at runtime.
    modelsUrl: '',
    local: false,
  },
};

/**
 * Identify a provider from the shape of its key.
 *
 * Order matters: `sk-ant-` must be tested before `sk-`, or every Anthropic
 * key is misread as OpenAI.
 */
export function detectProvider(rawKey: string): ProviderId | null {
  const key = rawKey.trim();
  if (key.length === 0) return null;
  if (key.startsWith('sk-ant-')) return 'anthropic';
  if (key.startsWith('AIza')) return 'google';
  if (key.startsWith('sk-')) return 'openai';
  // Azure OpenAI keys are 32-char hex strings (with or without dashes)
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) return 'azure';
  if (/^[0-9a-f]{32}$/i.test(key)) return 'azure';
  return null;
}

/** Obvious malformations, caught before a pointless network round trip. */
export function looksLikeKey(rawKey: string): boolean {
  const key = rawKey.trim();
  return key.length >= 20 && !/\s/.test(key) && detectProvider(key) !== null;
}

/**
 * Redact a key for display and logging.
 *
 * Keys must never appear in logs (RULE 1). Showing the last four characters
 * lets a user confirm *which* key is stored without exposing it.
 */
export function redactKey(rawKey: string): string {
  const key = rawKey.trim();
  if (key.length <= 8) return '••••';
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

/**
 * Below this many billion parameters, local models hallucinate tool
 * arguments often enough to be unusable for it. A judgement call, and the
 * conservative direction — an over-cautious warning beats a silent failure.
 */
export const MIN_TOOL_PARAMS_B = 7;

/**
 * Billions of parameters from an Ollama tag (`qwen2.5:14b` → 14), if stated.
 *
 * Not anchored to the `:` because mixture-of-experts tags look like
 * `mixtral:8x7b`, where the size sits after an `x`. Reading the last number
 * before the `b` gives the per-expert size — the conservative reading, which
 * is the right direction for a capability guess.
 */
export function parameterCount(modelId: string): number | null {
  const match = /(\d+(?:\.\d+)?)b\b/.exec(modelId.toLowerCase());
  if (match === null) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

export interface DiscoveredModel {
  readonly id: string;
  readonly provider: ProviderId;
  readonly capabilities: readonly Capability[];
}

/**
 * Infer capabilities from a model id.
 *
 * A heuristic, deliberately conservative: no provider exposes a machine-
 * readable capability list, and guessing *too capable* produces silent
 * failures at call time. Guessing too low only shows an over-cautious
 * warning, which is the cheaper mistake.
 */
export function inferCapabilities(provider: ProviderId, modelId: string): readonly Capability[] {
  const id = modelId.toLowerCase();
  const caps: Capability[] = ['text'];

  if (provider === 'ollama') {
    // Tool calling needs both a family known to handle it AND enough
    // parameters. `llama3.2:3b` is the right family and still hallucinates
    // tool arguments — size is the part that actually decides it.
    const family = /llama3\.[1-9]|qwen|mistral-nemo|firefunction|command-r/.test(id);
    const params = parameterCount(id);
    const bigEnough = params === null || params >= MIN_TOOL_PARAMS_B;
    if (family && bigEnough) caps.push('tools');
    if (/llava|bakllava|moondream|vision|-vl/.test(id)) caps.push('vision');
    return caps;
  }

  // Hosted frontier models handle tools; small/embedding variants do not.
  if (!/embed|whisper|tts|moderation|guard/.test(id)) caps.push('tools');
  if (!/embed|whisper|tts|moderation|guard|instruct-only/.test(id)) caps.push('vision');
  return caps;
}

/** Whether a model satisfies everything a task requires. */
export function supports(model: DiscoveredModel, required: readonly Capability[]): boolean {
  return required.every((c) => model.capabilities.includes(c));
}

/**
 * Explain a mismatch in terms a user can act on.
 *
 * Returns null when the model is fine, so callers read as
 * `const problem = explainMismatch(...)`.
 */
export function explainMismatch(
  model: DiscoveredModel,
  required: readonly Capability[],
  taskLabel: string,
): string | null {
  const missing = required.filter((c) => !model.capabilities.includes(c));
  if (missing.length === 0) return null;

  const names: Record<Capability, string> = {
    text: 'text generation',
    tools: 'tool calling',
    vision: 'image understanding',
  };
  const list = missing.map((c) => names[c]).join(' and ');
  return `${taskLabel} needs ${list}, which ${model.id} does not reliably support. Pick a different model.`;
}

/** Parse a provider's model-list response into a normalized shape. */
export function parseModelList(provider: ProviderId, payload: unknown): readonly DiscoveredModel[] {
  const ids = extractIds(provider, payload);
  return ids
    .filter((id) => id.length > 0)
    .map((id) => ({ id, provider, capabilities: inferCapabilities(provider, id) }));
}

function extractIds(provider: ProviderId, payload: unknown): string[] {
  if (typeof payload !== 'object' || payload === null) return [];
  const obj = payload as Record<string, unknown>;

  // Ollama: { models: [{ name: 'llama3.2:3b' }] }
  if (provider === 'ollama') {
    return asArray(obj['models'])
      .map((m) => readString(m, 'name') ?? readString(m, 'model'))
      .filter((v): v is string => v !== null);
  }

  // Google: { models: [{ name: 'models/gemini-...' }] }
  if (provider === 'google') {
    return asArray(obj['models'])
      .map((m) => readString(m, 'name'))
      .filter((v): v is string => v !== null)
      .map((n) => (n.startsWith('models/') ? n.slice('models/'.length) : n));
  }

  // OpenAI and Anthropic: { data: [{ id: '...' }] }
  return asArray(obj['data'])
    .map((m) => readString(m, 'id'))
    .filter((v): v is string => v !== null);
}

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

function readString(item: unknown, key: string): string | null {
  if (typeof item !== 'object' || item === null) return null;
  const value = (item as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : null;
}
