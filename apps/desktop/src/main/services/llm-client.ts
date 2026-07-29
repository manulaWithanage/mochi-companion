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
import {
  OLLAMA_DEFAULT_HOST,
  route,
  TASKS,
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
  | { readonly ok: false; readonly reason: string };

/**
 * Build a model handle for the chosen provider.
 *
 * Ollama is reached through the OpenAI provider pointed at localhost, because
 * it exposes an OpenAI-compatible API — but it only implements
 * `/v1/chat/completions`, so `.chat()` is required. Calling `provider(id)`
 * instead targets OpenAI's Responses API and fails against every local
 * runtime. That distinction is invisible until it breaks at runtime.
 */
function buildModel(model: DiscoveredModel, key: string | null) {
  switch (model.provider) {
    case 'ollama': {
      const local = createOpenAI({
        apiKey: 'ollama', // required by the client, ignored by the server
        baseURL: `${OLLAMA_DEFAULT_HOST}/v1`,
      });
      return local.chat(model.id);
    }
    case 'openai':
      return createOpenAI({ apiKey: key ?? '' }).chat(model.id);
    case 'anthropic':
      return createAnthropic({ apiKey: key ?? '' })(model.id);
    case 'google':
      return createGoogleGenerativeAI({ apiKey: key ?? '' })(model.id);
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
    const key = model.provider === 'ollama' ? null : this.llm.revealKey(model.provider);
    if (key === null && model.provider !== 'ollama') {
      return { ok: false, reason: `No stored key for ${model.provider}.` };
    }

    try {
      const result = await generateText({
        model: buildModel(model, key),
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
