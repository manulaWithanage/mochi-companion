# 🍡 Mochi — The Super Assistant (mochi-ai)
> **Your Cozy, Open-Source Animated Desktop AI Companion & Effortless Lifestyle Assistant**

![Mochi Banner](https://img.shields.io/badge/License-MIT-blue.svg)
![Status](https://img.shields.io/badge/Status-In_Development-orange.svg)

**Mochi** is designed with one single core mission: **to ease up your work, manage your time effortlessly, and bring a cozy, intelligent companion to your desktop.**

---

## ✨ The Mochi Vibe & Philosophy

- ☕ **Cozy & Unobtrusive**: Sits quietly in the corner of your screen sipping coffee or reading a book until you need help or an important alert arrives.
- ⚡ **30-Second Setup**: Simple, frictionless onboarding. Just name your companion, paste your API key, and set your work hours.
- ⏱️ **Effortless Time Tracking**: 1-click stopwatch for projects without cumbersome timesheets. Mochi types alongside you on a mini laptop!
- 🌅 **Daily Lifestyle Rhythm**: 9:00 AM breakfast reminders, gentle hydration checks, and evening wind-down recaps so you never burn out.
- 🤖 **Super-Intelligent Assistant**: 24/7 Gmail & Calendar triage powered by BYOK LLMs (OpenAI, Gemini, Claude, Ollama).

---

## 🎯 Core Objectives & Features

- 🎭 **Animated Desktop Pet**: Floating, transparent, click-through desktop companion with Canvas 2D sprite states (`idle`, `thinking`, `speaking`, `alert`, `working`, `resting`).
- ⏱️ **1-Click Project Stopwatch**: Track active work time per task with zero friction.
- 🌅 **Lifestyle & Wellness Nudges**: Breakfast reminders, posture checks, hydration prompts, and evening recap briefings.
- 🔑 **Bring Your Own Key (BYOK)**: Supports **OpenAI (GPT-4o)**, **Anthropic (Claude 3.5)**, **Google Gemini**, and **Ollama / LM Studio**.
- 📧 **Zero-Audit Gmail & Calendar Integration**: `google-auth-library` (OAuth 2.0 PKCE) & `ImapFlow` ($0 Google audit fees, 100% private).
- 🔒 **Privacy-First Vault**: API keys stored encrypted locally using Electron native `safeStorage` (Windows DPAPI / Mac Keychain).
- 🏷️ **Custom Avatar Naming**: Rename your in-app mascot anytime (e.g. Navi, Barkley, Jarvis, Mochi).

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
