# 📈 Mochi — Scaling Strategy & 24/7 Cloud Brain Architecture

> **Executive Summary**: By implementing **Option 2 (Heavy Cloud Brain + Thin Desktop Avatar)**, Mochi runs **24/7 in the cloud**. Even when the user's computer is closed or turned off, the cloud brain continues triaging emails, monitoring calendar changes, and organizing tasks. Upon booting their PC, the desktop avatar receives a 24/7 catch-up briefing over WebSockets.

---

## ⚡ 1. The 24/7 Cloud Brain Architecture (Option 2)

```
   24/7 Cloud Background Service                         User Desktop PC
 ┌──────────────────────────────────────┐             ┌─────────────────────────────┐
 │           MOCHI CLOUD BRAIN          │             │     THIN DESKTOP AVATAR     │
 │  (Serverless / Worker Microservices) │  WebSockets │ (Electron + Canvas Engine)  │
 │                                      │ ──────────> │                             │
 │ • 24/7 Gmail & Outlook Webhooks      │   (Push    │ • Animated Avatar Mascot    │
 │ • 24/7 Calendar Meeting Monitor      │ Notifications│ • Speech Bubbles & Sounds  │
 │ • Daily Schedule & Lifestyle Worker  │  & Briefings│ • 1-Click Project Stopwatch │
 └──────────────────────────────────────┘             └─────────────────────────────┘
```

---

## 🌟 Why Option 2 is a Game-Changer for Users & SaaS Monetization

### 1. 📬 "While You Were Away" Intelligent Catch-Up

- When the user turns on their PC or wakes up their laptop, the thin desktop avatar immediately connects to `wss://api.mochi.ai`.
- Mochi animates cheerfully and delivers an instant briefing:
  > _"Good morning! While you were offline, I processed 5 emails, drafted 2 replies, and your first meeting is in 30 minutes. Let's grab breakfast!"_

### 2. ⚡ Ultra-Low Desktop Resource Footprint

- All heavy email parsing, vector searching, and background calendar polling happen on cloud servers.
- The desktop avatar runs with **near 0% CPU and low memory**, ensuring laptop battery lasts all day and fans stay silent.

### 3. 💰 Perfect SaaS Business Model ($5 - $12/month)

- Running 24/7 cloud workers per user provides **massive tangible value**, making users happy to pay a monthly subscription.
- **Freemium Strategy**:
  - **Free Tier**: Local Desktop companion (runs background polling only while PC is awake).
  - **Pro Tier ($7/mo)**: 24/7 Cloud Brain with 24/7 email webhooks, instant WebSocket push alerts, and cross-device cloud sync.

---

## 🛠️ 24/7 Cloud Brain Tech Stack

- **Cloud Workers**: Cloudflare Workers / Node.js Serverless Microservices
- **Real-Time Push**: WebSockets (`wss://`) & Server-Sent Events (SSE)
- **Email Webhooks**: Gmail Pub/Sub & Microsoft Graph Webhooks
- **Database & Queue**: PostgreSQL (Supabase) + Redis BullMQ queue for 24/7 background jobs
