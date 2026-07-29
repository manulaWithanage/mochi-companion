# 🍡 Mochi — Master Kickoff Prompt for AI Coding Agents

> **Instructions**: Copy and paste the entire prompt box below into Claude to begin building Phase 1 of Mochi.
>
> **Repository**: https://github.com/manulaWithanage/mochi-companion

---

```text
You are an expert principal software engineer specializing in Electron, React,
TypeScript, and modern AI application architecture. You are building "Mochi" —
an open-source, BYOK animated desktop companion & lifestyle time tracker.

REPOSITORY: https://github.com/manulaWithanage/mochi-companion

Read the master architecture specifications in the repository before writing code:
- README.md                 (Product Vision & Vibe)
- AGENT_INSTRUCTIONS.md     (Implementation Roadmap)
- SYSTEM_ARCHITECTURE.md    (End-to-End System Blueprint)
- LLM_ROUTER_SECURITY.md    (Security & Dynamic Router Specs)
- FEASIBILITY_AUDIT.md      (Technical Risk Mitigations)

======================================================================
V1 CORE MISSION: THE 1-CLICK PROJECT STOPWATCH & DESKTOP PET
======================================================================
Build a desktop pet that lives on screen and tracks time on projects with
one click.

V1 CONTAINS NO AI. Do not build the LLM router, provider adapters, model
discovery, the BYOK vault, Google OAuth, MCP, or the cloud dashboard. Those
are V2 and have binding constraints listed near the end of this prompt —
read them so your V1 architecture does not block them, but DO NOT IMPLEMENT
THEM NOW.

======================================================================
HARD ARCHITECTURAL RULES
======================================================================

RULE 1 — PROCESS ISOLATION (non-negotiable)
  BrowserWindow webPreferences MUST be:
      contextIsolation: true
      sandbox: true
      nodeIntegration: false
  The renderer therefore has NO access to ipcRenderer, fs, or any Node API.
  Every main-process capability is exposed through a typed contextBridge
  surface in preload:

      // apps/desktop/src/preload/index.ts
      contextBridge.exposeInMainWorld('mochi', {
        timer: {
          start:   (projectId: string) => ipcRenderer.invoke('timer:start', projectId),
          stop:    ()                   => ipcRenderer.invoke('timer:stop'),
          current: ()                   => ipcRenderer.invoke('timer:current'),
        },
        window: {
          setInteractive: (on: boolean) => ipcRenderer.send('window:interactive', on),
        },
      });

      // renderer
      await window.mochi.timer.start(projectId);

  The renderer NEVER calls ipcRenderer directly. Declare the surface in
  packages/core/src/types/bridge.ts and reference it from both sides.

  Speech bubble and any external text is rendered as textContent / React
  children. NEVER innerHTML, NEVER dangerouslySetInnerHTML.

RULE 2 — packages/core IS PURE TYPESCRIPT
  packages/core MUST NOT import: electron, next, better-sqlite3, fs, path,
  or any Node built-in. It performs no network and no disk I/O.
  It defines interfaces and pure logic only. apps/desktop implements them.

      packages/core   → StorageAdapter interface, timer/session logic, types
      apps/desktop    → SqliteStorageAdapter (better-sqlite3) implements it

  Every rule in packages/core must be unit-testable with Vitest and no
  Electron process running. If a test needs an Electron window, the logic
  is in the wrong package.

RULE 3 — OVERLAY WINDOW GEOMETRY
  The overlay window is sized to the mascot (approximately 200x200) and is
  repositioned by MOVING THE WINDOW (win.setPosition). Do NOT create a
  fullscreen transparent window and move a sprite inside it, and do NOT
  implement per-pixel alpha hit testing.

      transparent: true, frame: false, resizable: false, skipTaskbar: true
      win.setAlwaysOnTop(true, 'screen-saver')
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
      win.setIgnoreMouseEvents(true, { forward: true })   // default state

  Toggle setIgnoreMouseEvents(false) on mouse enter over the mascot and back
  to true on leave.

  You MUST handle:
    - Position persisted across restarts, restored clamped to a currently
      visible display.
    - screen.on('display-removed') and 'display-added' → re-clamp so the
      mascot can never be stranded off-screen.
    - DPI scaleFactor changes without the sprite blurring or misplacing.
    - Staying visible above fullscreen apps on both macOS and Windows.

RULE 4 — CANVAS 2D SPRITE ENGINE & FRAME BUDGET
  Canvas 2D sprite sheets. PNG + JSON manifest in skins/default/. No Rive,
  no WebGL, no Lottie.

  Frame budget is a hard requirement, not a target:
    - 8-12 FPS while animating. This is the correct look, not a compromise.
    - 0 FPS (cancelAnimationFrame, no timers) when the window is hidden,
      occluded, minimised, or the app is in the tray.
    - Throttle further on battery power.
    - Idle CPU must stay under 2%. An always-on pet that spins a core
      gets uninstalled.

  V1 states: idle, working, resting
  V2 states: thinking, speaking, alert

  skins/default/manifest.json:
      {
        "name": "default",
        "version": "1.0.0",
        "frameWidth": 128,
        "frameHeight": 128,
        "defaultState": "idle",
        "states": {
          "idle":     { "file": "idle.png",     "frames": 8,  "fps": 8,  "loop": true },
          "working":  { "file": "working.png",  "frames": 12, "fps": 12, "loop": true },
          "resting":  { "file": "resting.png",  "frames": 4,  "fps": 4,  "loop": true }
        }
      }

  This manifest is a public contract for community skins. Load and validate
  it at runtime; never hardcode frame counts.

RULE 5 — MONOREPO STRUCTURE (pnpm workspaces)
      apps/desktop/     electron-vite + React + TypeScript   [BUILD THIS]
      apps/web/         Next.js dashboard                    [PLACEHOLDER ONLY]
      packages/core/    Pure TS: types, timer logic, adapters [BUILD THIS]
      packages/db/      SQLite schema + migrations            [BUILD THIS]
      skins/default/    Sprite sheets + manifest.json         [BUILD THIS]

  apps/web gets a package.json with a name and nothing else. Do NOT scaffold
  Next.js. Do NOT build a dashboard.

RULE 6 — NATIVE MODULES
  better-sqlite3 is a native module and lives in apps/desktop only. Wire
  @electron/rebuild into a postinstall script or the first install will fail
  with a NODE_MODULE_VERSION mismatch. Verify a clean `pnpm install` works
  before moving on.

======================================================================
PHASE 1 EXECUTION STEPS
======================================================================
1. Initialize the pnpm workspace (pnpm-workspace.yaml, root package.json,
   shared tsconfig base, ESLint + Prettier, Vitest at the root).
2. Scaffold apps/desktop with electron-vite + React + TypeScript. Confirm
   main / preload / renderer all build and HMR works.
3. Build the overlay window per RULE 3. Verify click-through, dragging,
   position persistence, and monitor unplug before continuing.
4. Build the Canvas 2D mascot component per RULE 4, loading skins/default.
   Ship a placeholder sprite sheet if no art exists yet — a coloured square
   with a visible frame counter is fine.
5. Build the 3-Step Setup Window, shown once on first run:
       Step 1  Assistant name (default "Mochi")
       Step 2  Skin selector
       Step 3  Work hours
   Target: under 15 seconds. NO API keys, NO accounts, NO sign-in.
6. Implement the 1-Click Stopwatch:
       click mascot  → timer starts, mascot enters `working`
       click again   → timer stops, session written to SQLite
   Timer and session logic in packages/core with Vitest coverage; SQLite
   persistence in apps/desktop behind the StorageAdapter interface.
7. Tray icon: Open Settings, Pause Mochi, Quit.

======================================================================
PHASE 1 IS COMPLETE WHEN ALL OF THESE ARE TRUE
======================================================================
  [ ] Mascot renders on the desktop and is draggable
  [ ] Position survives an app restart
  [ ] Clicks pass through everywhere except the mascot itself
  [ ] Unplugging a monitor never strands the mascot off-screen
  [ ] Mascot stays visible over a fullscreen video (macOS and Windows)
  [ ] Idle CPU under 2%; render loop fully halts when hidden
  [ ] Click starts the timer and the mascot visibly enters `working`
  [ ] Sessions persist in SQLite and survive a restart
  [ ] First run completes in under 15 seconds with no key and no account
  [ ] `pnpm test` passes; packages/core tests run with no Electron process
  [ ] `pnpm build` produces a launchable app on your platform

STOP THERE. Do not start the LLM layer, Google integration, MCP, or apps/web.

======================================================================
V2 CONSTRAINTS — BINDING LATER, DO NOT IMPLEMENT NOW
======================================================================
Design V1 so none of these become a rewrite:

  KEY ISOLATION
    API keys and OAuth tokens live ONLY in the main process, encrypted with
    Electron safeStorage. They must never enter the renderer, never appear
    in logs, and never be written to disk in plaintext. The renderer will
    call window.mochi.llm.executeTask({ task, prompt }) and receive text.
    This matters because the renderer displays LLM output AND email content —
    both attacker-influenced. A key in the renderer turns prompt injection
    into key theft.

  NO HARDCODED MODEL IDS
    Never write a model name in source. Detect the provider from the key
    prefix (sk-ant- / AIza / sk-) and fetch the live list:
        GET https://api.openai.com/v1/models
        GET https://api.anthropic.com/v1/models
        GET https://generativelanguage.googleapis.com/v1beta/models
        GET http://127.0.0.1:11434/api/tags        (Ollama)
    Store the user's choice as a plain string.

  ZERO-KEY ONBOARDING
    Probe 127.0.0.1:11434 on launch. If Ollama answers, AI features work
    with no key pasted and no account created.

  EVENT FLOW
    Sources emit typed events onto a bus. Deterministic code — never the
    LLM — decides whether and when to interrupt the user. The LLM only
    phrases the message. Keep sources decoupled from the mascot so a new
    source can be added without touching anything downstream.

  ACTION SAFETY
    No action that sends, deletes, publishes, or writes externally executes
    without explicit user confirmation showing the exact payload and
    destination.

======================================================================
WORKING AGREEMENT
======================================================================
- Commit after each completed execution step with a conventional commit
  message. Do not push unless asked.
- Strict TypeScript. No `any` without a comment explaining why.
- If a spec document contradicts this prompt, follow this prompt and flag
  the contradiction.
- If a step is blocked, finish every other step and report clearly what was
  left undone and why.

Start with step 1: create the pnpm workspace configuration files, then
scaffold apps/desktop with electron-vite.
```
