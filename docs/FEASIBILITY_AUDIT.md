# 🔬 Mochi — Deep Technical Feasibility & Risk Analysis

> **Executive Summary**: Mochi is 100% technically feasible using modern desktop web frameworks (Electron + React). However, there are **6 critical technical edge-cases and complexities** that must be engineered properly before writing production code to ensure ultra-low CPU/RAM footprint, smooth click-through interaction, and seamless OAuth token persistence.

---

## 🎯 1. Desktop Window Overlay & Mouse Click-Through

### ⚠️ The Risk & Complexity

- Mochi sits as a transparent floating window on top of the user's desktop.
- **The Problem**: If the transparent window captures mouse clicks everywhere, the user won't be able to click on desktop icons or other software behind Mochi.
- Conversely, if mouse clicks pass through everywhere, the user won't be able to click, drag, or interact with Mochi or its speech bubbles!

### 💡 The Engineering Solution

- **Dynamic Mouse Pass-Through**: Use Electron's `win.setIgnoreMouseEvents(true, { forward: true })`.
- Listen for IPC mouse hover events over the visible HTML element (mascot or speech bubble) to toggle `setIgnoreMouseEvents(false)` on hover, and `setIgnoreMouseEvents(true)` on mouse leave.

---

## 🔐 2. Google OAuth Refresh Token Expiration (7-Day Limit)

### ⚠️ The Risk & Complexity

- When users create a free Google Cloud project in "Testing" mode, Google automatically revokes OAuth refresh tokens after **7 days**. Users would be forced to re-authenticate Gmail every week.

### 💡 The Engineering Solution

- **Google Cloud Setup Guide**: In the setup documentation, instruct users to set their OAuth Publishing Status to **"In Production"** (unverified).
- Unverified production status allows unlimited token lifetime for up to 100 self-added test users with **$0 Google audit fees**.
- **Alternative**: Provide IMAP + App Passwords fallback for 1-click password authentication.

---

## ⚡ 3. Battery & CPU Consumption (Animation Throttling)

### ⚠️ The Risk & Complexity

- Continuous 60 FPS WebGL/Canvas rendering + background API polling can consume 5–10% CPU and drain laptop battery, causing fan noise.

### 💡 The Engineering Solution

- **Smart FPS Throttling**:
  - `active` / `speaking` state: 60 FPS.
  - `idle` state: Drop to 15–20 FPS.
  - `sleeping` / `user AFK` state: Pause canvas rendering (0 FPS) and switch to static SVG/PNG frame.
  - Detect system power state (battery vs plugged in) and throttle background polling intervals dynamically.

---

## 🔑 4. Native Encryption Vault (`safeStorage` vs `keytar`)

### ⚠️ The Risk & Complexity

- Native C++ Node modules like `keytar` often cause cross-compilation errors (`node-gyp`) when building for Windows x64 vs Mac Apple Silicon (arm64).

### 💡 The Engineering Solution

- **Use Electron's Native `safeStorage` API**:
  - Electron 12+ includes built-in `safeStorage.encryptString()` and `safeStorage.decryptString()`.
  - It natively uses **Windows DPAPI** (Data Protection API) and **macOS Keychain** with **zero external native C++ dependencies**.

---

## 🧠 5. LLM Token Cost & Prompt Truncation

### ⚠️ The Risk & Complexity

- Sending full email bodies or long calendar threads to GPT-4o / Claude 3.5 can quickly consume tokens and cost the user money.

### 💡 The Engineering Solution

- **Strict Pre-Processing Pipelines**:
  - Extract only Email Subject, Sender Name, Snippet (first 200 chars), and Timestamp before sending to LLM.
  - Sanitize HTML tags locally using DOMPurify before context injection.
  - Support fast/cheap models (Gemini 1.5 Flash / GPT-4o-mini / local Ollama) by default for background summarization.

---

## 🖥️ 6. Screen Awareness & Privacy Boundaries

### ⚠️ The Risk & Complexity

- Continuous background screen recording or screenshotting poses massive privacy concerns and heavy RAM overhead.

### 💡 The Engineering Solution

- **On-Demand Hotkey Triggering**:
  - Screen capture MUST be 100% manual (e.g., pressing `Ctrl+Shift+A`).
  - Never record or analyze screen contents in the background without explicit user action.

---

## 📊 Technical Feasibility Summary Scorecard

| Area                            | Feasibility      | Risk Level | Mitigation Status                                         |
| :------------------------------ | :--------------- | :--------- | :-------------------------------------------------------- |
| **Transparent Desktop Overlay** | ✅ 100% Feasible | 🟡 Medium  | Solved via Electron `setIgnoreMouseEvents` IPC            |
| **BYOK Security Vault**         | ✅ 100% Feasible | 🟢 Low     | Solved via Electron native `safeStorage`                  |
| **Zero-Audit Gmail Access**     | ✅ 100% Feasible | 🟡 Medium  | Solved via Google Cloud "In Production (Unverified)" mode |
| **Multi-LLM Router**            | ✅ 100% Feasible | 🟢 Low     | Solved via Vercel AI SDK / Direct fetch                   |
| **Battery & CPU Efficiency**    | ✅ 100% Feasible | 🟡 Medium  | Solved via state-based FPS throttling                     |
