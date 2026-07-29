# 🍡 Mochi — The Super Assistant (mochi-ai)
> **Your Open-Source Animated Desktop AI Companion, Lifestyle Manager & Work Tracker**

![Mochi Banner](https://img.shields.io/badge/License-MIT-blue.svg)
![Status](https://img.shields.io/badge/Status-In_Development-orange.svg)

**Mochi** is a cute, animated desktop companion that stays on your screen, tracks your work time, manages your daily lifestyle routine (breakfast, hydration, breaks), monitors your email & calendar, and brings intelligent multi-model AI right to your desktop.

---

## 🎯 Project Objectives & Core Features

- 🎭 **Animated Desktop Pet**: Floating, transparent, click-through desktop companion powered by a Canvas 2D sprite engine (8–12 FPS idle, 0 FPS when hidden for 0% CPU drain).
- ⏱️ **Lifestyle & Work Time Tracker**: 1-click project stopwatch, local `better-sqlite3` time logging, and smart efficiency insights.
- 🌅 **Daily Lifestyle Routine & Wellness Nudges**: 9:00 AM breakfast reminders, hydration checks, posture alerts, and evening wind-down summaries.
- 🔑 **Bring Your Own Key (BYOK)**: Powered by Vercel AI SDK (`ai`). Supports **OpenAI (GPT-4o)**, **Anthropic (Claude 3.5)**, **Google Gemini**, and **Ollama / LM Studio**.
- 📧 **Zero-Audit Gmail & Calendar Integration**: `google-auth-library` (OAuth 2.0 PKCE) & `ImapFlow` ($0 Google audit fees, 100% private).
- 🔒 **Privacy-First Vault**: API keys and refresh tokens stored using Electron native `safeStorage` (Windows DPAPI / Mac Keychain).
- 🔌 **Extensible MCP Plugins**: Powered by `@modelcontextprotocol/sdk` for custom community tools & home automation.
- 🏷️ **Custom Assistant Naming**: Users can rename their in-app assistant avatar anytime (e.g., Navi, Barkley, Jarvis, Mochi).

---

## 🛠️ Refined Production Tech Stack

- **Desktop Shell**: `electron-vite` (Main, Renderer, Preload HMR)
- **Frontend Framework**: React + TypeScript + CSS Modules
- **Mascot Animation**: Canvas 2D Sprite Sheets (Open PNG/SVG format, 8–12 FPS)
- **LLM Unified SDK**: Vercel AI SDK (`ai`)
- **MCP Client**: `@modelcontextprotocol/sdk`
- **Email & Auth**: `google-auth-library` + `ImapFlow`
- **Local Vault**: Electron Native `safeStorage` (Zero C++ build friction)
- **Local Database**: `better-sqlite3` + `electron-store`
- **Packaging & Testing**: `electron-builder` + `Vitest` + `Playwright`

---

## 📄 License

[MIT License](LICENSE) — Free and open-source forever.
