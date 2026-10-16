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
        remindersEnabled: true,
        centerScreenAlertsEnabled: false,
        alertToneEnabled: false,
        urgentReminderDelayMs: 5_000,
        reviewReminderDelayMs: 60 * 60_000,
        urgentFollowUpDelayMs: 0,
        defaultDraftTone: 'friendly',
        localCacheRetentionDays: 500,
        deleteCachedDataOnDisconnect: false,
        allowEmailBodyForAiDrafts: true,
      },
    });
    expect(settings.gmailAi).toEqual({
      priorityEnabled: true,
      backgroundDraftsEnabled: true,
      vipSenders: ['vip@example.com'],
      defaultSort: 'recent',
      maxBackgroundDraftsPerSync: 10,
      remindersEnabled: true,
      centerScreenAlertsEnabled: false,
      alertToneEnabled: false,
      urgentReminderDelayMs: 10_000,
      reviewReminderDelayMs: 60 * 60_000,
      urgentFollowUpDelayMs: 0,
      defaultDraftTone: 'friendly',
      localCacheRetentionDays: 90,
      deleteCachedDataOnDisconnect: false,
      allowEmailBodyForAiDrafts: true,
    });
  });

  it('falls back from invalid Gmail reminder and draft preferences', () => {
    const { settings } = normalizeSettings({
      gmailAi: {
        urgentReminderDelayMs: 'soon',
        reviewReminderDelayMs: Number.POSITIVE_INFINITY,
        urgentFollowUpDelayMs: -1,
        defaultDraftTone: 'dramatic',
      },
    });
    expect(settings.gmailAi.urgentReminderDelayMs).toBe(
      DEFAULT_SETTINGS.gmailAi.urgentReminderDelayMs,
    );
    expect(settings.gmailAi.reviewReminderDelayMs).toBe(
      DEFAULT_SETTINGS.gmailAi.reviewReminderDelayMs,
    );
    expect(settings.gmailAi.urgentFollowUpDelayMs).toBe(10_000);
    expect(settings.gmailAi.defaultDraftTone).toBe('professional');
    expect(settings.gmailAi.localCacheRetentionDays).toBe(
      DEFAULT_SETTINGS.gmailAi.localCacheRetentionDays,
    );
    expect(settings.gmailAi.deleteCachedDataOnDisconnect).toBe(true);
    expect(settings.gmailAi.allowEmailBodyForAiDrafts).toBe(false);
  });
  it('defaults launchOnLogin off — starting at sign-in is a decision, not an inheritance', () => {
    const { settings } = normalizeSettings({});
    expect(settings.launchOnLogin).toBe(false);
  });

  it('only accepts a literal true for launchOnLogin', () => {
    // The OS is the authority on this one, so anything ambiguous in the file
    // must read as off rather than as a claim the OS has not confirmed.
    expect(normalizeSettings({ launchOnLogin: true }).settings.launchOnLogin).toBe(true);
    expect(normalizeSettings({ launchOnLogin: 'yes' }).settings.launchOnLogin).toBe(false);
    expect(normalizeSettings({ launchOnLogin: 1 }).settings.launchOnLogin).toBe(false);
  });

  it('defaults the daily token cap to the number the router budgets against', () => {
    const { settings } = normalizeSettings({});
    expect(settings.dailyTokenCap).toBe(DEFAULT_SETTINGS.dailyTokenCap);
  });

  it('keeps a zero cap, because zero means "no cap" rather than "unset"', () => {
    const { settings } = normalizeSettings({ dailyTokenCap: 0 });
    expect(settings.dailyTokenCap).toBe(0);
  });

  it('floors a fractional cap and rejects a negative one', () => {
    expect(normalizeSettings({ dailyTokenCap: 1234.9 }).settings.dailyTokenCap).toBe(1234);

    const negative = normalizeSettings({ dailyTokenCap: -50 });
    expect(negative.settings.dailyTokenCap).toBe(DEFAULT_SETTINGS.dailyTokenCap);
    expect(negative.issues.some((i) => i.field === 'dailyTokenCap')).toBe(true);
  });

  it('falls back from a non-numeric cap', () => {
    expect(normalizeSettings({ dailyTokenCap: 'lots' }).settings.dailyTokenCap).toBe(
      DEFAULT_SETTINGS.dailyTokenCap,
    );
    expect(normalizeSettings({ dailyTokenCap: Number.NaN }).settings.dailyTokenCap).toBe(
      DEFAULT_SETTINGS.dailyTokenCap,
    );
  });
});
