# 🍡 Mochi — The Super Assistant (mochi-ai)
> **Your Open-Source Animated Desktop AI Companion, Lifestyle Manager & Work Tracker**

![Mochi Banner](https://img.shields.io/badge/License-MIT-blue.svg)
![Status](https://img.shields.io/badge/Status-In_Development-orange.svg)

**Mochi** is a cute, animated desktop companion that stays on your screen, tracks your work time, manages your daily lifestyle routine (breakfast, hydration, breaks), monitors your email & calendar, and brings intelligent multi-model AI right to your desktop.

---

## 🎯 Project Objectives & Core Features

- 🎭 **Animated Desktop Pet**: Floating, transparent, click-through desktop companion with dynamic state animations (`idle`, `thinking`, `speaking`, `alert`, `working`, `resting`).
- ⏱️ **Lifestyle & Work Time Tracker**: 1-click project stopwatch, time distribution logging, and smart efficiency insights.
- 🌅 **Daily Lifestyle Routine & Wellness Nudges**: 9:00 AM breakfast reminders, hydration checks, posture alerts, and evening wind-down summaries.
- 🔑 **Bring Your Own Key (BYOK)**: Supports **OpenAI (GPT-4o)**, **Anthropic (Claude 3.5)**, **Google Gemini**, and **Ollama / LM Studio** for local LLMs.
- 📧 **Zero-Audit Gmail & Calendar Integration**: Local OAuth 2.0 PKCE & IMAP support ($0 Google audit fees, 100% private).
- 🔒 **Privacy-First Architecture**: Your API keys, time logs, and data are stored 100% locally in your system keychain & SQLite database.
- 🔌 **Extensible MCP Plugins**: Easily add community plugins for custom tools, home automation, and desktop actions.
- 🏷️ **Custom Assistant Naming**: Users can rename their in-app assistant avatar anytime (e.g., Navi, Barkley, Jarvis, Mochi).

---

## 🛠️ Recommended Tech Stack

- **Desktop Shell**: Electron + Vite
- **Frontend Framework**: React + TypeScript
- **Styling Engine**: Glassmorphic Vanilla CSS
- **Animation Engine**: Rive / Lottie / WebGL Canvas State Machine
- **Integrations**: `googleapis` (OAuth 2.0 PKCE) & `node-imap`
- **Local Vault**: Native System Keychain (`keytar`) & SQLite

---

## 📄 License

[MIT License](LICENSE) — Free and open-source forever.
