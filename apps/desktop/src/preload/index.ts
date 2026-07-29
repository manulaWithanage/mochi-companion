/**
 * The ONLY path between renderer and main (RULE 1).
 *
 * The renderer runs with contextIsolation: true, sandbox: true and
 * nodeIntegration: false — it has no ipcRenderer, no fs, no Node. Everything
 * it can do is enumerated here.
 *
 * Typed as MochiBridge from @mochi/core, so a channel declared in the
 * contract but not implemented here is a compile error rather than an
 * `undefined is not a function` at runtime.
 *
 * This file is CommonJS on purpose: sandboxed preload scripts cannot use ESM
 * imports, and sandbox: true is not negotiable.
 */

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type {
  BubbleMessage,
  KeyResult,
  LlmStatus,
  LoadedSkin,
  MascotState,
  MochiBridge,
  MochiSettings,
  Project,
  SetupPayload,
  SkinSummary,
  TimerSnapshot,
  WorkSession,
} from '@mochi/core';

/**
 * Wrap a push channel so the renderer gets an unsubscribe function and never
 * touches the raw event object (which carries a `sender` reference we do not
 * want reachable from renderer code).
 */
function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, payload: T): void => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

const bridge: MochiBridge = {
  timer: {
    toggle: (projectId) => ipcRenderer.invoke('timer:toggle', projectId) as Promise<TimerSnapshot>,
    stop: () => ipcRenderer.invoke('timer:stop') as Promise<TimerSnapshot>,
    current: () => ipcRenderer.invoke('timer:current') as Promise<TimerSnapshot>,
    listSessions: (projectId) =>
      ipcRenderer.invoke('timer:listSessions', projectId) as Promise<readonly WorkSession[]>,
    onChange: (listener) => subscribe<TimerSnapshot>('timer:changed', listener),
  },

  projects: {
    list: () => ipcRenderer.invoke('projects:list') as Promise<readonly Project[]>,
    create: (name, colour) =>
      ipcRenderer.invoke('projects:create', name, colour) as Promise<Project>,
  },

  settings: {
    get: () => ipcRenderer.invoke('settings:get') as Promise<MochiSettings>,
    completeSetup: (payload: SetupPayload) =>
      ipcRenderer.invoke('settings:completeSetup', payload) as Promise<MochiSettings>,
    setPaused: (paused) =>
      ipcRenderer.invoke('settings:setPaused', paused) as Promise<MochiSettings>,
    setDoNotDisturb: (dnd) =>
      ipcRenderer.invoke('settings:setDoNotDisturb', dnd) as Promise<MochiSettings>,
    onChange: (listener) => subscribe<MochiSettings>('settings:changed', listener),
  },

  llm: {
    status: () => ipcRenderer.invoke('llm:status') as Promise<LlmStatus>,
    // The raw key goes to main and never comes back (RULE 1).
    saveKey: (rawKey) => ipcRenderer.invoke('llm:saveKey', rawKey) as Promise<KeyResult>,
    forgetKey: (provider) => ipcRenderer.invoke('llm:forgetKey', provider) as Promise<LlmStatus>,
    setDailyTokenCap: (cap) =>
      ipcRenderer.invoke('llm:setDailyTokenCap', cap) as Promise<LlmStatus>,
    refresh: () => ipcRenderer.invoke('llm:refresh') as Promise<LlmStatus>,
    test: () =>
      ipcRenderer.invoke('llm:test') as Promise<{
        ok: boolean;
        text: string;
        model?: string;
        tokens?: number;
      }>,
    onChange: (listener) => subscribe<LlmStatus>('llm:changed', listener),
  },

  skin: {
    load: (name) => ipcRenderer.invoke('skin:load', name) as Promise<LoadedSkin>,
    listAvailable: () => ipcRenderer.invoke('skin:list') as Promise<readonly SkinSummary[]>,
  },

  mascot: {
    current: () => ipcRenderer.invoke('mascot:current') as Promise<MascotState>,
    onStateChange: (listener) => subscribe<MascotState>('mascot:state', listener),
  },

  bubble: {
    dismiss: (subject) => ipcRenderer.send('bubble:dismiss', subject),
    onShow: (listener) => subscribe<BubbleMessage>('bubble:show', listener),
  },

  overlay: {
    setInteractive: (interactive) => ipcRenderer.send('overlay:setInteractive', interactive),
    dragBy: (dx, dy) => ipcRenderer.send('overlay:dragBy', dx, dy),
    onVisibilityChange: (listener) => subscribe<boolean>('overlay:visibility', listener),
  },

  window: {
    openSettings: () => ipcRenderer.send('window:openSettings'),
    closeSetup: () => ipcRenderer.send('window:closeSetup'),
  },
};

contextBridge.exposeInMainWorld('mochi', bridge);
