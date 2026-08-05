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
  ActivitySpan,
  Briefing,
  BubbleMessage,
  CalendarConnectResult,
  CalendarEvent,
  CalendarStatus,
  CachedEmailQuery,
  CachedInboxItem,
  GoogleStatus,
  GmailConnectResult,
  GmailDraftResult,
  GmailFetchResult,
  GmailInboxChanged,
  GmailSaveDraftRequest,
  GmailStatus,
  GmailSyncStatus,
  KeyResult,
  LlmStatus,
  LoadedSkin,
  MagicianPhase,
  MascotState,
  MochiBridge,
  MochiSettings,
  Project,
  SetupPayload,
  SkinSummary,
  Task,
  TimerSnapshot,
  UserRoutine,
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
    archive: (id) => ipcRenderer.invoke('projects:archive', id) as Promise<readonly Project[]>,
  },

  tasks: {
    list: () => ipcRenderer.invoke('tasks:list') as Promise<readonly Task[]>,
    create: (title, dueOn, projectId, remindAt) =>
      ipcRenderer.invoke('tasks:create', title, dueOn, projectId, remindAt) as Promise<Task | null>,
    update: (id, patch) =>
      ipcRenderer.invoke('tasks:update', id, patch) as Promise<readonly Task[]>,
    toggle: (id) => ipcRenderer.invoke('tasks:toggle', id) as Promise<readonly Task[]>,
    remove: (id) => ipcRenderer.invoke('tasks:remove', id) as Promise<readonly Task[]>,
    rollForward: (id) => ipcRenderer.invoke('tasks:rollForward', id) as Promise<readonly Task[]>,
    onChange: (listener) => subscribe<readonly Task[]>('tasks:changed', listener),
  },

  settings: {
    get: () => ipcRenderer.invoke('settings:get') as Promise<MochiSettings>,
    completeSetup: (payload: SetupPayload) =>
      ipcRenderer.invoke('settings:completeSetup', payload) as Promise<MochiSettings>,
    setPaused: (paused) =>
      ipcRenderer.invoke('settings:setPaused', paused) as Promise<MochiSettings>,
    setDoNotDisturb: (dnd) =>
      ipcRenderer.invoke('settings:setDoNotDisturb', dnd) as Promise<MochiSettings>,
    setAlwaysOnTop: (alwaysOnTop) =>
      ipcRenderer.invoke('settings:setAlwaysOnTop', alwaysOnTop) as Promise<MochiSettings>,
    setCenterScreenAlerts: (enabled) =>
      ipcRenderer.invoke('settings:setCenterScreenAlerts', enabled) as Promise<MochiSettings>,
    setMascotSize: (size) =>
      ipcRenderer.invoke('settings:setMascotSize', size) as Promise<MochiSettings>,
    setPrimaryProjects: (ids) =>
      ipcRenderer.invoke('settings:setPrimaryProjects', ids) as Promise<MochiSettings>,
    setActivityTracking: (enabled) =>
      ipcRenderer.invoke('settings:setActivityTracking', enabled) as Promise<MochiSettings>,
    setTrackBrowsingSites: (enabled) =>
      ipcRenderer.invoke('settings:setTrackBrowsingSites', enabled) as Promise<MochiSettings>,
    setAppCategory: (app, category) =>
      ipcRenderer.invoke('settings:setAppCategory', app, category) as Promise<MochiSettings>,
    setGmailAi: (patch) =>
      ipcRenderer.invoke('settings:setGmailAi', patch) as Promise<MochiSettings>,
    onChange: (listener) => subscribe<MochiSettings>('settings:changed', listener),
  },

  userRoutines: {
    list: () => ipcRenderer.invoke('userRoutines:list') as Promise<readonly UserRoutine[]>,
    save: (input) =>
      ipcRenderer.invoke('userRoutines:save', input) as Promise<readonly UserRoutine[]>,
    toggle: (id) =>
      ipcRenderer.invoke('userRoutines:toggle', id) as Promise<readonly UserRoutine[]>,
    remove: (id) =>
      ipcRenderer.invoke('userRoutines:remove', id) as Promise<readonly UserRoutine[]>,
    triggerTestAlert: (title, message) =>
      ipcRenderer.invoke('userRoutines:triggerTestAlert', title, message) as Promise<void>,
    onChange: (listener) => subscribe<readonly UserRoutine[]>('userRoutines:changed', listener),
  },

  llm: {
    status: () => ipcRenderer.invoke('llm:status') as Promise<LlmStatus>,
    // The raw key goes to main and never comes back (RULE 1).
    saveKey: (rawKey) => ipcRenderer.invoke('llm:saveKey', rawKey) as Promise<KeyResult>,
    saveAzureKey: (resourceName, deploymentName, apiKey) =>
      ipcRenderer.invoke(
        'llm:saveAzureKey',
        resourceName,
        deploymentName,
        apiKey,
      ) as Promise<KeyResult>,
    forgetKey: (provider) => ipcRenderer.invoke('llm:forgetKey', provider) as Promise<LlmStatus>,
    setDailyTokenCap: (cap) =>
      ipcRenderer.invoke('llm:setDailyTokenCap', cap) as Promise<LlmStatus>,
    setLocalEndpoint: (provider, baseUrl) =>
      ipcRenderer.invoke('llm:setLocalEndpoint', provider, baseUrl) as Promise<LlmStatus>,
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

  google: {
    status: () => ipcRenderer.invoke('google:status') as Promise<GoogleStatus>,
    openStep: (url) => ipcRenderer.send('google:openStep', url),
    connect: (clientId) =>
      ipcRenderer.invoke('google:connect', clientId) as Promise<{ ok: boolean; error?: string }>,
    disconnect: () => ipcRenderer.invoke('google:disconnect') as Promise<GoogleStatus>,
    onChange: (listener) => subscribe<GoogleStatus>('google:changed', listener),
  },

  calendar: {
    status: () => ipcRenderer.invoke('calendar:status') as Promise<CalendarStatus>,
    // The feed URL goes to main and never comes back (RULE 1).
    connect: (url, selfEmail) =>
      ipcRenderer.invoke('calendar:connect', url, selfEmail) as Promise<CalendarConnectResult>,
    disconnect: () => ipcRenderer.invoke('calendar:disconnect') as Promise<CalendarStatus>,
    refresh: () => ipcRenderer.invoke('calendar:refresh') as Promise<CalendarStatus>,
    events: () => ipcRenderer.invoke('calendar:events') as Promise<readonly CalendarEvent[]>,
    onChange: (listener) => subscribe<CalendarStatus>('calendar:changed', listener),
    previewBriefing: () => ipcRenderer.invoke('briefing:preview') as Promise<Briefing | null>,
  },

  activity: {
    list: (since, until) =>
      ipcRenderer.invoke('activity:list', since, until) as Promise<readonly ActivitySpan[]>,
    supported: () => ipcRenderer.invoke('activity:supported') as Promise<boolean>,
    forgetAll: () => ipcRenderer.invoke('activity:forgetAll') as Promise<void>,
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
    act: (actionId) => ipcRenderer.send('bubble:act', actionId),
    onShow: (listener) => subscribe<BubbleMessage>('bubble:show', listener),
  },

  overlay: {
    setInteractive: (interactive) => ipcRenderer.send('overlay:setInteractive', interactive),
    dragBy: (dx, dy) => ipcRenderer.send('overlay:dragBy', dx, dy),
    onVisibilityChange: (listener) => subscribe<boolean>('overlay:visibility', listener),
    onMagicianPhase: (listener) => subscribe<MagicianPhase>('overlay:magician', listener),
  },

  window: {
    openSettings: () => ipcRenderer.send('window:openSettings'),
    closeSetup: () => ipcRenderer.send('window:closeSetup'),
  },

  app: {
    version: () => ipcRenderer.invoke('app:version') as Promise<string>,
  },

  gmail: {
    connect: (email, appPassword) =>
      ipcRenderer.invoke('gmail:connect', email, appPassword) as Promise<GmailConnectResult>,
    disconnect: () => ipcRenderer.invoke('gmail:disconnect') as Promise<void>,
    status: () => ipcRenderer.invoke('gmail:status') as Promise<GmailStatus>,
    fetchUnread: (limit, only) =>
      ipcRenderer.invoke('gmail:fetchUnread', limit, only) as Promise<GmailFetchResult>,
    listCached: (query?: CachedEmailQuery) =>
      ipcRenderer.invoke('gmail:listCached', query) as Promise<readonly CachedInboxItem[]>,
    refresh: () => ipcRenderer.invoke('gmail:refresh') as Promise<GmailSyncStatus>,
    onInboxChanged: (listener) => subscribe<GmailInboxChanged>('gmail:inboxChanged', listener),
    onSyncStatus: (listener) => subscribe<GmailSyncStatus>('gmail:syncStatus', listener),
    previewAlert: () => ipcRenderer.invoke('gmail:previewAlert') as Promise<void>,
    fetchMessageBody: (emailId) =>
      ipcRenderer.invoke('gmail:fetchMessageBody', emailId) as Promise<string | null>,
    snoozeReminder: (emailId, minutes) =>
      ipcRenderer.invoke('gmail:snoozeReminder', emailId, minutes) as Promise<boolean>,
    dismissReminder: (emailId) =>
      ipcRenderer.invoke('gmail:dismissReminder', emailId) as Promise<boolean>,
    generateDraft: (emailId, tone) =>
      ipcRenderer.invoke('gmail:generateDraft', emailId, tone) as Promise<GmailDraftResult>,
    saveGeneratedDraft: (emailId, subject, body) =>
      ipcRenderer.invoke('gmail:saveGeneratedDraft', emailId, subject, body) as Promise<{
        ok: boolean;
        error?: string;
      }>,
    generateAndSaveDraft: (emailUid, tone) =>
      ipcRenderer.invoke('gmail:generateAndSaveDraft', emailUid, tone) as Promise<GmailDraftResult>,
    saveDraft: (request: GmailSaveDraftRequest) =>
      ipcRenderer.invoke('gmail:saveDraft', request) as Promise<{ ok: boolean; error?: string }>,
  },
};

contextBridge.exposeInMainWorld('mochi', bridge);
