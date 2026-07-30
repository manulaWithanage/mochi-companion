/**
 * The LLM facade the rest of the app talks to.
 *
 * Owns the vault, the provider probe and the budget, and is the only place
 * that ever holds a plaintext key. Everything it returns is safe to send to
 * the renderer (RULE 1) — redacted strings, model ids, token counts.
 */

import {
  DEFAULT_BUDGET,
  cleanAzureResourceName,
  emptyBudget,
  packAzureKey,
  recordUsage,
  spentToday,
  unpackAzureKey,
  type BudgetConfig,
  type BudgetState,
  type DiscoveredModel,
  type KeyResult,
  type LlmStatus,
  type ProviderId,
} from '@mochi/core';
import { KeyVault } from '../storage/key-vault.js';
import { ProviderService, validateKey, validateAzureKey } from './provider-service.js';

export class LlmService {
  private readonly vault: KeyVault;
  private readonly providers: ProviderService;
  private remoteModels = new Map<ProviderId, readonly DiscoveredModel[]>();
  private budget: BudgetState = emptyBudget;
  private config: BudgetConfig = DEFAULT_BUDGET;
  private readonly listeners = new Set<(status: LlmStatus) => void>();

  constructor(vault = new KeyVault(), providers = new ProviderService()) {
    this.vault = vault;
    this.providers = providers;
  }

  /**
   * Probe Ollama and re-validate any stored keys.
   *
   * Keys are re-checked on launch because a revoked one should surface in
   * Settings rather than as a failed briefing hours later.
   */
  async initialize(): Promise<LlmStatus> {
    await this.providers.probe();
    await Promise.all(this.vault.providers.map((p) => this.refreshProvider(p)));
    return this.emit();
  }

  private async refreshProvider(provider: ProviderId): Promise<void> {
    const key = this.vault.reveal(provider);
    if (key === null) return;

    if (provider === 'azure') {
      const credentials = unpackAzureKey(key);
      if (credentials === null) {
        console.warn('[llm] stored azure credentials are malformed; dropping');
        this.remoteModels.delete('azure');
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
      } else {
        this.remoteModels.delete('azure');
        console.warn(`[llm] azure key did not validate: ${result.error ?? 'unknown'}`);
      }
      return;
    }

    const result = await validateKey(key);
    if (result.ok) {
      this.remoteModels.set(provider, result.models);
      this.providers.markConfigured(provider);
    } else {
      // Keep the key — a network blip is not a revocation — but drop the
      // models so nothing tries to route to them.
      this.remoteModels.delete(provider);
      console.warn(`[llm] ${provider} key did not validate: ${result.error ?? 'unknown'}`);
    }
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
    this.emit();

    return { ok: true, provider: 'azure', redacted: result.redacted, modelCount: 1 };
  }

  forgetKey(provider: ProviderId): LlmStatus {
    this.vault.forget(provider);
    this.remoteModels.delete(provider);
    this.providers.forget(provider);
    return this.emit();
  }

  setDailyTokenCap(cap: number): LlmStatus {
    this.config = { ...this.config, dailyTokenCap: cap };
    return this.emit();
  }

  /** Re-probe, for when the user starts Ollama after Mochi is already open. */
  async refresh(): Promise<LlmStatus> {
    await this.providers.probe();
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
    return {
      ollamaAvailable: probe.ollama.available,
      configured: this.vault.summaries().map((s) => ({
        provider: s.provider,
        redacted: s.redacted,
      })),
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
