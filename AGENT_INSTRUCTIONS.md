# 🍡 Mochi — AI Agent Master Specification & Implementation Plan

> **Instructions for AI Coding Agents**: This document defines the architectural goals, core requirements, technical stack, detailed objectives, and step-by-step roadmap for building **Mochi**, an open-source, BYOK animated desktop companion.

---

## 🎯 Primary Project Objectives

### 1. 🤖 Animated Desktop Companion Engine
- Build a frameless, transparent, click-through desktop overlay window that houses a reactive 2D/3D mascot.
- Mascot changes visual animation states dynamically based on activity: `idle`, `thinking`, `speaking`, `alert`, `sleeping`, `focused`.
- Speech bubble overlay for mascot responses, daily debriefs, and calendar notifications.

### 2. 🔑 Privacy-First & BYOK (Bring Your Own Key)
- Zero centralized telemetry, tracking, or mandatory backend server.
- Support **OpenAI (GPT-4o)**, **Anthropic (Claude 3.5)**, **Google Gemini**, and **Local Ollama / LM Studio**.
- Store all API keys and OAuth tokens 100% locally in system keychain (`keytar` / native OS credential manager).

### 3. 📅 Proactive Workflow & Schedule Assistant
- Background monitoring service (every 15 min) checking upcoming calendar meetings and unread emails.
- Morning briefing generator ("Good morning! Here are your 3 meetings today and 2 high-priority emails.").
- Instant 1-click meeting join and email draft replies.

### 4. ⏱️ Focus & Productivity Buddy
- Built-in Pomodoro timer where mascot works alongside the user.
- Sync with To-Do lists (Todoist, Notion, Google Tasks, Apple Reminders).
- Celebratory mascot animations when tasks are checked off.

### 5. 🎨 Customization & Open-Core Roadmap
- Allow users to rename their companion avatar (e.g. Navi, Barkley, Jarvis, Mochi).
- Support community skin packs (Rive, Lottie, WebGL pixel art).
- Maintain 100% free open-source core with optional future SaaS hosting & avatar marketplace add-ons.

---

## 🛠️ Recommended Tech Stack

- **Desktop Framework**: Electron or Tauri v2 (Rust + Web Frontend)
- **Frontend Stack**: React + TypeScript + Vite + Tailwind CSS / Vanilla CSS
- **Animation Renderer**: Rive / Lottie / WebGL Canvas State Machine
- **LLM Integration**: LangChain.js / Vercel AI SDK / Direct Fetch Adapters
- **Local Vault**: `keytar` (Node Keychain) / Native OS Credential Manager

---

## 🚀 Step-by-Step Implementation Roadmap for AI Agents

### Phase 1: Desktop Shell & Floating Avatar (Foundation)
- [ ] Initialize Electron / Tauri app with Vite + React + TypeScript.
- [ ] Configure main window properties: `transparent: true`, `frame: false`, `alwaysOnTop: true`, `resizable: false`.
- [ ] Implement global hotkeys (e.g., `Ctrl+Shift+M` or `Cmd+Shift+M` to summon/hide Mochi).
- [ ] Create basic floating sprite component rendering animated mascot states (`idle`, `thinking`, `speaking`).
- [ ] Implement floating speech bubble UI for mascot messages.

### Phase 2: BYOK Settings Vault & Multi-LLM Router
- [ ] Build a sleek Settings Modal / Dashboard window.
- [ ] Create fields for API Keys: OpenAI, Anthropic, Google Gemini, and Ollama endpoint (`http://localhost:11434`).
- [ ] Add settings for Custom Assistant Name (default: "Mochi").
- [ ] Securely store API keys locally in OS Keychain.
- [ ] Build unified LLM Router class with model switching support.

### Phase 3: Proactive Workflow Integrations (Calendar & Email)
- [ ] Implement OAuth 2.0 PKCE flow for Google Workspace (Gmail & Google Calendar) and Microsoft Graph.
- [ ] Build background polling service (running every 15 mins) for upcoming events & urgent unread emails.
- [ ] Implement daily morning briefing generator.

### Phase 4: Focus & Habit Buddy (Pomodoro & Tasks)
- [ ] Build mini Pomodoro timer where mascot works alongside user.
- [ ] Integrate To-Do list sync (Todoist, Notion, or local task list).
- [ ] Trigger celebratory avatar animations when tasks are checked off.

---

## 🤖 Prompt to Paste into an AI Agent

```text
You are an expert full-stack desktop software engineer. You are building "Mochi", an open-source, BYOK animated desktop companion app. 

Follow the specifications in AGENT_INSTRUCTIONS.md:
1. Initialize the desktop project using Electron/Tauri with React, TypeScript, and Vite.
2. Build a transparent, frameless, always-on-top desktop overlay window containing an animated floating mascot.
3. Build a BYOK (Bring Your Own Key) settings panel for OpenAI, Gemini, Anthropic, and Ollama.
4. Ensure all user credentials and API keys are stored 100% locally on the user's machine.
5. Create clean, modular code with clear documentation.

Start by setting up the project dependencies and the transparent Electron main window.
```
