import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, MAX_NAME_LENGTH, normalizeSettings } from './settings.js';

describe('normalizeSettings', () => {
  it('returns defaults for junk input', () => {
    // A corrupted settings file must never stop Mochi from starting.
    expect(normalizeSettings(null).settings).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings('nope').settings).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings(undefined).settings).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid values', () => {
    const { settings } = normalizeSettings({
      assistantName: 'Navi',
      skinName: 'pixel',
      workHours: { start: '08:30', end: '16:30' },
      setupCompleted: true,
      paused: false,
    });
    expect(settings.assistantName).toBe('Navi');
    expect(settings.skinName).toBe('pixel');
    expect(settings.workHours).toEqual({ start: '08:30', end: '16:30' });
    expect(settings.setupCompleted).toBe(true);
  });

  it('trims and caps the assistant name', () => {
    const { settings } = normalizeSettings({ assistantName: `  ${'x'.repeat(100)}  ` });
    expect(settings.assistantName).toHaveLength(MAX_NAME_LENGTH);
  });

  it('falls back when the name is blank', () => {
    const { settings, issues } = normalizeSettings({ assistantName: '   ' });
    expect(settings.assistantName).toBe('Mochi');
    expect(issues.some((i) => i.field === 'assistantName')).toBe(true);
  });

  it('rejects an invalid work-hours range and reports it', () => {
    const { settings, issues } = normalizeSettings({ workHours: { start: '25:00', end: '17:00' } });
    expect(settings.workHours).toEqual(DEFAULT_SETTINGS.workHours);
    expect(issues.some((i) => i.field === 'workHours')).toBe(true);
  });

  it('rejects a zero-length work-hours range', () => {
    const { settings } = normalizeSettings({ workHours: { start: '09:00', end: '09:00' } });
    expect(settings.workHours).toEqual(DEFAULT_SETTINGS.workHours);
  });

  it('accepts an overnight range', () => {
    const { settings } = normalizeSettings({ workHours: { start: '22:00', end: '06:00' } });
    expect(settings.workHours).toEqual({ start: '22:00', end: '06:00' });
  });

  it('keeps a well-formed overlay position and drops a malformed one', () => {
    const good = normalizeSettings({ overlayPosition: { x: 10, y: 20, displayId: 1 } });
    expect(good.settings.overlayPosition).toEqual({ x: 10, y: 20, displayId: 1 });

    const bad = normalizeSettings({ overlayPosition: { x: NaN, y: 20, displayId: 1 } });
    expect(bad.settings.overlayPosition).toBeNull();
    expect(bad.issues.some((i) => i.field === 'overlayPosition')).toBe(true);
  });

  it('treats non-true booleans as false', () => {
    const { settings } = normalizeSettings({ setupCompleted: 'yes', paused: 1 });
    expect(settings.setupCompleted).toBe(false);
    expect(settings.paused).toBe(false);
  });

  it('normalizes Gmail AI preferences and VIP senders', () => {
    const { settings } = normalizeSettings({
      gmailAi: {
        priorityEnabled: true,
        backgroundDraftsEnabled: true,
        vipSenders: [' VIP@Example.com ', 'not-an-email'],
        defaultSort: 'recent',
        maxBackgroundDraftsPerSync: 50,
      },
    });
    expect(settings.gmailAi).toEqual({
      priorityEnabled: true,
      backgroundDraftsEnabled: true,
      vipSenders: ['vip@example.com'],
      defaultSort: 'recent',
      maxBackgroundDraftsPerSync: 10,
    });
  });
});
