/**
 * The electron-backed half of `login-item.ts`.
 *
 * Kept separate so the decision logic stays testable without an Electron
 * process; this file is the only place that touches `app`, and it holds no
 * logic of its own.
 */

import { app } from 'electron';
import type { LoginItemOs } from './login-item.js';

export const electronLoginItemOs: LoginItemOs = {
  platform: process.platform,
  read: () => app.getLoginItemSettings().openAtLogin,
  // `openAsHidden` is deliberate: Mochi is an overlay and a tray icon, so a
  // window appearing at sign-in would be a surprise rather than a service.
  write: (enabled) => app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: true }),
};
