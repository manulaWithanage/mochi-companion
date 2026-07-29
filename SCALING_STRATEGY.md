# 📈 Mochi — Scaling Strategy & Hybrid Cloud Architecture

> **Executive Summary**: Mochi is designed with an **Adapter Pattern Architecture** that seamlessly supports both **100% Local BYOK Execution** and a future **Mochi Cloud Web App SaaS**. This allows zero-cost open-source deployment today while enabling effortless cloud data sync, cross-device access, and cloud hosting tomorrow.

---

## 🏗️ 1. Hybrid Storage & Cloud Architecture

By using an **Adapter Pattern** for Authentication and Data Storage, the React UI codebase compiles cleanly for both the **Desktop App** and the **Cloud Web App (`https://app.mochi.ai`)**:

```
                       ┌──────────────────────────────────────────────┐
                       │          Mochi Core React UI                 │
                       └──────────────────────┬───────────────────────┘
                                              │
                                   ┌──────────┴──────────┐
                                   │  Storage Interface  │
                                   └──────────┬──────────┘
                                              │
                     ┌────────────────────────┴────────────────────────┐
                     ▼                                                 ▼
     ┌───────────────────────────────┐                 ┌───────────────────────────────┐
     │ Local Storage Adapter (Free)  │                 │  Cloud Storage Adapter (SaaS) │
     │ • Local SQLite (better-sqlite)│                 │  • Cloud PostgreSQL / Supabase│
     │ • Native safeStorage Vault    │                 │  • Multi-Device Cloud Sync    │
     │ • Direct LLM API Calls (BYOK) │                 │  • Cloud Managed Proxy        │
     └───────────────────────────────┘                 └───────────────────────────────┘
```

---

## ☁️ 2. Cloud Web App Capabilities (Mochi Cloud SaaS)

When you launch the **Mochi Cloud Web App** tier:

1. **Cross-Device Cloud Synchronization**:
   - Time tracking logs, project stopwatch histories, and custom routine schedules sync automatically across Windows PCs, Macs, and Web Browsers.
2. **Zero-Setup Managed AI & OAuth**:
   - Non-technical users sign up with Google/Apple login without needing to generate Google Cloud keys or manage OpenAI API keys.
3. **Web Browser & PWA Access**:
   - Access the Mochi dashboard from any mobile or web browser (`app.mochi.ai`) to check daily productivity analytics and manage tasks on the go.

---

## 💼 3. Monetization Tier Evolution

```
 ┌─────────────────────────────────────────────────────────────────┐
 │ TIER 3: Mochi Enterprise / Teams ($15 - $25/user/mo)            │
 │ • Shared team workspace status, Slack bots, Enterprise SSO,     │
 │   Centralized compliance logs & organization dashboards         │
 ├─────────────────────────────────────────────────────────────────┤
 │ TIER 2: Mochi Cloud Web App & Sync ($5 - $9/mo)                 │
 │ • Managed cloud database, cross-device sync (Windows/Mac/Web),  │
 │   1-click OAuth, and Avatar Marketplace access                  │
 ├─────────────────────────────────────────────────────────────────┤
 │ TIER 1: Free Open-Source Core (100% Free Forever)               │
 │ • BYOK desktop client, local safeStorage vault, local SQLite    │
 └─────────────────────────────────────────────────────────────────┘
```

### Transition Steps for Developers
- Use `StorageAdapter` interface for all database operations (`getTasks()`, `saveTimeLog()`).
- Use `AuthAdapter` for user sessions (`LocalSession` vs `CloudSupabaseSession`).
- This guarantees zero code rewrites when launching the Cloud Web App tier!
