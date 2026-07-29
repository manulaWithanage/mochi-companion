/**
 * The contextBridge surface — the ONLY path between renderer and main.
 *
 * RULE 1: the renderer runs with contextIsolation, sandbox on and
 * nodeIntegration off. It has no ipcRenderer, no fs, no Node. Everything it
 * can do is declared here and implemented in the preload script.
 *
 * Both sides import these types, so adding a channel without implementing it
 * is a compile error rather than a runtime `undefined is not a function`.
 */

import type { DiscoveredModel, ProviderId } from '../llm/providers.js';
import type { MascotState, WorkHours } from '../mascot/state.js';
import type { MochiSettings } from '../settings/settings.js';
import type { Project } from '../storage/adapter.js';
import type { WorkSession } from '../timer/session.js';

export interface LlmStatus {
  /** Ollama answered on localhost — the zero-key path is live. */
  readonly ollamaAvailable: boolean;
  /** Providers with a stored, working key. Never includes the key itself. */
  readonly configured: readonly { provider: ProviderId; redacted: string }[];
  readonly models: readonly DiscoveredModel[];
  /** True when Mochi can call a model right now, by any route. */
  readonly ready: boolean;
  readonly spentToday: number;
  readonly dailyTokenCap: number;
}

export interface KeyResult {
  readonly ok: boolean;
  readonly provider: ProviderId | null;
  readonly redacted: string;
  readonly modelCount: number;
  readonly error?: string;
}

export interface BubbleMessage {
  readonly text: string;
  /** Auto-dismiss after this long. */
  readonly ttlMs: number;
  /**
   * The thing being talked about. Dismissing a bubble dismisses the subject
   * in the governor, so a re-poll cannot resurrect what the user waved away.
   */
  readonly subject: string;
}

export interface TimerSnapshot {
  readonly running: boolean;
  readonly session: WorkSession | null;
  readonly elapsedMs: number;
}

export interface SetupPayload {
  readonly assistantName: string;
  readonly skinName: string;
  readonly workHours: WorkHours;
}

export interface SkinSummary {
  readonly name: string;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly license?: string;
  readonly author?: string;
}

/**
 * Resolved sprite sheets for the active skin. Images arrive as data URLs so
 * the sandboxed renderer never needs filesystem access to draw them.
 */
export interface LoadedSkin {
  readonly summary: SkinSummary;
  readonly defaultState: MascotState;
  readonly states: Readonly<
    Partial<
      Record<
        MascotState,
        {
          readonly dataUrl: string;
          readonly frames: number;
          readonly fps: number;
          readonly loop: boolean;
        }
      >
    >
  >;
}

export interface MochiBridge {
  readonly timer: {
    toggle(projectId: string): Promise<TimerSnapshot>;
    stop(): Promise<TimerSnapshot>;
    current(): Promise<TimerSnapshot>;
    listSessions(projectId?: string): Promise<readonly WorkSession[]>;
    onChange(listener: (snapshot: TimerSnapshot) => void): () => void;
  };

  readonly projects: {
    list(): Promise<readonly Project[]>;
    create(name: string, colour: string): Promise<Project>;
  };

  readonly settings: {
    get(): Promise<MochiSettings>;
    completeSetup(payload: SetupPayload): Promise<MochiSettings>;
    setPaused(paused: boolean): Promise<MochiSettings>;
    setDoNotDisturb(dnd: boolean): Promise<MochiSettings>;
    onChange(listener: (settings: MochiSettings) => void): () => void;
  };

  readonly llm: {
    status(): Promise<LlmStatus>;
    /**
     * Validate and store a key. The raw key crosses to main and never comes
     * back — the result carries only a redacted form (RULE 1).
     */
    saveKey(rawKey: string): Promise<KeyResult>;
    forgetKey(provider: ProviderId): Promise<LlmStatus>;
    setDailyTokenCap(cap: number): Promise<LlmStatus>;
    /** Re-probe Ollama, e.g. after the user starts it. */
    refresh(): Promise<LlmStatus>;
    onChange(listener: (status: LlmStatus) => void): () => void;
  };

  readonly skin: {
    load(name: string): Promise<LoadedSkin>;
    listAvailable(): Promise<readonly SkinSummary[]>;
  };

  readonly mascot: {
    /** Derived in main so the renderer holds no scheduling logic. */
    onStateChange(listener: (state: MascotState) => void): () => void;
    current(): Promise<MascotState>;
  };

  readonly bubble: {
    /** The user waved this away — the governor must not raise it again. */
    dismiss(subject: string): void;
    /**
     * Main pushes what Mochi should say. V1 only ever sends this in response
     * to something the user did — unprompted messages must pass the
     * interruption governor first (Phase 1.5).
     */
    onShow(listener: (message: BubbleMessage) => void): () => void;
  };

  readonly overlay: {
    /**
     * Toggle click-through. Called on pointer enter/leave over the mascot's
     * drawn pixels; the window itself stays mascot-sized (RULE 3).
     */
    setInteractive(interactive: boolean): void;
    /** Drag delta in CSS pixels; main converts to screen coords and clamps. */
    dragBy(dx: number, dy: number): void;
    /** True while the window is hidden/occluded so the renderer stops drawing. */
    onVisibilityChange(listener: (visible: boolean) => void): () => void;
  };

  readonly window: {
    openSettings(): void;
    closeSetup(): void;
  };
}

declare global {
  interface Window {
    readonly mochi: MochiBridge;
  }
}
