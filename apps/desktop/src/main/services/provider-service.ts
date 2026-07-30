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
  AZURE_API_VERSION,
  OLLAMA_DEFAULT_HOST,
  PROVIDERS,
  azureChatUrl,
  cleanAzureResourceName,
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
    case 'azure':
      return { 'api-key': key };
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
      error: "That doesn't look like an OpenAI, Anthropic, Google or Azure OpenAI key.",
    };
  }

  // Azure needs resource + deployment context — validated separately via validateAzureKey
  if (provider === 'azure') {
    return {
      ok: false,
      provider: 'azure',
      redacted,
      models: [],
      error: 'Azure OpenAI keys must be added via the Azure section with resource name and deployment.',
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
      error: message.includes('401') || message.includes('403') ? 'Key rejected.' : message,
    };
  }
}

/**
 * Validate Azure OpenAI credentials by making a real call.
 *
 * Azure exposes no usable model-list endpoint — listing deployments needs ARM
 * management credentials, not the data-plane key — so the deployment itself is
 * the probe. The URL comes from `azureChatUrl` rather than being assembled
 * here, so that this proves the exact endpoint generation will later use.
 */
export async function validateAzureKey(opts: {
  resourceName: string;
  deploymentName: string;
  apiKey: string;
  apiVersion?: string;
}): Promise<KeyValidation> {
  const { resourceName, deploymentName, apiKey, apiVersion = AZURE_API_VERSION } = opts;
  const resource = cleanAzureResourceName(resourceName);
  const deployment = deploymentName.trim();
  const redacted = redactKey(apiKey);

  if (resource.length === 0 || deployment.length === 0 || apiKey.length === 0) {
    return {
      ok: false,
      provider: 'azure',
      redacted,
      models: [],
      error: 'Resource name, deployment name and API key are all required.',
    };
  }

  const model: DiscoveredModel = {
    id: deployment,
    provider: 'azure',
    capabilities: ['text', 'tools'],
  };

  const fail = (error: string): KeyValidation => ({
    ok: false,
    provider: 'azure',
    redacted,
    models: [],
    error,
  });

  const url = azureChatUrl(resource, deployment, apiVersion);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 }),
      signal: controller.signal,
    });

    if (response.ok) return { ok: true, provider: 'azure', redacted, models: [model] };

    // Azure explains itself in the body; the status alone cannot tell a wrong
    // api-version from a missing deployment. Read it before deciding.
    const detail = await azureErrorDetail(response);

    switch (response.status) {
      case 401:
      case 403:
        return fail('Azure rejected that key. Check you copied KEY 1 from Keys and Endpoint.');
      case 404:
        return fail(
          `No deployment named "${deployment}" on resource "${resource}". ` +
            'Use the deployment name from Azure AI Foundry, not the model name.',
        );
      case 429:
        return fail('Azure is rate-limiting this resource. Try again in a moment.');
      case 400:
      case 422:
        // Auth, resource and deployment all resolved — Azure only objected to
        // the one-token probe body, which is not a reason to reject the key.
        // Anything that names the deployment or api-version is a real problem.
        if (/deployment|api-version|model/i.test(detail)) return fail(`Azure said: ${detail}`);
        return { ok: true, provider: 'azure', redacted, models: [model] };
      default:
        return fail(`Azure returned ${response.status}. ${detail}`.trim());
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (controller.signal.aborted) {
      return fail(`Azure did not respond within ${REMOTE_TIMEOUT_MS / 1000}s.`);
    }
    return fail(
      `Could not reach ${resource}.openai.azure.com — check the resource name. (${message})`,
    );
  } finally {
    clearTimeout(timer);
  }
}

/** Azure's `{ error: { message } }` body, or the status text. Never the key. */
async function azureErrorDetail(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    const error = (body as { error?: { message?: unknown } }).error;
    if (typeof error?.message === 'string') return error.message.slice(0, 300);
  } catch {
    // Non-JSON error body — the status is all we have.
  }
  return response.statusText;
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
