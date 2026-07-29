# 🏛️ Mochi — Complete End-to-End System Architecture

> **Master Architecture Specification**: This document details the complete end-to-end system architecture uniting the **Desktop Companion App**, the **24/7 Cloud Brain Engine**, and the **Cloud Web Dashboard (`app.mochi.ai`)**.

---

## 🗺️ 1. Complete System Architecture Diagram

```
 ┌─────────────────────────────────────────────────────────────────────────────────────────────┐
 │                                 USER DESKTOP ENVIRONMENT                                    │
 │                                                                                             │
 │   ┌─────────────────────────────────────────────────────────────────────────────────────┐   │
 │   │                 MOCHI DESKTOP COMPANION APP (Electron + React)                      │   │
 │   │                                                                                     │   │
 │   │   ┌─────────────────────┐   ┌───────────────────────┐   ┌───────────────────────┐   │   │
 │   │   │ Canvas 2D Mascot    │   │ 3-Step Setup &        │   │ 1-Click Stopwatch &   │   │   │
 │   │   │ Sprite Engine       │   │ Settings Modal        │   │ Project Tracker       │   │   │
 │   │   │ (8-12 FPS Idle)     │   │                       │   │                       │   │   │
 │   │   └──────────┬──────────┘   └───────────┬───────────┘   └───────────┬───────────┘   │   │
 │   │              │                          │                           │               │   │
 │   │              └──────────────────────────┼───────────────────────────┘               │   │
 │   │                                         ▼                                           │   │
 │   │                        ┌─────────────────────────────────┐                          │   │
 │   │                        │ Local Storage Adapter (Offline) │                          │   │
 │   │                        │ • Native safeStorage (Vault)    │                          │   │
 │   │                        │ • Local better-sqlite3 DB       │                          │   │
 │   │                        └────────────────┬────────────────┘                          │   │
 │   └─────────────────────────────────────────┼───────────────────────────────────────────┘   │
 └─────────────────────────────────────────────┼───────────────────────────────────────────────┘
                                               │ Secure WebSockets (wss://) & REST API
                                               ▼
 ┌─────────────────────────────────────────────────────────────────────────────────────────────┐
 │                                   MOCHI CLOUD PLATFORM                                      │
 │                                                                                             │
 │   ┌─────────────────────────────┐   ┌───────────────────────────┐   ┌───────────────────┐   │
 │   │ Mochi Cloud Web App         │   │ 24/7 Cloud Brain Worker   │   │ PostgreSQL DB     │   │
 │   │ (app.mochi.ai - Next.js)    │   │ (Background Cron & Push)  │   │ (Supabase / Auth) │   │
 │   │ • Cross-Device Analytics    │   │ • 24/7 Gmail & Cal Hooks  │   │ • User Profiles   │   │
 │   │ • Web Lifestyle Dashboard   │   │ • WebSocket Push Dispatch │   │ • Time Logs Sync  │   │
 │   └──────────────┬──────────────┘   └─────────────┬─────────────┘   └─────────┬─────────┘   │
 │                  │                                │                           │             │
 │                  └────────────────────────────────┼───────────────────────────┘             │
 └───────────────────────────────────────────────────┼─────────────────────────────────────────┘
                                                     │
                                                     ▼
 ┌─────────────────────────────────────────────────────────────────────────────────────────────┐
 │                                 THIRD-PARTY PROVIDER APIs                                   │
 │                                                                                             │
 │   ┌───────────────────────┐   ┌───────────────────────────┐   ┌─────────────────────────┐   │
 │   │ Multi-LLM Routers     │   │ Google Workspace APIs     │   │ Community MCP Plugins   │   │
 │   │ • OpenAI / Anthropic  │   │ • Gmail Pub/Sub Webhooks  │   │ • Slack, Spotify,       │   │
 │   │ • Gemini / Ollama     │   │ • Google Calendar API     │   │   Notion, Linear        │   │
 │   └───────────────────────┘   └───────────────────────────┘   └─────────────────────────┘   │
 └─────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🧩 2. Component-by-Component Breakdown

### Component A: Desktop Overlay Companion (`/apps/desktop`)
- **Shell**: Built with `electron-vite` for HMR across main, renderer, and preload processes.
- **Window Overlay**: Frameless, transparent, click-through window (`setIgnoreMouseEvents` with hover IPC detection).
- **Mascot Animation Engine**: Canvas 2D sprite sheets running at 8–12 FPS idle (throttled to 0 FPS when hidden).
- **Local Security Vault**: Electron native `safeStorage` (encrypted DPAPI on Windows, Keychain on macOS).

### Component B: 24/7 Cloud Brain Engine (`/services/cloud-brain`)
- **24/7 Background Workers**: Runs serverless background cron jobs and Gmail/Google Calendar Pub/Sub webhooks.
- **WebSocket Gateway (`wss://api.mochi.ai`)**: Maintains real-time duplex connections to desktop clients.
- **"While You Were Away" Generator**: Synthesizes offline activity into a 15-second audio/text briefing whenever the user boots their PC.

### Component C: Cloud Web Dashboard (`/apps/web`)
- **Web App Domain**: `https://app.mochi.ai` (Built with Next.js / React).
- **Features**: View project time logs, manage daily lifestyle schedules (breakfast, work hours), invite team members, and manage avatar skins.

### Component D: Unified Storage & Auth Adapter (`/packages/core`)
- **Storage Interface**: Abstract `StorageAdapter` with two implementations:
  1. `LocalStorageAdapter`: Writes to local `better-sqlite3` and `safeStorage` (for free BYOK users).
  2. `CloudStorageAdapter`: Syncs to Supabase PostgreSQL over REST/WebSockets (for Mochi Cloud subscribers).

---

## ⚡ 3. Real-Time Data Flow Scenarios

### Scenario 1: 9:00 AM Breakfast & Morning Briefing
1. User boots PC at 9:00 AM.
2. Desktop App launches and connects to `wss://api.mochi.ai`.
3. 24/7 Cloud Brain detects user connection and sends morning payload:
   - Schedule: 3 meetings today.
   - Urgent Emails: 2 unread emails summarized.
   - Habit Nudge: 9:00 AM Breakfast.
4. Mochi mascot animates with a coffee cup icon and displays speech bubble:
   > *"Good morning! Did you grab breakfast? You have 3 meetings today starting at 10:30 AM."*

### Scenario 2: 1-Click Project Stopwatch
1. User clicks Mochi desktop mascot and selects "Start Project 3".
2. Stopwatch begins locally; Mochi animates wearing glasses and typing on a mini laptop.
3. Time log entries update `better-sqlite3` locally and push delta updates to `app.mochi.ai` for cloud analytics.

---

## 📁 Monorepo Workspace Structure

To support both the Desktop App, Cloud Web App, and Cloud Brain cleanly:

```text
mochi/
├── apps/
│   ├── desktop/          # Electron + Vite + React Overlay App
│   └── web/              # Next.js Cloud Dashboard (app.mochi.ai)
├── services/
│   └── cloud-brain/      # 24/7 Cloud Worker, WebSockets & Webhook service
├── packages/
│   ├── core/             # Shared LLM router, Adapter interfaces & Types
│   └── db/               # Prisma / Supabase database schemas
├── AGENT_INSTRUCTIONS.md # AI Agent Kickoff Specs
├── FEASIBILITY_AUDIT.md  # Technical Risk Mitigations
├── SCALING_STRATEGY.md   # Platform Scaling & Monetization
└── README.md             # Project Showcase
```
