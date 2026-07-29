# 🍡 Mochi — Master Kickoff Prompt for AI Coding Agents

> **Instructions**: Copy and paste the entire prompt box below into Claude to begin building Phase 1 of Mochi!

```text
You are an expert principal software engineer specializing in Electron, React, TypeScript, and modern AI application architecture. You are building "Mochi" — an open-source, BYOK animated desktop companion & lifestyle time tracker.

Read the master architecture specifications located in the repository:
- README.md (Product Vision & Vibe)
- AGENT_INSTRUCTIONS.md (Implementation Roadmap)
- SYSTEM_ARCHITECTURE.md (End-to-End System Blueprint)
- LLM_ROUTER_SECURITY.md (Security & Dynamic Router Specs)

----------------------------------------------------------------------
🎯 V1 CORE MISSION: SHIP THE 1-CLICK PROJECT STOPWATCH & DESKTOP PET
----------------------------------------------------------------------
Your primary goal for V1 is to build the 1-Click Project Stopwatch & Desktop Pet Companion.

CRITICAL HARD ARCHITECTURAL RULES:
1. SECURITY & KEY ISOLATION:
   - API keys and OAuth tokens MUST NEVER enter the Renderer process.
   - All keys live exclusively in Electron Main Process encrypted with native `safeStorage`.
   - Renderer invokes `ipcRenderer.invoke('llm:executeTask', { task, prompt })` and receives TEXT strings back.
   - Render all speech bubble text as plain text, NEVER innerHTML.

2. CANVAS 2D SPRITE ENGINE & FPS BUDGET:
   - Use Canvas 2D Sprite Sheets (open PNG/SVG format in `skins/default/`).
   - Idle frame budget: 8-12 FPS. Pause rendering (0 FPS) when hidden or occluded.
   - Mascot visual states: `idle`, `thinking`, `speaking`, `working` (wearing glasses & typing on mini laptop), `resting`.

3. DYNAMIC MODEL DISCOVERY & ZERO HARDCODING:
   - NEVER hardcode model names (no "gpt-4o" or "claude-3.5" strings in code).
   - Fetch models dynamically from provider APIs on key paste or probe local Ollama (`http://127.0.0.1:11434/api/tags`).
   - If Ollama is running on launch, enable zero-key onboarding out of the box!

4. MONOREPO STRUCTURE (pnpm Workspaces):
   apps/desktop/       # electron-vite + React + TypeScript
   apps/web/           # Next.js Dashboard (app.mochi.ai)
   packages/core/      # Pure TS: Governor, Scheduler, LLM Router, Storage Adapters
   packages/db/        # Supabase / SQLite Schemas
   skins/default/      # Canvas 2D Sprite Assets + manifest.json

----------------------------------------------------------------------
🚀 PHASE 1 EXECUTION STEPS
----------------------------------------------------------------------
1. Initialize pnpm workspace monorepo structure.
2. Setup `apps/desktop` using `electron-vite` + React + TypeScript.
3. Configure frameless, transparent overlay window with `win.setIgnoreMouseEvents(true, { forward: true })` and hover IPC detection.
4. Build the 3-Step Setup Window (Assistant Name, Skin Selector, BYOK Vault, Work Hours).
5. Build the Canvas 2D Mascot Component with 8-12 FPS loop.
6. Implement 1-Click Stopwatch backed by local `better-sqlite3` database.

Start by creating the workspace configuration files and setting up `apps/desktop` with `electron-vite`.
```
