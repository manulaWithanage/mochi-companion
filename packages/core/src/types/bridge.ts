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

import type { EmailCategory } from '../google/categories.js';
import type { DiscoveredModel, ProviderId } from '../llm/providers.js';
import type { MascotState, WorkHours } from '../mascot/state.js';
import type { MochiSettings } from '../settings/settings.js';
import type { Project } from '../storage/adapter.js';
import type { Task } from '../tasks/tasks.js';
import type { WorkSession } from '../timer/session.js';

export interface GoogleStatus {
  readonly connected: boolean;
  /** Which account, so the user can tell which one is linked. */
  readonly account: string | null;
  readonly scopes: readonly string[];
  /** True once a Client ID has been stored, even if not yet authorised. */
  readonly hasClientId: boolean;
}

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

  readonly tasks: {
    list(): Promise<readonly Task[]>;
    /** Omit dueOn for today; pass null for someday. */
    create(title: string, dueOn?: string | null, projectId?: string | null): Promise<Task | null>;
    toggle(id: string): Promise<readonly Task[]>;
    remove(id: string): Promise<readonly Task[]>;
    /** Move an overdue task to today. */
    rollForward(id: string): Promise<readonly Task[]>;
    onChange(listener: (tasks: readonly Task[]) => void): () => void;
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
    /**
     * Validate and store Azure OpenAI credentials.
     * Resource name, deployment name, and API key are combined and encrypted.
     */
    saveAzureKey(resourceName: string, deploymentName: string, apiKey: string): Promise<KeyResult>;
    forgetKey(provider: ProviderId): Promise<LlmStatus>;
    setDailyTokenCap(cap: number): Promise<LlmStatus>;
    /** Re-probe Ollama, e.g. after the user starts it. */
    refresh(): Promise<LlmStatus>;
    /**
     * Make one real call, so the user can confirm the whole chain works
     * before relying on it. Returns the model's own words.
     */
    test(): Promise<{ ok: boolean; text: string; model?: string; tokens?: number }>;
    onChange(listener: (status: LlmStatus) => void): () => void;
  };

  readonly google: {
    status(): Promise<GoogleStatus>;
    /** Opens the exact console page in the real browser. */
    openStep(url: string): void;
    /**
     * Store the Client ID and run the consent flow. The refresh token is
     * captured in main and never crosses back (RULE 1).
     */
    connect(clientId: string): Promise<{ ok: boolean; error?: string }>;
    disconnect(): Promise<GoogleStatus>;
    onChange(listener: (status: GoogleStatus) => void): () => void;
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

  readonly gmail: {
    /**
     * Save Gmail credentials (email + App Password) encrypted via safeStorage.
     * Tests the connection before storing — returns ok:false on bad credentials.
     */
    connect(email: string, appPassword: string): Promise<GmailConnectResult>;
    /** Remove stored Gmail credentials. */
    disconnect(): Promise<void>;
    /** Current connection status. */
    status(): Promise<GmailStatus>;
    /**
     * Fetch up to `limit` unread emails.
     *
     * `only` restricts which inbox tabs are downloaded and defaults to
     * Primary. `counts` in the result covers every category regardless, so
     * the filter chips can show totals without paying for the bodies.
     */
    fetchUnread(limit?: number, only?: readonly EmailCategory[]): Promise<GmailFetchResult>;
    /**
     * Generate an LLM draft reply for the given email and save it to
     * [Gmail]/Drafts. Returns the generated draft text on success.
     */
    generateAndSaveDraft(emailUid: number, tone?: GmailTone): Promise<GmailDraftResult>;
    /** Save a custom (user-edited) draft to [Gmail]/Drafts. */
    saveDraft(request: GmailSaveDraftRequest): Promise<{ ok: boolean; error?: string }>;
  };
}

export type GmailTone = 'professional' | 'friendly' | 'brief';

export interface GmailStatus {
  readonly connected: boolean;
  readonly email: string | null;
  readonly redactedPassword: string;
}

export interface GmailConnectResult {
  readonly ok: boolean;
  readonly error?: string;
}

export interface GmailEmailSummary {
  readonly uid: number;
  readonly messageId: string;
  readonly from: string;
  readonly subject: string;
  readonly date: string;
  readonly bodyText: string;
  readonly threadReferences: string;
  /** Which inbox tab Gmail filed this under. */
  readonly category: EmailCategory;
}

export interface GmailFetchResult {
  readonly ok: boolean;
  readonly emails?: readonly GmailEmailSummary[];
  readonly error?: string;
  /** Unread totals per category across the inbox, not just `emails`. */
  readonly counts?: readonly { readonly category: EmailCategory; readonly count: number }[];
}

export interface GmailDraftResult {
  readonly ok: boolean;
  readonly draftReply?: string;
  readonly suggestedSubject?: string;
  readonly error?: string;
}

export interface GmailSaveDraftRequest {
  readonly toEmail: string;
  readonly subject: string;
  readonly body: string;
  readonly inReplyTo?: string;
  readonly references?: string;
}

declare global {
  interface Window {
    readonly mochi: MochiBridge;
  }
}
