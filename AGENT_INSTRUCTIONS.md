# 🍡 Mochi — AI Agent Master Specification & Implementation Plan

> **Instructions for AI Coding Agents**: This document defines the architectural goals, core requirements, technical stack, detailed objectives, security plan, and step-by-step roadmap for building **Mochi**, an open-source, BYOK animated desktop companion.

---

## 🎯 Primary Project Objectives

### 1. 🤖 Animated Desktop Companion Engine
- Build a frameless, transparent, click-through desktop overlay window housing a reactive mascot.
- Mascot uses **Canvas 2D Sprite Sheets** with low-overhead 8–12 FPS idle animation (0 FPS when occluded/idle to conserve CPU/battery).
- Visual states: `idle`, `thinking`, `speaking`, `alert`, `sleeping`, `focused`, `working`, `resting`.
- Speech bubble overlay for mascot responses, daily debriefs, lifestyle nudges, and calendar notifications.

### 2. ⏱️ Lifestyle Routine, Time Tracker & Health Buddy
- **Project Stopwatch & Time Logging**: Track active work time per project/task with 1-click controls.
- **Daily Lifestyle Rhythm**: Programmed daily schedules (e.g., 9:00 AM breakfast reminder, lunch breaks, end-of-day wind-down).
- **Health & Wellness Micro-Nudges**: Gentle hourly reminders for hydration, eye rest (20-20-20 rule), and posture checks.
- **Gamified Mascot Activity**: Mascot types on a mini laptop during work timers and sips coffee during break reminders.

### 3. 🔑 Privacy-First & BYOK (Bring Your Own Key)
- Zero centralized telemetry, tracking, or mandatory backend server.
- Support **OpenAI (GPT-4o)**, **Anthropic (Claude 3.5)**, **Google Gemini**, and **Local Ollama / LM Studio**.
- Store all API keys and OAuth tokens 100% locally using Electron's native `safeStorage` (Windows DPAPI / macOS Keychain) with zero native C++ build friction.

### 4. 📧 Zero-Audit Gmail & Calendar Integration Strategy
- **Local OAuth 2.0 PKCE**: Users provide their own free Google Cloud Desktop Client ID/Secret via `google-auth-library`. Enables Gmail & Google Calendar access in "Developer/Testing" mode with **$0 Google audit fees**.
- **Local Loopback Redirect**: Handles OAuth login flow seamlessly via `http://localhost:3000/callback` in the user's default web browser.
- **ImapFlow Fallback**: Uses modern, actively maintained `ImapFlow` for direct encrypted local IMAP connections.

### 5. 🎨 Customization & Open-Core Roadmap
- Open Canvas 2D sprite sheet format so the community can contribute custom mascot skins without paid software.
- Allow users to rename their companion avatar (e.g., Navi, Barkley, Jarvis, Mochi).
- Maintain 100% free open-source core with optional future SaaS hosting & avatar marketplace add-ons.

---

## 🛠️ Refined Production Tech Stack

| Layer | Recommended Technology | Why |
| :--- | :--- | :--- |
| **Desktop Shell** | `electron-vite` | Unified build pipeline for main, renderer, and preload scripts with seamless HMR across process boundaries. Native transparent overlay window support. |
| **Frontend Framework** | **React + TypeScript** | Type-safe component architecture for speech bubbles, time trackers, settings modals, and mascot state rendering. |
| **Styling & Materials** | **CSS Modules + Native Windows/Mac Materials** | Native `backgroundMaterial: 'mica'`/`vibrancy` to avoid transparent window `backdrop-filter` compositing glitches. |
| **Mascot Animation** | **Canvas 2D Sprite Sheets (8–12 FPS)** | Maximum community contributor accessibility (open PNG/SVG format). Throttled to 8–12 FPS (0 FPS when idle/hidden) for zero CPU/battery drain. |
| **LLM Unified SDK** | **Vercel AI SDK (`ai`)** | Uniform streaming, model routing, and tool calling across OpenAI, Anthropic, Gemini, and Ollama/LM Studio. |
| **MCP Integration** | `@modelcontextprotocol/sdk` | Official Model Context Protocol client using HTTP transport + OAuth for community tools. |
| **Email & Calendar** | `google-auth-library` + `ImapFlow` | Lightweight targeted Google OAuth library + modern promise-based `ImapFlow` (replacing stale `node-imap`). |
| **Local Storage** | `better-sqlite3` + `electron-store` | Fast local SQLite database for event logs & time tracking; `electron-store` for app preferences. |
| **Security Vault** | **Electron Native `safeStorage`** | Encrypted DPAPI (Windows) and Keychain (macOS) storage with **zero native C++ (`keytar`) build friction**. |
| **Packaging & CI** | `electron-builder` + `electron-updater` | Production auto-updates and installer builds for Windows, macOS, and Linux. |
| **Testing** | `Vitest` + `Playwright` | Fast unit testing for LLM/store logic and Playwright for Electron E2E window testing. |

---

## 🚀 Step-by-Step Implementation Roadmap for AI Agents

### Phase 1: Desktop Shell & Floating Avatar (Foundation)
- [ ] Initialize project using `electron-vite` with React, TypeScript, and Vite.
- [ ] Configure main window properties: `transparent: true`, `frame: false`, `alwaysOnTop: true`, `resizable: false`.
- [ ] Implement global hotkeys (e.g., `Ctrl+Shift+M` or `Cmd+Shift+M` to summon/hide Mochi).
- [ ] Build Canvas 2D sprite renderer with 8–12 FPS state loop (`idle`, `thinking`, `speaking`, `working`).
- [ ] Implement floating speech bubble UI for mascot messages.

### Phase 2: Lifestyle Routine & Project Time Tracker
- [ ] Build 1-click Stopwatch component for tracking active work hours per project.
- [ ] Implement local `better-sqlite3` time logging schema (Project Name, Start Time, Duration, Tags).
- [ ] Build Customizable Daily Schedule Manager (Breakfast at 9:00 AM, Lunch at 1:00 PM, Stretch reminders every 60 min).
- [ ] Create Daily Time Analytics Summary widget (Pie chart of time spent per project).

### Phase 3: BYOK Security Vault & Multi-LLM Router
- [ ] Build Settings Modal window for API Keys (OpenAI, Anthropic, Gemini, Ollama) and Custom Mascot Name.
- [ ] Securely store credentials using Electron's native `safeStorage`.
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
2. Build a transparent, frameless, always-on-top desktop window containing an 8-12 FPS Canvas 2D sprite mascot renderer.
3. Use Electron native `safeStorage` for the local BYOK security vault (OpenAI, Gemini, Claude, Ollama).
4. Integrate Vercel AI SDK (`ai`) for LLM routing and `better-sqlite3` for local project time logging.
5. Create clean, modular code with clear documentation.

Start by setting up `electron-vite` project scaffolding and the transparent main desktop window.
```
