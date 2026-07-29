# 🏛️ Mochi — Master System Architecture (v2 Corrected)

> **Master Architecture Specification**: This document details the corrected end-to-end system architecture uniting the **Desktop Companion (Local Brain)**, **Supabase Realtime Cloud Sync**, and **Cloud Web Dashboard (`app.mochi.ai`)**.

---

## 💡 The Architectural Insight

- **Strict Privacy & BYOK Integrity**: All API keys, OAuth refresh tokens, and Gmail/Calendar email bodies remain **100% strictly local** on the user's desktop inside Electron's native `safeStorage`.
- **Zero CASA Audit Exposure & $0 Server LLM Costs**: Mochi Cloud stores **NO Google OAuth tokens or mail bodies**. All email/calendar LLM parsing originates strictly from the local desktop client.
- **2-Second Unlock Briefing**: The briefing doesn't need to compute while the PC is off. Upon screen unlock, the desktop client fetches cached calendar data plus one fresh local API call, delivering a full briefing within 2 seconds.

---

## 🗺️ 1. Complete System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐        ┌─────────────────────────────────────────────────────────────┐
│                 DESKTOP COMPANION (LOCAL BRAIN)             │        │                  MOCHI CLOUD PLATFORM                       │
│                 electron-vite + React + TypeScript          │        │               Next.js + Supabase Realtime                   │
├─────────────────────────────────────────────────────────────┤        ├─────────────────────────────────────────────────────────────┤
│ • 8–12 FPS Canvas Sprite Engine (Idle, Working, Resting)    │        │ • Web Dashboard (app.mochi.ai)                              │
│ • Local safeStorage Vault: LLM Keys + OAuth Refresh Tokens  │ Supa-  │ • Project Time Logs, Routines, & Task Analytics             │
│ • Direct Local Gmail & Calendar Fetch (google-auth/ImapFlow)│ base   │ • User Profiles & Settings Sync                             │
│ • ALL LLM Calls & Context Processing Originate Here         │ Real-  │ • Simple Push Relay: Gmail Pub/Sub → {historyId} broadcast  │
│ • Notification Governor, Fullscreen Suppressor & Scheduler  │ time   │                                                             │
│ • Local better-sqlite3 Event Log & Cache                    │        │ ✗ NO Mail Bodies  ✗ NO OAuth Tokens  ✗ NO LLM Keys            │
└─────────────────────────────────────────────────────────────┘        └─────────────────────────────────────────────────────────────┘
```

---

## 🚀 2. V1 Anchor Feature Focus: 1-Click Project Stopwatch

The **1-Click Project Stopwatch** is the core anchor feature for V1:

```
[ Click Mascot ] ──> [ Timer Starts ] ──> [ Mascot Dons Glasses & Types on Mini Laptop ]
                                    ──> [ Logged in Local better-sqlite3 ]
                                    ──> [ Synced to app.mochi.ai Dashboard ]
```

### Why Stopwatch is the Ideal V1:
- 🟢 **Zero Compliance/CASA Risk**: Time logging carries zero privacy weight.
- 🟢 **Instant Utility & Delight**: Users see immediate visual value as Mochi works alongside them.
- 🟢 **Proves the Sync Layer**: Validates Supabase Realtime synchronization between the Desktop App and `app.mochi.ai` web dashboard before introducing Google OAuth.

---

## 📁 3. Refined Monorepo Directory Layout

```text
mochi/
├── apps/
│   ├── desktop/          # Electron + Vite Overlay Companion (Transparent Mascot)
│   └── web/              # Next.js Cloud Dashboard (app.mochi.ai)
├── services/
│   └── push-relay/       # Lightweight endpoint: Gmail Pub/Sub → Supabase Realtime broadcast
├── packages/
│   ├── core/             # Pure TS: Governor, Scheduler, LLM Router, Types (No Electron/Next deps)
│   ├── mcp/              # MCP Client (HTTP + OAuth transport)
│   └── db/               # Supabase Database Schemas
├── skins/
│   └── default/          # Canvas 2D Sprite Sheets + manifest.json
└── README.md             # Project Showcase
```
