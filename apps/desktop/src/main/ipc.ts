/**
 * IPC handler registration.
 *
 * Every channel here has a matching entry in the MochiBridge contract in
 * @mochi/core. Arguments arrive from the renderer and are treated as
 * untrusted: validated or coerced before use.
 */

import { ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import type {
  EmailCategory,
  InterruptionGovernor,
  LlmStatus,
  ProviderId,
  SetupPayload,
  StorageAdapter,
} from '@mochi/core';
import { createTask, parseCategory, parseHhMm, rollForward, toggleDone } from '@mochi/core';
import { DEFAULT_PROJECT } from '@mochi/db';
import type { TimerService } from './services/timer-service.js';
import type { MascotService } from './services/mascot-service.js';
import type { SettingsStore } from './storage/settings-store.js';
import type { OverlayWindow } from './windows/overlay.js';
import type { SetupWindow } from './windows/setup.js';
import { listSkins, loadSkin } from './services/skin-loader.js';
import type { GmailManager } from './services/gmail-manager.js';
import type { UserRoutinesVault } from './storage/user-routines-vault.js';

export interface IpcContext {
  timer: TimerService;
  mascot: MascotService;
  settings: SettingsStore;
  userRoutines: UserRoutinesVault;
  storage: StorageAdapter;
  overlay: OverlayWindow;
  setup: SetupWindow;
  governor: InterruptionGovernor;
  google: {
    status(): import('@mochi/core').GoogleStatus;
    openStep(url: string): void;
    connect(clientId: string): Promise<{ ok: boolean; error?: string }>;
    disconnect(): import('@mochi/core').GoogleStatus;
  };
  /** Push the current task list to open windows and return it. */
  notifyTasks(): Promise<readonly import('@mochi/core').Task[]>;
  llm: {
    status(): LlmStatus;
    saveKey(rawKey: string): Promise<import('@mochi/core').KeyResult>;
    saveAzureKey(resourceName: string, deploymentName: string, apiKey: string): Promise<import('@mochi/core').KeyResult>;
    forgetKey(provider: ProviderId): LlmStatus;
    setDailyTokenCap(cap: number): LlmStatus;
    refresh(): Promise<LlmStatus>;
    test(): Promise<{ ok: boolean; text: string; model?: string; tokens?: number }>;
  };
  gmail: GmailManager;
  userRoutineScheduler: import('./services/user-routine-scheduler.js').UserRoutineScheduler;
}

const asString = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value.length > 0 ? value : fallback;

const asFiniteNumber = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

export function registerIpc(ctx: IpcContext): void {
  // ---- timer -------------------------------------------------------------
  ipcMain.handle('timer:toggle', async (_e, projectId: unknown) => {
    const snapshot = await ctx.timer.toggle(asString(projectId, DEFAULT_PROJECT.id));
    ctx.mascot.evaluate();
    return snapshot;
  });

  ipcMain.handle('timer:stop', async () => {
    const snapshot = await ctx.timer.stop();
    ctx.mascot.evaluate();
    return snapshot;
  });

  ipcMain.handle('timer:current', () => ctx.timer.snapshot());

  ipcMain.handle('timer:listSessions', (_e, projectId: unknown) =>
    ctx.timer.listSessions(typeof projectId === 'string' ? projectId : undefined),
  );

  // ---- projects ----------------------------------------------------------
  ipcMain.handle('projects:list', () => ctx.storage.listProjects());

  ipcMain.handle('projects:create', (_e, name: unknown, colour: unknown) =>
    ctx.storage.createProject({
      id: randomUUID(),
      name: asString(name, 'Untitled').slice(0, 60),
      colour: asString(colour, DEFAULT_PROJECT.colour),
    }),
  );

  ipcMain.handle('projects:archive', async (_e, id: unknown) => {
    if (typeof id === 'string') {
      await ctx.storage.archiveProject(id, Date.now());
    }
    return ctx.storage.listProjects();
  });

  // ---- tasks -------------------------------------------------------------
  ipcMain.handle('tasks:list', () => ctx.storage.listTasks());

  ipcMain.handle('tasks:create', async (_e, title: unknown, dueOn: unknown, projectId: unknown) => {
    const result = createTask({
      id: randomUUID(),
      title: asString(title, ''),
      now: new Date(),
      // undefined means today; explicit null means someday.
      ...(dueOn === null || typeof dueOn === 'string' ? { dueOn } : {}),
      ...(typeof projectId === 'string' ? { projectId } : {}),
    });
    if (!result.ok) return null;
    await ctx.storage.saveTask(result.task);
    ctx.notifyTasks();
    return result.task;
  });

  ipcMain.handle('tasks:toggle', async (_e, id: unknown) => {
    const tasks = await ctx.storage.listTasks();
    const task = tasks.find((t) => t.id === id);
    if (task !== undefined) await ctx.storage.saveTask(toggleDone(task, new Date()));
    return ctx.notifyTasks();
  });

  ipcMain.handle('tasks:remove', async (_e, id: unknown) => {
    if (typeof id === 'string') await ctx.storage.deleteTask(id);
    return ctx.notifyTasks();
  });

  ipcMain.handle('tasks:rollForward', async (_e, id: unknown) => {
    const tasks = await ctx.storage.listTasks();
    const task = tasks.find((t) => t.id === id);
    if (task !== undefined) await ctx.storage.saveTask(rollForward(task, new Date()));
    return ctx.notifyTasks();
  });

  // ---- settings ----------------------------------------------------------
  ipcMain.handle('settings:get', () => ctx.settings.get());

  ipcMain.handle('settings:completeSetup', (_e, payload: unknown) => {
    const input = (payload ?? {}) as Partial<SetupPayload>;
    const hours = input.workHours;
    const validHours =
      hours !== undefined &&
      parseHhMm(hours.start) !== null &&
      parseHhMm(hours.end) !== null &&
      hours.start !== hours.end;

    const updated = ctx.settings.update({
      assistantName: asString(input.assistantName, 'Mochi'),
      skinName: asString(input.skinName, 'default'),
      ...(validHours ? { workHours: hours } : {}),
      setupCompleted: true,
    });
    ctx.mascot.evaluate();
    return updated;
  });

  ipcMain.handle('settings:setDoNotDisturb', (_e, dnd: unknown) => {
    const next = ctx.settings.update({ doNotDisturb: dnd === true });
    ctx.governor.configure({ doNotDisturb: next.doNotDisturb });
    return next;
  });

  ipcMain.handle('settings:setCenterScreenAlerts', (_e, enabled: unknown) => {
    return ctx.settings.update({ centerScreenAlerts: enabled === true });
  });

  ipcMain.handle('settings:setPrimaryProjects', (_e, ids: unknown) => {
    const list = Array.isArray(ids)
      ? ids.filter((id): id is string => typeof id === 'string' && id.length > 0).slice(0, 3)
      : [];
    return ctx.settings.update({ primaryProjectIds: list });
  });

  // Dismissing a bubble dismisses the subject, not just the message, so a
  // re-poll producing a fresh event id cannot resurrect it.
  ipcMain.on('bubble:dismiss', (_e, subject: unknown) => {
    if (typeof subject === 'string' && subject.length > 0) ctx.governor.dismiss(subject);
  });

  ipcMain.handle('settings:setPaused', (_e, paused: unknown) => {
    const next = ctx.settings.update({ paused: paused === true });
    ctx.overlay.setPaused(next.paused);
    return next;
  });

  // ---- llm ---------------------------------------------------------------
  ipcMain.handle('llm:status', () => ctx.llm.status());

  // The raw key arrives here and stops here. Nothing returned contains it.
  ipcMain.handle('llm:saveKey', (_e, rawKey: unknown) =>
    ctx.llm.saveKey(typeof rawKey === 'string' ? rawKey : ''),
  );

  ipcMain.handle('llm:forgetKey', (_e, provider: unknown) =>
    ctx.llm.forgetKey(asString(provider, 'openai') as ProviderId),
  );

  ipcMain.handle('llm:setDailyTokenCap', (_e, cap: unknown) =>
    ctx.llm.setDailyTokenCap(Math.max(0, Math.round(asFiniteNumber(cap)))),
  );

  ipcMain.handle('llm:refresh', () => ctx.llm.refresh());

  ipcMain.handle('llm:test', () => ctx.llm.test());

  // Azure needs three values, so it gets its own channel. Validation and
  // storage both happen in LlmService — this only coerces the arguments.
  ipcMain.handle(
    'llm:saveAzureKey',
    (_e, resourceName: unknown, deploymentName: unknown, apiKey: unknown) =>
      ctx.llm.saveAzureKey(
        asString(resourceName, ''),
        asString(deploymentName, ''),
        asString(apiKey, ''),
      ),
  );

  // ---- google ------------------------------------------------------------
  ipcMain.handle('google:status', () => ctx.google.status());
  ipcMain.on('google:openStep', (_e, url: unknown) => {
    if (typeof url === 'string') ctx.google.openStep(url);
  });
  ipcMain.handle('google:connect', (_e, clientId: unknown) =>
    ctx.google.connect(asString(clientId, '')),
  );
  ipcMain.handle('google:disconnect', () => ctx.google.disconnect());

  // ---- skins -------------------------------------------------------------
  ipcMain.handle('skin:list', () => listSkins());
  ipcMain.handle('skin:load', (_e, name: unknown) => loadSkin(asString(name, 'default')));

  // ---- mascot ------------------------------------------------------------
  ipcMain.handle('mascot:current', () => ctx.mascot.state);

  // ---- overlay (fire-and-forget) ----------------------------------------
  ipcMain.on('overlay:setInteractive', (_e, interactive: unknown) => {
    ctx.overlay.setInteractive(interactive === true);
  });

  ipcMain.on('overlay:dragBy', (_e, dx: unknown, dy: unknown) => {
    ctx.overlay.moveBy(asFiniteNumber(dx), asFiniteNumber(dy));
  });

  // ---- windows -----------------------------------------------------------
  ipcMain.on('window:openSettings', () => ctx.setup.open());
  ipcMain.on('window:closeSetup', () => ctx.setup.close());

  // ---- gmail -------------------------------------------------------------
  ipcMain.handle('gmail:status', () => ctx.gmail.status());

  ipcMain.handle('gmail:connect', async (_e, email: unknown, appPassword: unknown) => {
    const emailStr = typeof email === 'string' ? email : '';
    const passStr = typeof appPassword === 'string' ? appPassword : '';
    return ctx.gmail.connect(emailStr, passStr);
  });

  ipcMain.handle('gmail:disconnect', () => {
    ctx.gmail.disconnect();
  });

  ipcMain.handle('gmail:fetchUnread', (_e, limit: unknown, only: unknown) => {
    const n =
      typeof limit === 'number' && Number.isFinite(limit)
        ? Math.min(Math.max(1, limit), 50)
        : 10;

    // Category ids become part of an X-GM-RAW query, so they are whitelisted
    // against the union rather than passed through. An empty result after
    // filtering falls back to Primary instead of searching every tab.
    const requested = Array.isArray(only)
      ? only.map(parseCategory).filter((c): c is EmailCategory => c !== null)
      : [];

    return ctx.gmail.fetchUnread(n, requested.length > 0 ? requested : ['primary']);
  });

  ipcMain.handle('gmail:generateAndSaveDraft', (_e, uid: unknown, tone: unknown) => {
    const emailUid = typeof uid === 'number' ? uid : Number(uid);
    const validTone = tone === 'friendly' || tone === 'brief' ? tone : 'professional';
    return ctx.gmail.generateAndSaveDraft(emailUid, validTone);
  });

  ipcMain.handle('gmail:saveDraft', (_e, request: unknown) => {
    const req = (request ?? {}) as import('@mochi/core').GmailSaveDraftRequest;
    return ctx.gmail.saveDraft(req);
  });

  // ---- user routines ----------------------------------------------------
  ipcMain.handle('userRoutines:list', () => ctx.userRoutines.list());

  ipcMain.handle('userRoutines:save', (_e, input: unknown) => {
    const data = (input ?? {}) as import('@mochi/core').UserRoutineInput & { id?: string };
    const result = ctx.userRoutines.save(data);
    ctx.setup.send('userRoutines:changed', result);
    return result;
  });

  ipcMain.handle('userRoutines:toggle', (_e, id: unknown) => {
    const idStr = typeof id === 'string' ? id : '';
    const result = ctx.userRoutines.toggle(idStr);
    ctx.setup.send('userRoutines:changed', result);
    return result;
  });

  ipcMain.handle('userRoutines:remove', (_e, id: unknown) => {
    const idStr = typeof id === 'string' ? id : '';
    const result = ctx.userRoutines.remove(idStr);
    ctx.setup.send('userRoutines:changed', result);
    return result;
  });

  ipcMain.handle('userRoutines:triggerTestAlert', (_e, title: unknown, message: unknown) => {
    const titleStr = typeof title === 'string' ? title : 'Hydration Break';
    const msgStr = typeof message === 'string' ? message : 'Time for a glass of water! Staying hydrated keeps your energy steady.';
    ctx.userRoutineScheduler.triggerAlert(titleStr, msgStr);
  });
}
