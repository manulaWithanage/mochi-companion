# 🍡 Mochi — The Super Assistant (mochi-ai)
> **Your Cozy, Open-Source Animated Desktop AI Companion, Lifestyle Manager & Work Tracker**

![Mochi Banner](https://img.shields.io/badge/License-MIT-blue.svg)
![Status](https://img.shields.io/badge/Status-In_Development-orange.svg)

**Mochi** is designed with one core mission: **to ease up your work, manage your time effortlessly, and bring a cozy, intelligent companion to your desktop.**

---

## ✨ The Mochi Vibe & Philosophy

- ☕ **Cozy & Unobtrusive**: Sits quietly in the corner of your screen sipping coffee or reading a book until you need help or an important alert arrives.
- ⚡ **30-Second Setup**: Simple, frictionless onboarding. Name your companion, pick a skin, set your work hours — no account and no API key needed to start.
- ⏱️ **Effortless Time Tracking (V1 Anchor Feature)**: 1-click stopwatch for projects without cumbersome timesheets. Mochi dons glasses and types alongside you on a mini laptop!
- 🌅 **Daily Lifestyle Rhythm**: 9:00 AM breakfast reminders, gentle hydration checks, and evening wind-down recaps so you never burn out.
- 🤖 **Super-Intelligent Assistant**: On-demand and schedule-aware Gmail & Calendar triage powered by BYOK LLMs (OpenAI, Gemini, Claude, Ollama).

---

## 🎯 Core Objectives & Features

- 🎭 **Animated Desktop Pet**: Floating, transparent, click-through desktop companion with Canvas 2D sprite states (`idle`, `thinking`, `speaking`, `alert`, `working`, `resting`).
- ⏱️ **1-Click Project Stopwatch**: Track active work time per task with zero friction and view live/historical analytics on `app.mochi.ai`.
- 🌅 **Lifestyle & Wellness Nudges**: Breakfast reminders, posture checks, hydration prompts, and evening recap briefings.
- 🔑 **Bring Your Own Key (BYOK)**: Supports **OpenAI**, **Anthropic**, **Google Gemini**, and **Ollama / LM Studio**. Paste a key and Mochi fetches that provider's current model list live — no model IDs are ever hardcoded, so the picker never goes stale. All keys stored locally in OS `safeStorage`.
- 🦙 **Works With No Key At All**: If Ollama is running locally, Mochi detects it on launch and every AI feature works with zero keys and zero accounts.
- 🔒 **No Mochi Servers In The Loop**: Mochi runs no backend that touches your data. Your keys never leave your machine, and no mail bodies or OAuth tokens are ever stored on external servers — all email and calendar processing originates on your desktop. When you choose a cloud model, the content you ask about goes to **that provider** and nowhere else. Choose Ollama and nothing leaves your machine at all.
- 🏷️ **Custom Avatar Naming**: Rename your in-app mascot anytime (e.g., Navi, Barkley, Jarvis, Mochi).

---

## 🛠️ Refined Production Tech Stack

- **Desktop Shell**: `electron-vite` (Main, Renderer, Preload HMR)
- **Cloud Dashboard**: Next.js (`app.mochi.ai`) + Supabase Realtime
- **Frontend Framework**: React + TypeScript + CSS Modules
- **Mascot Animation**: Canvas 2D Sprite Sheets (Open PNG/SVG format, 8–12 FPS)
- **LLM Unified SDK**: Vercel AI SDK (`ai`)
- **MCP Client**: `@modelcontextprotocol/sdk` (HTTP + OAuth transport)
- **Email & Auth**: `google-auth-library` + `ImapFlow` (Local desktop execution only)
- **Local Vault**: Electron Native `safeStorage` (Zero C++ build friction)
- **Local Database**: `better-sqlite3` + `electron-store`
- **Packaging & Testing**: `electron-builder` + `Vitest` + `Playwright`

---

## 📄 License

Mochi is **split-licensed** — see [LICENSING.md](LICENSING.md) for the authoritative map.

| Part | License |
| :--- | :--- |
| Desktop app, shared packages, skins, docs | **[MIT](LICENSE)** |
| Cloud dashboard (`apps/web`) & services | **[AGPL-3.0-or-later](LICENSE-AGPL-3.0.txt)** |

The desktop client is MIT so you can use, fork, embed, or ship it commercially with no obligations beyond keeping the copyright notice. The cloud service is AGPL so nobody can fork it, close the source, and sell hosted Mochi — self-hosting, modified or not, is always fine.

No CLA. You keep copyright on your contributions.
