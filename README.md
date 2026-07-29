# 🍡 Mochi — The Super Assistant (mochi-ai)
> **Your Open-Source Animated Desktop AI Companion & Workflow Assistant**

![Mochi Banner](https://img.shields.io/badge/License-MIT-blue.svg)
![Status](https://img.shields.io/badge/Status-In_Development-orange.svg)

**Mochi** is a cute, animated desktop companion that stays on your screen, monitors your email & calendar, keeps you focused on your to-do lists, and brings intelligent multi-model AI right to your desktop.

---

## 🎯 Project Objectives

- 🎭 **Animated Desktop Pet**: Floating, transparent, click-through desktop companion with dynamic state animations (idle, thinking, alert, focused, sleeping).
- 🔑 **Bring Your Own Key (BYOK)**: Supports **OpenAI (GPT-4o)**, **Anthropic (Claude 3.5)**, **Google Gemini**, and **Ollama / LM Studio** for local LLMs.
- 📅 **Smart Calendar & Email Assistant**: Proactive alerts for upcoming meetings, morning briefings, email summaries, and 1-click quick-reply drafts.
- ⏱️ **Focus & Habit Buddy**: Built-in Pomodoro timer and task syncing with Todoist, Notion, and Google Tasks.
- 🔒 **Privacy-First Architecture**: Your API keys and data are stored 100% locally in your system keychain with zero cloud telemetry.
- 🔌 **Extensible MCP Plugins**: Easily add community plugins for custom tools, home automation, and desktop actions.
- 🏷️ **Custom Assistant Naming**: Users can rename their in-app assistant avatar anytime (e.g., Navi, Barkley, Jarvis, Mochi).

---

## 🛠️ Planned Tech Stack

- **Desktop Shell**: Electron / Tauri v2
- **Frontend Framework**: React + TypeScript + Vite
- **Animation Engine**: Rive / Lottie / WebGL Canvas
- **Backend / Integrations**: Node.js & OAuth 2.0 PKCE (Google Workspace & MS Graph API)
- **Local Storage**: System Keychain (`keytar`) & SQLite

---

## 📄 License

[MIT License](LICENSE) — Free and open-source forever.
