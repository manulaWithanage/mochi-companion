/**
 * The actual generation call.
 *
 * Main process only — this is where a decrypted key is used, and it is used
 * immediately rather than held (RULE 1).
 *
 * Routing, budget and capability checks all happen before anything reaches
 * here. This module's only job is: given a chosen model, produce text and
 * report what it cost.
 */

import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createAzure } from '@ai-sdk/azure';
import {
  AZURE_API_VERSION,
  isLocalProvider,
  localCompatUrl,
  route,
  TASKS,
  unpackAzureKey,
  type DiscoveredModel,
  type ProviderId,
  type TaskId,
} from '@mochi/core';
import type { LlmService } from './llm-service.js';

export interface GenerateRequest {
  readonly task: TaskId;
  readonly prompt: string;
  readonly system?: string;
}

export type GenerateResult =
  | { readonly ok: true; readonly text: string; readonly model: string; readonly tokens: number }
  | {
      readonly ok: false;
      readonly reason: string;
      /**
       * The provider's own error, for the Test button only.
       *
       * `reason` is what a speech bubble may show; this is not. It exists
       * because a diagnostic the user pressed on purpose should say what
       * actually failed, and "could not be reached" sent us hunting through
       * terminal logs to find a 404.
       */
      readonly detail?: string;
    };

/**
 * Build a model handle for the chosen provider.
 *
 * Ollama and LM Studio are both reached through the OpenAI provider pointed at
 * localhost, because both expose an OpenAI-compatible API — but neither
 * implements `/v1/responses`, so `.chat()` is required. Calling `provider(id)`
 * instead targets OpenAI's Responses API and fails against every local
 * runtime. That distinction is invisible until it breaks at runtime, and it is
 * why one code path can serve both.
 *
 * Azure has the same trap, one layer deeper. `createAzure(...)(id)` resolves to
 * `provider.languageModel`, which in @ai-sdk/azure v4 is the **Responses**
 * model — it posts to `/openai/v1/responses?api-version=v1` and ignores the
 * deployment name entirely. Most resources answer that with a 404, so a key
 * that validated fine failed on every real call. `.chat()` plus
 * `useDeploymentBasedUrls` is what produces the deployment URL the key was
 * actually validated against.
 */
function buildModel(model: DiscoveredModel, key: string | null, localBaseUrl?: string) {
  switch (model.provider) {
    case 'ollama':
    case 'lmstudio': {
      const local = createOpenAI({
        // Required by the client, ignored by both servers. LM Studio accepts
        // any bearer token; Ollama ignores the header entirely.
        apiKey: 'local',
        baseURL: localCompatUrl(model.provider, localBaseUrl),
      });
      return local.chat(model.id);
    }
    case 'openai':
      return createOpenAI({ apiKey: key ?? '' }).chat(model.id);
    case 'anthropic':
      return createAnthropic({ apiKey: key ?? '' })(model.id);
    case 'google':
      return createGoogleGenerativeAI({ apiKey: key ?? '' })(model.id);
    case 'azure': {
      const credentials = unpackAzureKey(key ?? '');
      if (credentials === null) throw new Error('Stored Azure credentials are malformed.');
      const azure = createAzure({
        resourceName: credentials.resource,
        apiKey: credentials.apiKey,
        apiVersion: AZURE_API_VERSION,
        useDeploymentBasedUrls: true,
      });
      // model.id is the deployment name, which is what Azure routes on.
      return azure.chat(credentials.deployment);
    }
  }
}

/**
 * Total tokens, however the provider chose to report them.
 *
 * Every field is genuinely optional — providers differ, and some omit the
 * total — so this reconstructs it rather than trusting any single field.
 */
function totalTokens(usage: {
  totalTokens?: number | undefined;
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
}): number {
  if (typeof usage.totalTokens === 'number') return usage.totalTokens;
  return (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);
}

export class LlmClient {
  constructor(private readonly llm: LlmService) {}

  /**
   * Whether any model is available at all.
   *
   * For callers that have expensive work to do *before* they can ask — the email
   * triage pass downloads ten message bodies over IMAP to build its prompt. With
   * no model configured that download happened on every sync and was thrown away
   * when `generate` immediately answered "No model is set up yet".
   *
   * Deliberately not a substitute for checking the result of `generate`: routing,
   * budget and capability are decided there, and a model existing does not mean
   * this particular task can use it.
   */
  get hasAnyModel(): boolean {
    return this.llm.models.length > 0;
  }

  /**
   * Run a task.
   *
   * Never throws. Every failure — no model, wrong capability, budget spent,
   * provider down — comes back as `ok: false` with something a user could act
   * on, because the caller is usually a speech bubble.
   */
  async generate(request: GenerateRequest): Promise<GenerateResult> {
    const spec = TASKS[request.task];
    const decision = route(
      spec,
      this.llm.models,
      this.llm.budgetState,
      this.llm.budgetConfig,
      new Date(),
    );

    if (decision.kind !== 'use') {
      return { ok: false, reason: decision.message };
    }

    const model = decision.model;
    // Local runtimes have no key at all. Testing for 'ollama' specifically
    // would send LM Studio down the key path and reject it for the absence of
    // something it never needed.
    const local = isLocalProvider(model.provider);
    const key = local ? null : this.llm.revealKey(model.provider);
    if (key === null && !local) {
      return { ok: false, reason: `No stored key for ${model.provider}.` };
    }

    try {
      const result = await generateText({
        model: buildModel(model, key, local ? this.llm.localBaseUrl(model.provider) : undefined),
        ...(request.system !== undefined ? { system: request.system } : {}),
        prompt: request.prompt,
        maxOutputTokens: spec.maxTokens,
      });

      const tokens = totalTokens(result.usage ?? {});
      this.llm.recordSpend(tokens);

      return { ok: true, text: result.text.trim(), model: model.id, tokens };
    } catch (error) {
      // Never surface a raw provider error to the mascot — it may contain
      // request details, and it is meaningless to the user either way.
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[llm] ${model.provider}/${model.id} failed:`, message);
      return {
        ok: false,
        reason: /401|403|invalid.*key/i.test(message)
          ? `Your ${model.provider} key was rejected. Re-add it in Settings.`
          : 'That model could not be reached just now.',
        detail: `${model.provider}/${model.id}: ${message.slice(0, 300)}`,
      };
    }
  }

  /** Convenience: which provider would handle a task right now. */
  plannedProvider(task: TaskId): ProviderId | null {
    const decision = route(
      TASKS[task],
      this.llm.models,
      this.llm.budgetState,
      this.llm.budgetConfig,
      new Date(),
    );
    return decision.kind === 'use' ? decision.model.provider : null;
  }
}
