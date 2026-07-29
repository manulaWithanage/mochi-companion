/**
 * Provider detection and model discovery.
 *
 * The important part is the Ollama probe: if something answers on
 * 127.0.0.1:11434, every AI feature works with **no key and no account**.
 * That is the strongest onboarding moment in the product, and it costs a
 * single HTTP request.
 *
 * All network calls and all key handling live here, in main. Keys never
 * reach the renderer (RULE 1) — the renderer sees redacted strings and model
 * ids, never the secret itself.
 */

import {
  OLLAMA_DEFAULT_HOST,
  PROVIDERS,
  detectProvider,
  looksLikeKey,
  parseModelList,
  redactKey,
  type DiscoveredModel,
  type ProviderId,
} from '@mochi/core';

/** Local probe: fast, because a slow one delays first paint for everyone. */
const OLLAMA_TIMEOUT_MS = 1500;
/** Remote calls: slower networks are real, but nobody waits forever. */
const REMOTE_TIMEOUT_MS = 10_000;

export interface ProbeResult {
  readonly available: boolean;
  readonly models: readonly DiscoveredModel[];
  readonly error?: string;
}

async function fetchJson(url: string, init: RequestInit, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Is Ollama running locally, and what does it have?
 *
 * Never throws. A machine without Ollama is the common case, not an error —
 * this returns `available: false` and Mochi carries on asking for a key.
 */
export async function probeOllama(host: string = OLLAMA_DEFAULT_HOST): Promise<ProbeResult> {
  try {
    const payload = await fetchJson(`${host}/api/tags`, {}, OLLAMA_TIMEOUT_MS);
    const models = parseModelList('ollama', payload);
    return { available: true, models };
  } catch (error) {
    return {
      available: false,
      models: [],
      error: error instanceof Error ? error.message : 'unreachable',
    };
  }
}

/** Auth header shape differs per provider; the key never leaves this function. */
function authHeaders(provider: ProviderId, key: string): Record<string, string> {
  switch (provider) {
    case 'anthropic':
      return { 'x-api-key': key, 'anthropic-version': '2023-06-01' };
    case 'google':
      return { 'x-goog-api-key': key };
    case 'openai':
      return { Authorization: `Bearer ${key}` };
    case 'ollama':
      return {};
  }
}

export interface KeyValidation {
  readonly ok: boolean;
  readonly provider: ProviderId | null;
  /** Safe to show and log. The raw key is never returned. */
  readonly redacted: string;
  readonly models: readonly DiscoveredModel[];
  readonly error?: string;
}

/**
 * Validate a pasted key by actually using it.
 *
 * Detecting the provider from the prefix is a guess; fetching the model list
 * proves the key works *and* populates the picker in one round trip. A key
 * accepted without a live call fails later, somewhere less obvious.
 */
export async function validateKey(rawKey: string): Promise<KeyValidation> {
  const key = rawKey.trim();
  const provider = detectProvider(key);
  const redacted = redactKey(key);

  if (provider === null || !looksLikeKey(key)) {
    return {
      ok: false,
      provider,
      redacted,
      models: [],
      error: "That doesn't look like an OpenAI, Anthropic or Google key.",
    };
  }

  try {
    const payload = await fetchJson(
      PROVIDERS[provider].modelsUrl,
      { headers: authHeaders(provider, key) },
      REMOTE_TIMEOUT_MS,
    );
    const models = parseModelList(provider, payload);
    if (models.length === 0) {
      return {
        ok: false,
        provider,
        redacted,
        models: [],
        error: 'The key worked but returned no models.',
      };
    }
    return { ok: true, provider, redacted, models };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      provider,
      redacted,
      models: [],
      // Never echo the key back, even in an error.
      error: message.includes('401') || message.includes('403') ? 'Key rejected.' : message,
    };
  }
}

export interface ProviderStatus {
  readonly ollama: ProbeResult;
  /** Providers the user has stored a working key for. */
  readonly configured: readonly ProviderId[];
  /** True when Mochi can do AI right now, whatever the reason. */
  readonly ready: boolean;
}

export class ProviderService {
  private ollamaResult: ProbeResult = { available: false, models: [] };
  private readonly configured = new Set<ProviderId>();

  /**
   * Probe on launch. Deliberately fire-and-forget with a short timeout: the
   * mascot must not wait on a network call to appear.
   */
  async probe(host?: string): Promise<ProbeResult> {
    this.ollamaResult = await probeOllama(host);
    if (this.ollamaResult.available) {
      this.configured.add('ollama');
      console.log(
        `[llm] Ollama detected — ${this.ollamaResult.models.length} model(s), zero-key mode available`,
      );
    }
    return this.ollamaResult;
  }

  markConfigured(provider: ProviderId): void {
    this.configured.add(provider);
  }

  forget(provider: ProviderId): void {
    this.configured.delete(provider);
  }

  get status(): ProviderStatus {
    return {
      ollama: this.ollamaResult,
      configured: [...this.configured],
      ready: this.configured.size > 0,
    };
  }

  /** Every model Mochi can currently reach. */
  get localModels(): readonly DiscoveredModel[] {
    return this.ollamaResult.models;
  }
}
