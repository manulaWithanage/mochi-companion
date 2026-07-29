# 🏛️ Mochi — Master System Architecture (v3 PKCE Deep-Link Pairing)

> **Master Architecture Specification**: This document details the complete end-to-end system architecture uniting the **Desktop Companion (Local Brain)**, **Supabase Realtime Cloud Sync**, **PKCE Deep-Link Handshake**, and **Cloud Web Dashboard (`app.mochi.ai`)**.

---

## 🔗 1. Seamless PKCE Deep-Link Pairing (`mochi://`)

To connect the Desktop App to `app.mochi.ai` in **1 click** (without typing email OTPs or copying tokens):

```
 Desktop Settings                         Browser (app.mochi.ai/link)
┌───────────────────────────┐           ┌─────────────────────────────────────────┐
│ [ Connect to Mochi Cloud ]│ ────────> │ • User signs in (Google/Apple 1-click)  │
│ • Generates deviceId      │           │ • Web mints short-lived pairing code    │
│ • Keeps PKCE verifier     │           │ • Redirects to mochi://linked?code=...  │
│   locally in main process │           └────────────────────┬────────────────────┘
└─────────────▲─────────────┘                                │
              │                                              │ OS Protocol Handshake
              └──────────────────────────────────────────────┘
                       Exchanges code + verifier -> Supabase Session Token
                       Stores token safely in Electron safeStorage
                       Speech Bubble: "Connected!" 🍡
```

### Why PKCE (Proof Key for Code Exchange) Security is Required:
- Any app on a user's machine can attempt to register the `mochi://` protocol scheme.
- PKCE generates a local `verifier` and `challenge = sha256(verifier)`.
- Redeeming the pairing code requires the local `verifier` (which NEVER left the Electron main process). This completely blocks malicious local apps from squatting the protocol or stealing accounts!

### Seamless Deep-Link Handshake Implementation:
```typescript
// main process (apps/desktop/src/main/index.ts)
app.setAsDefaultProtocolClient('mochi');

// Windows / Linux deep-link handler
app.on('second-instance', (_e, argv) => {
  const url = argv.find(arg => arg.startsWith('mochi://'));
  if (url) handleDeepLink(url);
});

// macOS deep-link handler
app.on('open-url', (e, url) => {
  e.preventDefault();
  handleDeepLink(url);
});
```

### Manual Fallback:
If protocol handlers are blocked by OS corporate policy:
- Display fallback code on web: *"Nothing happened? Enter code 4KP-92X at app.mochi.ai/link"*.

---

## 🗺️ 2. Complete System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐        ┌─────────────────────────────────────────────────────────────┐
│                 DESKTOP COMPANION (LOCAL BRAIN)             │        │                  MOCHI CLOUD PLATFORM                       │
│                 electron-vite + React + TypeScript          │        │               Next.js + Supabase Realtime                   │
├─────────────────────────────────────────────────────────────┤        ├─────────────────────────────────────────────────────────────┤
│ • 8–12 FPS Canvas Sprite Engine (Idle, Working, Resting)    │        │ • Web Dashboard (app.mochi.ai)                              │
│ • PKCE Deep-Link Protocol Handler (mochi://linked)          │ Supa-  │ • PKCE Pairing Endpoint (app.mochi.ai/link)                 │
│ • Local safeStorage Vault: LLM Keys + OAuth Refresh Tokens  │ base   │ • Project Time Logs, Routines, & Task Analytics             │
│ • Direct Local Gmail & Calendar Fetch (google-auth/ImapFlow)│ Real-  │ • User Profiles & Settings Sync                             │
│ • ALL LLM Calls & Context Processing Originate Here         │ time   │ • Simple Push Relay: Gmail Pub/Sub → {historyId} broadcast  │
│ • Notification Governor, Fullscreen Suppressor & Scheduler  │        │                                                             │
│ • Local better-sqlite3 Event Log & Cache                    │        │ ✗ NO Mail Bodies  ✗ NO OAuth Tokens  ✗ NO LLM Keys            │
└─────────────────────────────────────────────────────────────┘        └─────────────────────────────────────────────────────────────┘
```

---

## 🚀 3. V1 Anchor Feature Focus: 1-Click Project Stopwatch

The **1-Click Project Stopwatch** is the core anchor feature for V1:

```
[ Click Mascot ] ──> [ Timer Starts ] ──> [ Mascot Dons Glasses & Types on Mini Laptop ]
                                    ──> [ Logged in Local better-sqlite3 ]
                                    ──> [ Synced to app.mochi.ai Dashboard ]
```

---

## 📁 4. Refined Monorepo Directory Layout

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
