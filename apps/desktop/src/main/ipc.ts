/**
 * IPC handler registration.
 *
 * Every channel here has a matching entry in the MochiBridge contract in
 * @mochi/core. Arguments arrive from the renderer and are treated as
 * untrusted: validated or coerced before use.
 */

import { ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import type { SetupPayload, StorageAdapter } from '@mochi/core';
import { parseHhMm } from '@mochi/core';
import { DEFAULT_PROJECT } from '@mochi/db';
import type { TimerService } from './services/timer-service.js';
import type { MascotService } from './services/mascot-service.js';
import type { SettingsStore } from './storage/settings-store.js';
import type { OverlayWindow } from './windows/overlay.js';
import type { SetupWindow } from './windows/setup.js';
import { listSkins, loadSkin } from './services/skin-loader.js';

export interface IpcContext {
  timer: TimerService;
  mascot: MascotService;
  settings: SettingsStore;
  storage: StorageAdapter;
  overlay: OverlayWindow;
  setup: SetupWindow;
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

  ipcMain.handle('settings:setPaused', (_e, paused: unknown) => {
    const next = ctx.settings.update({ paused: paused === true });
    ctx.overlay.setPaused(next.paused);
    return next;
  });

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
}
