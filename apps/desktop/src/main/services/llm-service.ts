/**
 * The LLM facade the rest of the app talks to.
 *
 * Owns the vault, the provider probe and the budget, and is the only place
 * that ever holds a plaintext key. Everything it returns is safe to send to
 * the renderer (RULE 1) — redacted strings, model ids, token counts.
 */

import {
  DEFAULT_BUDGET,
  emptyBudget,
  recordUsage,
  spentToday,
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

    if (provider === 'azure' && key.startsWith('azure::')) {
      const parts = key.split('::');
      const resourceName = parts[1] ?? '';
      const deploymentName = parts[2] ?? '';
      const apiKey = parts[3] ?? '';
      const result = await validateAzureKey({ resourceName, deploymentName, apiKey });
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
    // Azure compound format: `azure::resourceName::deploymentName::apiKey`
    // This arrives pre-validated from the llm:saveAzureKey handler.
    if (rawKey.startsWith('azure::')) {
      if (!this.vault.available) {
        return { ok: false, provider: 'azure', redacted: '••••', modelCount: 0, error: 'This system cannot encrypt secrets.' };
      }
      this.vault.store('azure', rawKey);
      // Format: azure::resourceName::deploymentName::apiKey → parts[2] is deployment
      const parts = rawKey.split('::');
      const deploymentName = parts[2] ?? 'azure-deployment';
      const model: import('@mochi/core').DiscoveredModel = { id: deploymentName, provider: 'azure', capabilities: ['text', 'tools'] };
      this.remoteModels.set('azure', [model]);
      this.providers.markConfigured('azure');
      this.emit();
      return { ok: true, provider: 'azure', redacted: `azure/${deploymentName}`, modelCount: 1 };
    }

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
