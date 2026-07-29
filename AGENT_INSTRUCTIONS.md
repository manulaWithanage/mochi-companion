# 🍡 Mochi — AI Agent Master Specification & Implementation Plan

> **Instructions for AI Coding Agents**: This document defines the architectural goals, core requirements, technical stack, detailed objectives, security plan, and step-by-step roadmap for building **Mochi**, an open-source, BYOK animated desktop companion.

---

## 🎯 Primary Project Objectives

### 1. 🤖 Animated Desktop Companion Engine
- Build a frameless, transparent, click-through desktop overlay window housing a reactive mascot.
- Mascot changes visual animation states dynamically based on activity: `idle`, `thinking`, `speaking`, `alert`, `sleeping`, `focused`, `working`, `resting`.
- Speech bubble overlay for mascot responses, daily debriefs, lifestyle nudges, and calendar notifications.

### 2. ⏱️ Lifestyle Routine, Time Tracker & Health Buddy
- **Project Stopwatch & Time Logging**: Track active work time per project/task with 1-click controls.
- **Daily Lifestyle Rhythm**: Programmed daily schedules (e.g., 9:00 AM breakfast reminder, lunch breaks, end-of-day wind-down).
- **Health & Wellness Micro-Nudges**: Gentle hourly reminders for hydration, eye rest (20-20-20 rule), and posture checks.
- **Gamified Mascot Activity**: Mascot types on a mini laptop during work timers and sips coffee during break reminders.

### 3. 🔑 Privacy-First & BYOK (Bring Your Own Key)
- Zero centralized telemetry, tracking, or mandatory backend server.
- Support **OpenAI (GPT-4o)**, **Anthropic (Claude 3.5)**, **Google Gemini**, and **Local Ollama / LM Studio**.
- Store all API keys and OAuth tokens 100% locally in system keychain (`keytar` / native OS credential manager).

### 4. 📧 Zero-Audit Gmail & Calendar Integration Strategy
- **Local OAuth 2.0 PKCE**: Users provide their own free Google Cloud Desktop Client ID/Secret. Enables Gmail & Google Calendar access in "Developer/Testing" mode with **$0 Google audit fees**.
- **Local Loopback Redirect**: Handles OAuth login flow seamlessly via `http://localhost:3000/callback` in the user's default web browser.
- **IMAP / App Password Fallback**: Supports direct encrypted local IMAP connections for users with 2FA enabled.

### 5. 🎨 Customization & Open-Core Roadmap
- Allow users to rename their companion avatar (e.g., Navi, Barkley, Jarvis, Mochi).
- Support community skin packs (Rive, Lottie, WebGL pixel art).
- Maintain 100% free open-source core with optional future SaaS hosting & avatar marketplace add-ons.

---

## 🛠️ Recommended Tech Stack

| Layer | Recommended Technology | Why |
| :--- | :--- | :--- |
| **Desktop Shell** | **Electron + Vite** | Easiest cross-platform setup, full Node.js API ecosystem (`keytar`, `googleapis`, `node-imap`), 100% transparent window support. |
| **Frontend Framework** | **React + TypeScript** | Robust component architecture for speech bubbles, time-tracker widgets, settings modals, and mascot state machine. |
| **Styling Engine** | **Glassmorphic Vanilla CSS** | Sleek dark mode styling, custom micro-animations, transparent window support. |
| **Mascot Animation** | **Rive / WebGL / Canvas** | 60fps state-driven interactive character animations. |
| **Integrations** | `googleapis` + `node-imap` | Official Google OAuth 2.0 PKCE client & fallback IMAP email fetcher. |
| **Local Key Vault** | `keytar` / OS Credential Vault | Encrypted native local storage for LLM API keys & OAuth refresh tokens. |

---

## 🚀 Step-by-Step Implementation Roadmap for AI Agents

### Phase 1: Desktop Shell & Floating Avatar (Foundation)
- [ ] Initialize Electron app with Vite + React + TypeScript.
- [ ] Configure main window properties: `transparent: true`, `frame: false`, `alwaysOnTop: true`, `resizable: false`.
- [ ] Implement global hotkeys (e.g., `Ctrl+Shift+M` or `Cmd+Shift+M` to summon/hide Mochi).
- [ ] Create basic floating sprite component rendering animated mascot states (`idle`, `thinking`, `speaking`, `working`).
- [ ] Implement floating speech bubble UI for mascot messages.

### Phase 2: Lifestyle Routine & Project Time Tracker
- [ ] Build 1-click Stopwatch component for tracking active work hours per project.
- [ ] Implement local SQLite time logging schema (Project Name, Start Time, Duration, Tags).
- [ ] Build Customizable Daily Schedule Manager (Breakfast at 9:00 AM, Lunch at 1:00 PM, Stretch reminders every 60 min).
- [ ] Create Daily Time Analytics Summary widget (Pie chart of time spent per project).

### Phase 3: BYOK Settings Vault & Multi-LLM Router
- [ ] Build a sleek Settings Modal / Dashboard window.
- [ ] Create fields for API Keys: OpenAI, Anthropic, Google Gemini, and Ollama endpoint (`http://localhost:11434`).
- [ ] Add settings for Custom Assistant Name (default: "Mochi").
- [ ] Securely store API keys locally in OS Keychain using `keytar`.
- [ ] Build unified LLM Router class with model switching support.

### Phase 4: Gmail & Calendar OAuth PKCE Integration
- [ ] Build Google OAuth 2.0 PKCE local loopback flow (`http://localhost:3000/callback`).
- [ ] Add Google Cloud Desktop Client ID/Secret input fields in settings with 2-minute step-by-step setup guide link.
- [ ] Implement background polling service (running every 15 mins) for upcoming events & urgent unread emails.
- [ ] Implement daily morning briefing generator.

---

## 🤖 Prompt to Paste into an AI Agent

```text
You are an expert full-stack desktop software engineer. You are building "Mochi", an open-source, BYOK animated desktop companion app. 

Follow the specifications in AGENT_INSTRUCTIONS.md:
1. Initialize the desktop project using Electron with React, TypeScript, and Vite.
2. Build a transparent, frameless, always-on-top desktop overlay window containing an animated floating mascot.
3. Build the Project Stopwatch & Lifestyle Routine module (breakfast reminders, hydration nudges, project time logs).
4. Build a BYOK (Bring Your Own Key) settings panel for OpenAI, Gemini, Anthropic, Ollama, and local Google OAuth credentials.
5. Ensure all user credentials and API keys are stored 100% locally in the system keychain.

Start by setting up the project dependencies and the transparent Electron main window.
```
