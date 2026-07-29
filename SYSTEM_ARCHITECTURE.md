# 🏛️ Mochi — Master System Architecture (v2 Corrected)

> **Master Architecture Specification**: This document details the corrected end-to-end system architecture uniting the **Desktop Companion (Local Brain)**, **Supabase Realtime Cloud Sync**, and **Cloud Web Dashboard (`app.mochi.ai`)**.

---

## 💡 The Architectural Insight

- **Strict Privacy & BYOK Integrity**: All API keys, OAuth refresh tokens, and Gmail/Calendar email bodies remain **100% strictly local** on the user's desktop inside Electron's native `safeStorage`.
- **Zero CASA Audit Exposure & $0 Server LLM Costs**: Mochi Cloud stores **NO Google OAuth tokens or mail bodies**. All email/calendar LLM parsing originates strictly from the local desktop client.
- **2-Second Unlock Briefing**: The briefing doesn't need to compute while the PC is off. Upon screen unlock, the desktop client fetches cached calendar data plus one fresh local API call, delivering a full briefing within 2 seconds.

> **The contradiction this architecture exists to avoid.** A 24/7 cloud brain that produces email summaries while the PC is off must hold the user's Google refresh token, fetch mail bodies onto your servers, and call an LLM with *someone's* key — the user's key is in their local `safeStorage` on a machine that is switched off. That design cannot coexist with local-vault BYOK, and it triggers CASA Tier 2 plus GDPR data-controller obligations. Desktop-originated processing is the resolution. **Any proposal that moves mail content or OAuth tokens server-side reopens all of it.**

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
                                    ──> [ Logged in Local better-sqlite3 ]        ← V1
                                    ──> [ Synced to app.mochi.ai Dashboard ]      ← V1.5
```

> **Scope boundary.** V1 is **local only**. `apps/web` is a placeholder package with no Next.js scaffold, and Supabase sync lands in **V1.5** once the desktop app is proven. `CLAUDE_KICKOFF_PROMPT.md` is authoritative on this.

### Why Stopwatch is the Ideal V1:
- 🟢 **Zero Compliance/CASA Risk**: Time logging carries zero privacy weight — no Google OAuth, no restricted scopes, no assessment, no GDPR exposure.
- 🟢 **Zero LLM Cost**: No inference at all, so no BYOK requirement and no spend risk during onboarding.
- 🟢 **Cannot Annoy The User**: Entirely user-initiated. No interruption risk, which is the failure mode that gets desktop pets uninstalled.
- 🟢 **Instant Utility & Delight**: Users see immediate visual value as Mochi works alongside them.
- 🟢 **Proves the Sync Layer (V1.5)**: Validates Supabase Realtime synchronization carrying data that has zero compliance weight, before Google OAuth is ever introduced.

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

**Hard rule:** `packages/core` must not import `electron`, `next`, `better-sqlite3`, `fs`, or any Node built-in, and performs no network or disk I/O. It defines interfaces and pure logic; `apps/desktop` implements them (`StorageAdapter` in core → `SqliteStorageAdapter` in desktop). If a test needs an Electron window, the logic is in the wrong package.

---

## 🔔 4. Push Notification Path & Its Expiry Trap

```
Gmail ──> Pub/Sub ──> services/push-relay ──> Supabase Realtime ──> Desktop
                       {emailAddress, historyId}                      │
                       (opaque ID only, never content)                │
                                                                      ▼
                                            desktop calls history.list(historyId)
                                            and fetches the message itself
```

The relay learns **that** something happened, never **what**. Content is fetched by the desktop with the desktop's own token.

**⚠️ `users.watch()` expires every 7 days.** It is not a set-and-forget webhook — it must be re-registered weekly or push silently stops with no error surfaced anywhere.

- The **desktop** registers and renews the watch. If the relay held the token to renew it, that alone would trigger CASA.
- Handle the "machine was off for 8 days" case explicitly: detect the lapsed watch on launch, re-register, and backfill via `history.list` from the last known `historyId`.
- Google Calendar push channels carry the same expiry constraint.

Push is an **optimisation, never the only path.** Polling must remain as a fallback so a dead watch degrades to slower updates rather than silence.
