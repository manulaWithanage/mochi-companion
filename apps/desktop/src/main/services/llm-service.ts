/**
 * The LLM facade the rest of the app talks to.
 *
 * Owns the vault, the provider probe and the budget, and is the only place
 * that ever holds a plaintext key. Everything it returns is safe to send to
 * the renderer (RULE 1) — redacted strings, model ids, token counts.
 */

import {
  DEFAULT_BUDGET,
  LOCAL_PROVIDERS,
  cleanAzureResourceName,
  emptyBudget,
  normaliseBaseUrl,
  packAzureKey,
  recordUsage,
  spentToday,
  unpackAzureKey,
  type BudgetConfig,
  type BudgetState,
  type DiscoveredModel,
  type KeyResult,
  type LlmStatus,
  type LocalProviderStatus,
  type ProviderId,
} from '@mochi/core';
import { KeyVault } from '../storage/key-vault.js';
import { ProviderService, validateKey, validateAzureKey } from './provider-service.js';

/**
 * Where local base-URL overrides are read and written.
 *
 * A port is not a secret, so these live in settings rather than the vault —
 * but LlmService should not depend on SettingsStore directly, so the wiring is
 * handed in. Defaults to in-memory, which keeps the class testable.
 */
export interface LocalEndpointStore {
  get(): Readonly<Record<string, string>>;
  set(endpoints: Readonly<Record<string, string>>): void;
}

const memoryEndpointStore = (): LocalEndpointStore => {
  let value: Readonly<Record<string, string>> = {};
  return {
    get: () => value,
    set: (next) => {
      value = next;
    },
  };
};

/**
 * Where the daily token cap is read and written.
 *
 * Handed in for the same reason as the endpoints: a cap is the user's choice
 * and belongs in settings, but this class should not know what a settings file
 * is. Before this existed `setDailyTokenCap` mutated a field and nothing else,
 * so raising the cap lasted until the next restart — and the router was
 * meanwhile telling people to raise it.
 */
export interface DailyCapStore {
  get(): number;
  set(cap: number): void;
}

const memoryCapStore = (initial: number): DailyCapStore => {
  let value = initial;
  return {
    get: () => value,
    set: (next) => {
      value = next;
    },
  };
};

/** A stored key that did not validate, and when we last tried. */
interface KeyFailure {
  readonly error: string;
  readonly at: number;
}

export class LlmService {
  private readonly vault: KeyVault;
  private readonly providers: ProviderService;
  private readonly endpoints: LocalEndpointStore;
  private readonly caps: DailyCapStore;
  private remoteModels = new Map<ProviderId, readonly DiscoveredModel[]>();
  /**
   * Why each stored key last failed to validate.
   *
   * Kept beside the vault rather than in it: the vault holds secrets, and a
   * validation error is not one. Absent means the last check passed.
   */
  private keyFailures = new Map<ProviderId, KeyFailure>();
  private lastKeyCheckAt: number | null = null;
  private budget: BudgetState = emptyBudget;
  private readonly listeners = new Set<(status: LlmStatus) => void>();

  constructor(
    vault = new KeyVault(),
    providers = new ProviderService(),
    endpoints: LocalEndpointStore = memoryEndpointStore(),
    caps: DailyCapStore = memoryCapStore(DEFAULT_BUDGET.dailyTokenCap),
  ) {
    this.vault = vault;
    this.providers = providers;
    this.endpoints = endpoints;
    this.caps = caps;
  }

  /**
   * The budget the router spends against.
   *
   * Derived from the cap store on every read rather than cached, so a cap
   * changed in Settings applies to the very next call instead of the next
   * launch.
   */
  private get config(): BudgetConfig {
    return { ...DEFAULT_BUDGET, dailyTokenCap: this.caps.get() };
  }

  /**
   * Probe the local runtimes and re-validate any stored keys.
   *
   * Keys are re-checked on launch because a revoked one should surface in
   * Settings rather than as a failed briefing hours later.
   */
  async initialize(): Promise<LlmStatus> {
    await this.providers.probe(this.endpoints.get());
    await this.revalidateKeys();
    return this.emit();
  }

  /**
   * Re-check every stored key and record the outcome.
   *
   * Separate from `initialize` so the Refresh button can run it too: a key
   * that failed at launch because the network was down should be clearable
   * without restarting Mochi.
   */
  private async revalidateKeys(): Promise<void> {
    await Promise.all(this.vault.providers.map((p) => this.refreshProvider(p)));
    this.lastKeyCheckAt = Date.now();
  }

  /**
   * The base URL a local provider should be reached on.
   *
   * The single source of truth for this, read by both the probe and the model
   * builder — the Azure lesson was that validating one URL while calling
   * another produces a setup that tests green and then fails every call.
   */
  localBaseUrl(provider: ProviderId): string | undefined {
    return this.endpoints.get()[provider];
  }

  /** Point a local runtime somewhere else, or back to its default with null. */
  async setLocalEndpoint(provider: ProviderId, baseUrl: string | null): Promise<LlmStatus> {
    const next = { ...this.endpoints.get() };
    const cleaned = baseUrl === null ? '' : normaliseBaseUrl(baseUrl);

    if (cleaned.length === 0) delete next[provider];
    else next[provider] = cleaned;

    this.endpoints.set(next);
    await this.providers.probeOne(provider, next[provider]);
    return this.emit();
  }

  private async refreshProvider(provider: ProviderId): Promise<void> {
    const key = this.vault.reveal(provider);
    if (key === null) {
      // A key in the vault that cannot be decrypted is its own failure, and a
      // loud one: safeStorage is bound to the OS account, so this is what a
      // restored profile or a new machine looks like.
      this.noteKeyFailure(
        provider,
        'The stored key could not be decrypted on this machine. Paste it again.',
      );
      return;
    }

    if (provider === 'azure') {
      const credentials = unpackAzureKey(key);
      if (credentials === null) {
        console.warn('[llm] stored azure credentials are malformed; dropping');
        this.remoteModels.delete('azure');
        this.noteKeyFailure('azure', 'The stored Azure credentials are malformed. Connect again.');
        return;
      }
      const result = await validateAzureKey({
        resourceName: credentials.resource,
        deploymentName: credentials.deployment,
        apiKey: credentials.apiKey,
      });
      if (result.ok) {
        this.remoteModels.set('azure', result.models);
        this.providers.markConfigured('azure');
        this.clearKeyFailure('azure');
      } else {
        this.remoteModels.delete('azure');
        console.warn(`[llm] azure key did not validate: ${result.error ?? 'unknown'}`);
        this.noteKeyFailure('azure', result.error);
      }
      return;
    }

    const result = await validateKey(key);
    if (result.ok) {
      this.remoteModels.set(provider, result.models);
      this.providers.markConfigured(provider);
      this.clearKeyFailure(provider);
    } else {
      // Keep the key — a network blip is not a revocation — but drop the
      // models so nothing tries to route to them, and record *why*, because
      // dropping the models silently is what made a dead key indistinguishable
      // from a provider nobody had configured.
      this.remoteModels.delete(provider);
      console.warn(`[llm] ${provider} key did not validate: ${result.error ?? 'unknown'}`);
      this.noteKeyFailure(provider, result.error);
    }
  }

  private noteKeyFailure(provider: ProviderId, error?: string): void {
    this.keyFailures.set(provider, {
      error: error ?? 'The key did not validate, and the provider gave no reason.',
      at: Date.now(),
    });
  }

  private clearKeyFailure(provider: ProviderId): void {
    this.keyFailures.delete(provider);
  }

  /**
   * Validate and store a pasted key.
   *
   * The raw key is used here and never returned. Storing only after a
   * successful live call means a bad key is caught at paste time rather than
   * during the next briefing.
   */
  async saveKey(rawKey: string): Promise<KeyResult> {
    const result = await validateKey(rawKey);
    if (!result.ok || result.provider === null) {
      return {
        ok: false,
        provider: result.provider,
        redacted: result.redacted,
        modelCount: 0,
        ...(result.error !== undefined ? { error: result.error } : {}),
      };
    }

    if (!this.vault.available) {
      return {
        ok: false,
        provider: result.provider,
        redacted: result.redacted,
        modelCount: 0,
        error: 'This system cannot encrypt secrets, so the key was not saved.',
      };
    }

    this.vault.store(result.provider, rawKey);
    this.remoteModels.set(result.provider, result.models);
    this.providers.markConfigured(result.provider);
    // This key just validated, so any error from the old one is history.
    this.clearKeyFailure(result.provider);
    this.emit();

    return {
      ok: true,
      provider: result.provider,
      redacted: result.redacted,
      modelCount: result.models.length,
    };
  }

  /**
   * Validate and store Azure credentials.
   *
   * Separate from `saveKey` because Azure cannot be identified from the key
   * alone — a 32-char hex string carries no resource or deployment — and
   * because the probe is a chat call rather than a model list.
   *
   * Validation lives here, not in the IPC handler, so there is exactly one
   * path from "user pressed Connect" to "credentials in the vault".
   */
  async saveAzureKey(
    resourceName: string,
    deploymentName: string,
    apiKey: string,
  ): Promise<KeyResult> {
    const result = await validateAzureKey({ resourceName, deploymentName, apiKey });
    if (!result.ok) {
      return {
        ok: false,
        provider: 'azure',
        redacted: result.redacted,
        modelCount: 0,
        ...(result.error !== undefined ? { error: result.error } : {}),
      };
    }

    if (!this.vault.available) {
      return {
        ok: false,
        provider: 'azure',
        redacted: result.redacted,
        modelCount: 0,
        error: 'This system cannot encrypt secrets, so the key was not saved.',
      };
    }

    // Store the cleaned resource and deployment the probe actually succeeded
    // against, not the raw text the user typed.
    const model = result.models[0];
    const deployment = model?.id ?? deploymentName.trim();
    this.vault.store(
      'azure',
      packAzureKey({
        resource: cleanAzureResourceName(resourceName),
        deployment,
        apiKey: apiKey.trim(),
      }),
    );
    this.remoteModels.set('azure', result.models);
    this.providers.markConfigured('azure');
    this.clearKeyFailure('azure');
    this.emit();

    return { ok: true, provider: 'azure', redacted: result.redacted, modelCount: 1 };
  }

  forgetKey(provider: ProviderId): LlmStatus {
    this.vault.forget(provider);
    this.remoteModels.delete(provider);
    this.providers.forget(provider);
    // The provider is gone from `configured`, so a failure attached to it
    // would never be shown again and would resurface against the next key.
    this.clearKeyFailure(provider);
    return this.emit();
  }

  setDailyTokenCap(cap: number): LlmStatus {
    this.caps.set(Math.max(0, Math.floor(cap)));
    return this.emit();
  }

  /**
   * Re-probe the local runtimes *and* re-check the stored keys.
   *
   * The local half is for someone who started Ollama after Mochi; the key half
   * is the only way to clear a validation error without a restart, which is
   * what makes the error worth showing in the first place.
   */
  async refresh(): Promise<LlmStatus> {
    await this.providers.probe(this.endpoints.get());
    await this.revalidateKeys();
    return this.emit();
  }

  /** Every model Mochi can currently reach, local and remote. */
  get models(): readonly DiscoveredModel[] {
    return [...this.providers.localModels, ...[...this.remoteModels.values()].flat()];
  }

  get budgetState(): BudgetState {
    return this.budget;
  }

  get budgetConfig(): BudgetConfig {
    return this.config;
  }

  /** Called after a completed call, so the spend meter reflects reality. */
  recordSpend(tokens: number, now: Date = new Date()): void {
    this.budget = recordUsage(this.budget, tokens, now);
    this.emit();
  }

  /**
   * Decrypt a key for an outgoing call.
   *
   * Main process only. The result must never cross the bridge — callers use
   * it immediately and do not hold it.
   */
  revealKey(provider: ProviderId): string | null {
    return this.vault.reveal(provider);
  }

  status(now: Date = new Date()): LlmStatus {
    const probe = this.providers.status;
    const overrides = this.endpoints.get();

    const local: LocalProviderStatus[] = LOCAL_PROVIDERS.map((info) => {
      const result = probe.local.get(info.id);
      return {
        provider: info.id,
        label: info.label,
        available: result?.available ?? false,
        baseUrl: result?.baseUrl ?? info.defaultBaseUrl ?? '',
        custom: overrides[info.id] !== undefined,
        modelCount: result?.models.length ?? 0,
        ...(result?.error !== undefined ? { error: result.error } : {}),
      };
    });

    return {
      local,
      anyLocalAvailable: local.some((l) => l.available),
      configured: this.vault.summaries().map((s) => {
        const failure = this.keyFailures.get(s.provider);
        return {
          provider: s.provider,
          redacted: s.redacted,
          ...(failure !== undefined ? { error: failure.error } : {}),
          // The time of the last check, not of the failure, so "checked just
          // now and still fine" is distinguishable from "nobody has looked".
          ...(this.lastKeyCheckAt !== null ? { checkedAt: this.lastKeyCheckAt } : {}),
        };
      }),
      models: this.models,
      ready: this.models.length > 0,
      spentToday: spentToday(this.budget, now),
      dailyTokenCap: this.config.dailyTokenCap,
    };
  }

  onChange(listener: (status: LlmStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): LlmStatus {
    const status = this.status();
    for (const listener of this.listeners) listener(status);
    return status;
  }
}
