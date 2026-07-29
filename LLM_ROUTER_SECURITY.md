# 🍡 Mochi — Dynamic LLM Router & Key Security Specification

> **Master Specification**: This document details the dynamic model discovery, token budget guardrails, main-process IPC key security, and fallback task routing for **Mochi**.

---

## 🔒 1. Main-Process IPC Key Isolation Architecture

> **Security Rule**: API keys **NEVER** enter the Renderer process (UI). The renderer renders untrusted email text and LLM outputs, which are attacker-influenced surface areas.

```
┌─────────────────────────────────────────────────────────────┐
│                 RENDERER PROCESS (UI Window)                │
│ • Displays Mascot Animations, Speech Bubbles & Time Tracker │
│ • Renders untrusted email text & prompt outputs as TEXT     │
│ • HAS ZERO ACCESS to safeStorage, IPC Key Vault, or Keys    │
└──────────────────────────────┬──────────────────────────────┘
                               │ IPC Bridge: `invoke('llm:executeTask', { task, prompt })`
                               │ ONLY returns text strings (NO KEYS EVER PASSED)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 MAIN PROCESS (Electron Node)                │
│ • Reads encrypted API Keys from native `safeStorage`         │
│ • Executes Vercel AI SDK requests strictly in Main Process  │
│ • Enforces Token Budgets & Capability Degradation Warnings   │
└─────────────────────────────────────────────────────────────┘
```

---

## ⚡ 2. Dynamic Model Discovery (Zero Hardcoded Model Names)

Mochi **NEVER hardcodes model names**. Models are fetched dynamically on key paste:

```typescript
// Detect provider from key prefix and fetch model list dynamically
async function discoverModels(
  provider: 'openai' | 'anthropic' | 'gemini' | 'ollama',
  apiKey?: string,
): Promise<string[]> {
  if (provider === 'ollama') {
    const res = await fetch('http://127.0.0.1:11434/api/tags');
    const data = await res.json();
    return data.models.map((m: any) => m.name); // e.g. ["llama3.2:3b", "qwen2.5:7b"]
  }
  // Dynamic GET request to provider /models endpoints
  // Populate UI dropdown dynamically & store selection as a plain string
}
```

---

## 📊 3. Token Budget Guardrails & Spend Meter

To protect the user from unexpected API charges, Mochi includes a built-in **Token Budget Governor**:

```typescript
export type BudgetConfig = {
  dailyTokenCap: number; // e.g. 50,000 tokens/day
  onExceed: 'downgrade-to-local' | 'pause' | 'ask';
  showEstimateBeforeExpensiveOps: boolean; // Confirm before heavy RAG
};

export type TaskRoute = {
  task: 'briefing' | 'triage' | 'draft' | 'chat' | 'screen';
  requires: ('text' | 'tools' | 'vision')[];
  primary: string; // Plain Model ID string
  fallback: string | 'local' | 'skip';
  maxTokens: number;
};
```

- **Per-Task Routing Defaults**:
  - `briefing` & `triage`: Defaults to cheapest model or local Ollama.
  - `draft` & `chat`: Uses primary selected model.
- **Zero-Key Onboarding**: On startup, Mochi probes `http://127.0.0.1:11434`. If Ollama is running, Mochi is **100% functional out of the box with zero keys pasted!**

---

## 🛡️ 4. Capability Tagging & Visible Local Model Fallback

Local 7B models can struggle with complex MCP tool calling schema arguments. Mochi explicitly tags task capabilities and warns users gracefully:

| Task                            | Required Capability | Local 3B/7B    | Cloud / Local 30B+ | Action                                                                                                 |
| :------------------------------ | :------------------ | :------------- | :----------------- | :----------------------------------------------------------------------------------------------------- |
| **Daily Briefing / Summarize**  | `text`              | ✅ Supported   | ✅ Supported       | Runs locally or on cheapest tier                                                                       |
| **Stopwatch / Time Tracking**   | `text`              | ✅ Supported   | ✅ Supported       | Runs 100% locally                                                                                      |
| **MCP Tool Calling / Calendar** | `tools`             | ⚠️ Unreliable  | ✅ Supported       | Graceful warning: _"Calendar actions require tool calling. Pick a cloud model or larger local model."_ |
| **Screen Reading (Hotkey)**     | `vision`            | ❌ Unsupported | ✅ Supported       | Fallback to OCR text parsing                                                                           |
