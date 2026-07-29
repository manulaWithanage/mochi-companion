# 🍡 Mochi — AI Agent Master Specification & Implementation Plan

> **Instructions for AI Coding Agents**: This document defines the architectural goals, core requirements, technical stack, detailed objectives, security plan, onboarding UX, and step-by-step roadmap for building **Mochi**, an open-source, BYOK animated desktop companion.

---

## 🎯 Primary Project Objectives

### 1. 🎨 3-Step Setup Window & Seamless Companion Experience
- **One-Time Setup Window**: User opens Mochi, names their mascot (e.g. Navi, Mochi, Jarvis), pastes their API key, sets their work schedule & breakfast time, and connects Gmail.
- **Floating Desktop Helper**: Once saved, the setup window closes and Mochi floats gracefully on top of the screen as a transparent, interactive pet.
- **Proactive Follow-Through**: Mochi follows through on all configured schedules—animating, offering speech bubble nudges (9 AM breakfast, hydration checks, project stopwatch, meeting alerts).

### 2. 🤖 Animated Desktop Companion Engine
- Build a frameless, transparent, click-through desktop overlay window housing a reactive mascot.
- Mascot uses **Canvas 2D Sprite Sheets** with low-overhead 8–12 FPS idle animation (0 FPS when occluded/idle to conserve CPU/battery).
- Visual states: `idle`, `thinking`, `speaking`, `alert`, `sleeping`, `focused`, `working`, `resting`.

### 3. ⏱️ Lifestyle Routine, Time Tracker & Health Buddy
- **Project Stopwatch & Time Logging**: Track active work time per project/task with 1-click controls.
- **Daily Lifestyle Rhythm**: Programmed daily schedules (e.g., 9:00 AM breakfast reminder, lunch breaks, end-of-day wind-down).
- **Health & Wellness Micro-Nudges**: Gentle hourly reminders for hydration, eye rest (20-20-20 rule), and posture checks.

### 4. 🔑 Privacy-First & BYOK (Bring Your Own Key)
- Zero centralized telemetry, tracking, or mandatory backend server.
- Support **OpenAI (GPT-4o)**, **Anthropic (Claude 3.5)**, **Google Gemini**, and **Local Ollama / LM Studio**.
- Store all API keys and OAuth tokens 100% locally using Electron's native `safeStorage` (Windows DPAPI / macOS Keychain).

### 5. 📧 Zero-Audit Gmail & Calendar Integration Strategy
- **Local OAuth 2.0 PKCE**: Users provide their own free Google Cloud Desktop Client ID/Secret via `google-auth-library` ($0 Google audit fees).
- **Local Loopback Redirect**: Handles OAuth login flow seamlessly via `http://localhost:3000/callback`.
- **ImapFlow Fallback**: Uses modern `ImapFlow` for direct encrypted local IMAP connections.

---

## 🛠️ Refined Production Tech Stack

| Layer | Recommended Technology | Why |
| :--- | :--- | :--- |
| **Desktop Shell** | `electron-vite` | Unified build pipeline for main, renderer, and preload scripts with seamless HMR. Native transparent overlay window support. |
| **Frontend Framework** | **React + TypeScript** | Type-safe component architecture for speech bubbles, time trackers, settings modals, and mascot state rendering. |
| **Styling & Materials** | **CSS Modules + Native Windows/Mac Materials** | Native `backgroundMaterial: 'mica'`/`vibrancy` to avoid transparent window `backdrop-filter` compositing glitches. |
| **Mascot Animation** | **Canvas 2D Sprite Sheets (8–12 FPS)** | Maximum community contributor accessibility (open PNG/SVG format). Throttled to 8–12 FPS (0 FPS when idle/hidden) for 0% CPU drain. |
| **LLM Unified SDK** | **Vercel AI SDK (`ai`)** | Uniform streaming, model routing, and tool calling across OpenAI, Anthropic, Gemini, and Ollama/LM Studio. |
| **MCP Integration** | `@modelcontextprotocol/sdk` | Official Model Context Protocol client using HTTP transport + OAuth for community tools. |
| **Email & Calendar** | `google-auth-library` + `ImapFlow` | Lightweight targeted Google OAuth library + modern promise-based `ImapFlow`. |
| **Local Storage** | `better-sqlite3` + `electron-store` | Fast local SQLite database for event logs & time tracking; `electron-store` for app preferences. |
| **Security Vault** | **Electron Native `safeStorage`** | Encrypted DPAPI (Windows) and Keychain (macOS) storage with **zero native C++ build friction**. |

---

## 🚀 Step-by-Step Implementation Roadmap for AI Agents

### Phase 1: Desktop Shell & 3-Step Setup Window
- [ ] Initialize project using `electron-vite` with React, TypeScript, and Vite.
- [ ] Build 3-Step Onboarding Setup Window (Assistant Name, Avatar Selection, BYOK Keys, Work & Breakfast Schedule).
- [ ] Build transparent, frameless, floating overlay window with click-through support (`win.setIgnoreMouseEvents`).
- [ ] Implement System Tray icon & right-click context menu (Settings, Pause, Hide, Quit).

### Phase 2: Canvas 2D Sprite Engine & Lifestyle Nudges
- [ ] Build Canvas 2D sprite renderer with 8–12 FPS state loop (`idle`, `thinking`, `speaking`, `working`, `resting`).
- [ ] Build 1-click Stopwatch component for project time tracking backed by `better-sqlite3`.
- [ ] Implement Daily Schedule Manager (9:00 AM breakfast reminder, hydration nudges, evening recap).

### Phase 3: BYOK Security Vault & Multi-LLM Router
- [ ] Securely store API credentials using Electron's native `safeStorage`.
- [ ] Integrate Vercel AI SDK (`ai`) for model routing and tool calls.

### Phase 4: Gmail & Calendar OAuth PKCE Integration
- [ ] Build Google OAuth 2.0 PKCE local loopback flow with `google-auth-library`.
- [ ] Add `ImapFlow` fallback for direct IMAP email fetching.
- [ ] Implement background polling service for upcoming events & urgent unread emails.

---

## 🤖 Prompt to Paste into an AI Agent

```text
You are an expert full-stack desktop software engineer. You are building "Mochi", an open-source, BYOK animated desktop companion app. 

Follow the refined specifications in AGENT_INSTRUCTIONS.md:
1. Initialize the project using `electron-vite` with React, TypeScript, and Vite.
2. Build the 3-Step Onboarding Setup Window (Assistant Custom Name, Avatar Selector, BYOK API Keys, Lifestyle Schedule).
3. Build a transparent, frameless, always-on-top desktop window containing an 8-12 FPS Canvas 2D sprite mascot renderer.
4. Use Electron native `safeStorage` for the local BYOK security vault.
5. Integrate Vercel AI SDK (`ai`) for LLM routing and `better-sqlite3` for local project time logging.

Start by setting up `electron-vite` project scaffolding and the Onboarding Setup Window.
```
