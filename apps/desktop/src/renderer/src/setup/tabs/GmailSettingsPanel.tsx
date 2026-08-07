import { useEffect, useRef, useState, type JSX } from 'react';
import { DEFAULT_SETTINGS, type GmailAiSettings } from '@mochi/core';
import { button, C, card, input, label } from '../ui.js';

interface GmailSettingsPanelProps {
  readonly value: GmailAiSettings;
  readonly onSave: (value: GmailAiSettings) => Promise<void>;
  readonly onClearLocalData: () => Promise<number>;
}

const URGENT_DELAYS = [
  [10_000, '10 seconds (testing)'],
  [30_000, '30 seconds'],
  [60_000, '1 minute'],
  [5 * 60_000, '5 minutes'],
  [10 * 60_000, '10 minutes'],
  [30 * 60_000, '30 minutes'],
  [60 * 60_000, '1 hour'],
] as const;

const REVIEW_DELAYS = [
  [10_000, '10 seconds (testing)'],
  [30 * 60_000, '30 minutes'],
  [60 * 60_000, '1 hour'],
  [4 * 60 * 60_000, '4 hours'],
  [8 * 60 * 60_000, '8 hours'],
  [24 * 60 * 60_000, '1 day'],
] as const;

const FOLLOW_UP_DELAYS = [
  [0, 'Off'],
  [10_000, '10 seconds (testing)'],
  [15 * 60_000, '15 minutes'],
  [30 * 60_000, '30 minutes'],
  [90 * 60_000, '90 minutes'],
  [3 * 60 * 60_000, '3 hours'],
  [24 * 60 * 60_000, '1 day'],
] as const;

function Toggle({
  checked,
  onChange,
  title,
  description,
}: {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly title: string;
  readonly description: string;
}): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 16,
        padding: '11px 0',
        borderTop: `1px solid ${C.border}`,
      }}
    >
      <div>
        <div style={{ color: C.text, fontSize: 13.5 }}>{title}</div>
        <div style={{ color: C.dim, fontSize: 11.5, marginTop: 3, lineHeight: 1.45 }}>
          {description}
        </div>
      </div>
      <button
        type="button"
        aria-pressed={checked}
        onClick={() => onChange(!checked)}
        style={{
          width: 42,
          height: 24,
          flexShrink: 0,
          borderRadius: 999,
          border: 'none',
          background: checked ? C.accent : C.borderStrong,
          cursor: 'pointer',
          position: 'relative',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 3,
            left: checked ? 21 : 3,
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: checked ? C.panelAlt : C.text,
            transition: 'left 150ms ease',
          }}
        />
      </button>
    </div>
  );
}

function DurationSelect({
  id,
  title,
  description,
  value,
  options,
  disabled,
  onChange,
}: {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly value: number;
  readonly options: readonly (readonly [number, string])[];
  readonly disabled?: boolean;
  readonly onChange: (value: number) => void;
}): JSX.Element {
  return (
    <div style={{ opacity: disabled ? 0.45 : 1 }}>
      <span style={label}>{title}</span>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ ...input, cursor: disabled ? 'default' : 'pointer' }}
      >
        {options.map(([delay, text]) => (
          <option key={delay} value={delay}>
            {text}
          </option>
        ))}
      </select>
      <div style={{ color: C.faint, fontSize: 11.5, marginTop: 6, lineHeight: 1.45 }}>
        {description}
      </div>
    </div>
  );
}

export function GmailSettingsPanel({
  value,
  onSave,
  onClearLocalData,
}: GmailSettingsPanelProps): JSX.Element {
  const [draft, setDraft] = useState(value);
  const [vipText, setVipText] = useState(value.vipSenders.join('\n'));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [clearMessage, setClearMessage] = useState<string | null>(null);

  // Refs so the sync effect below can see the live form without depending on
  // it — depending on draft/vipText would re-run the effect on every keystroke.
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const vipTextRef = useRef(vipText);
  vipTextRef.current = vipText;
  /** The settings value the form was last seeded from. */
  const seededFrom = useRef(value);

  useEffect(() => {
    // Re-seed the form when settings change elsewhere — but never over
    // in-progress edits. This used to reset unconditionally, so any settings
    // broadcast (a DND toggle from the overlay) wiped a half-typed VIP list.
    const base = seededFrom.current;
    const untouched =
      JSON.stringify(draftRef.current) === JSON.stringify(base) &&
      vipTextRef.current === base.vipSenders.join('\n');
    if (untouched) {
      setDraft(value);
      setVipText(value.vipSenders.join('\n'));
    }
    seededFrom.current = value;
  }, [value]);

  const save = async (): Promise<void> => {
    setSaving(true);
    setSaveError(null);
    const vipSenders = vipText
      .split(/[\n,]+/)
      .map((sender) => sender.trim())
      .filter((sender) => sender.length > 0);
    try {
      await onSave({ ...draft, vipSenders });
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);
    } catch {
      // A rejected invoke used to leave "Applying…" stuck forever.
      setSaveError('Could not apply settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const restoreDefaults = (): void => {
    setDraft(DEFAULT_SETTINGS.gmailAi);
    setVipText('');
  };

  const preview = async (): Promise<void> => {
    // Save in the background — don't block the preview on IMAP reconcile.
    void save();
    await window.mochi.gmail.previewAlert();
  };

  const clearLocalData = async (): Promise<void> => {
    const confirmed = window.confirm(
      'Delete cached Gmail metadata, priority results, generated drafts, and reminders from this device? Gmail itself will not be changed.',
    );
    if (!confirmed) return;
    setClearing(true);
    setClearMessage(null);
    try {
      const count = await onClearLocalData();
      setClearMessage(`Deleted ${count} cached email${count === 1 ? '' : 's'}.`);
    } catch {
      setClearMessage('Could not delete cached Gmail data.');
    } finally {
      setClearing(false);
    }
  };

  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 14,
        }}
      >
        <section style={card}>
          <h3 style={{ margin: '0 0 4px', fontSize: 15, color: C.text }}>Reply reminders</h3>
          <p style={{ margin: '0 0 10px', color: C.dim, fontSize: 12, lineHeight: 1.5 }}>
            Mochi only reminds you about high-confidence emails that appear to need a reply.
          </p>
          <Toggle
            checked={draft.remindersEnabled}
            onChange={(remindersEnabled) => setDraft({ ...draft, remindersEnabled })}
            title="Enable reply reminders"
            description="Respect Do Not Disturb and your configured work hours."
          />
          <Toggle
            checked={draft.centerScreenAlertsEnabled}
            onChange={(centerScreenAlertsEnabled) =>
              setDraft({ ...draft, centerScreenAlertsEnabled })
            }
            title="Center-screen entrance"
            description="Mochi appears in the middle with the magician animation."
          />
          <Toggle
            checked={draft.alertToneEnabled}
            onChange={(alertToneEnabled) => setDraft({ ...draft, alertToneEnabled })}
            title="Gentle alert tone"
            description="Play a short, soft two-note chime when the reminder appears."
          />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
              gap: 14,
              marginTop: 14,
            }}
          >
            <DurationSelect
              id="gmail-urgent-delay"
              title="Urgent email"
              description="Time after arrival before the first alert."
              value={draft.urgentReminderDelayMs}
              options={URGENT_DELAYS}
              disabled={!draft.remindersEnabled}
              onChange={(urgentReminderDelayMs) => setDraft({ ...draft, urgentReminderDelayMs })}
            />
            <DurationSelect
              id="gmail-review-delay"
              title="Review email"
              description="Lower-priority messages can wait longer."
              value={draft.reviewReminderDelayMs}
              options={REVIEW_DELAYS}
              disabled={!draft.remindersEnabled}
              onChange={(reviewReminderDelayMs) => setDraft({ ...draft, reviewReminderDelayMs })}
            />
            <DurationSelect
              id="gmail-follow-up-delay"
              title="Urgent follow-up"
              description="Optional second alert if no reply is detected."
              value={draft.urgentFollowUpDelayMs}
              options={FOLLOW_UP_DELAYS}
              disabled={!draft.remindersEnabled}
              onChange={(urgentFollowUpDelayMs) => setDraft({ ...draft, urgentFollowUpDelayMs })}
            />
          </div>
        </section>

        <section style={card}>
          <h3 style={{ margin: '0 0 4px', fontSize: 15, color: C.text }}>AI drafts</h3>
          <p style={{ margin: '0 0 10px', color: C.dim, fontSize: 12, lineHeight: 1.5 }}>
            Background drafts stay local until you review and explicitly save them to Gmail.
          </p>
          <Toggle
            checked={draft.backgroundDraftsEnabled}
            onChange={(backgroundDraftsEnabled) => setDraft({ ...draft, backgroundDraftsEnabled })}
            title="Prepare urgent replies"
            description="Generate drafts only for confident urgent messages that need a reply."
          />
          <Toggle
            checked={draft.allowEmailBodyForAiDrafts}
            onChange={(allowEmailBodyForAiDrafts) =>
              setDraft({ ...draft, allowEmailBodyForAiDrafts })
            }
            title="Allow email bodies in AI draft prompts"
            description="Required for drafts. The complete message is sent to your selected AI provider; leave this off for metadata-only triage."
          />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 14,
              marginTop: 14,
            }}
          >
            <div>
              <span style={label}>Default tone</span>
              <select
                id="gmail-default-tone"
                value={draft.defaultDraftTone}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    defaultDraftTone: event.target.value as GmailAiSettings['defaultDraftTone'],
                  })
                }
                style={{ ...input, cursor: 'pointer' }}
              >
                <option value="professional">Professional</option>
                <option value="friendly">Friendly</option>
                <option value="brief">Brief</option>
              </select>
            </div>
            <div style={{ opacity: draft.backgroundDraftsEnabled ? 1 : 0.45 }}>
              <span style={label}>Drafts per sync</span>
              <select
                id="gmail-max-background-drafts"
                value={draft.maxBackgroundDraftsPerSync}
                disabled={!draft.backgroundDraftsEnabled}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    maxBackgroundDraftsPerSync: Number(event.target.value),
                  })
                }
                style={{ ...input, cursor: 'pointer' }}
              >
                {[1, 3, 5, 10].map((count) => (
                  <option key={count} value={count}>
                    {count}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <section style={card}>
          <h3 style={{ margin: '0 0 4px', fontSize: 15, color: C.text }}>Priority inbox</h3>
          <p style={{ margin: '0 0 14px', color: C.dim, fontSize: 12, lineHeight: 1.5 }}>
            VIP senders receive a strong deterministic score boost without spending LLM tokens.
          </p>
          <div style={{ marginBottom: 14 }}>
            <span style={label}>Default inbox order</span>
            <select
              id="gmail-default-sort"
              value={draft.defaultSort}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  defaultSort: event.target.value === 'recent' ? 'recent' : 'priority',
                })
              }
              style={{ ...input, cursor: 'pointer' }}
            >
              <option value="priority">Priority first</option>
              <option value="recent">Newest first</option>
            </select>
          </div>
          <span style={label}>VIP email addresses</span>
          <textarea
            id="gmail-vip-senders"
            value={vipText}
            onChange={(event) => setVipText(event.target.value)}
            rows={5}
            placeholder={'client@example.com\nmanager@example.com'}
            style={{ ...input, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
          />
          <div style={{ color: C.faint, fontSize: 11.5, marginTop: 6 }}>
            One address per line. Invalid addresses are ignored safely.
          </div>
        </section>

        <section style={card}>
          <h3 style={{ margin: '0 0 4px', fontSize: 15, color: C.text }}>
            Privacy & local storage
          </h3>
          <p style={{ margin: '0 0 14px', color: C.dim, fontSize: 12, lineHeight: 1.5 }}>
            Cached message fields and generated drafts are protected with your operating
            system&apos;s encrypted storage.
          </p>
          <div style={{ marginBottom: 14 }}>
            <span style={label}>Keep cached email data</span>
            <select
              id="gmail-cache-retention"
              value={draft.localCacheRetentionDays}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  localCacheRetentionDays: Number(event.target.value),
                })
              }
              style={{ ...input, cursor: 'pointer' }}
            >
              {[1, 7, 14, 30, 90].map((days) => (
                <option key={days} value={days}>
                  {days === 1 ? '1 day' : `${days} days`}
                </option>
              ))}
            </select>
          </div>
          <Toggle
            checked={draft.deleteCachedDataOnDisconnect}
            onChange={(deleteCachedDataOnDisconnect) =>
              setDraft({ ...draft, deleteCachedDataOnDisconnect })
            }
            title="Delete cache on disconnect"
            description="Removes this account’s metadata, AI results, drafts, reminders, and sync state."
          />
          <div
            style={{
              color: C.faint,
              fontSize: 11.5,
              lineHeight: 1.55,
              margin: '12px 0',
            }}
          >
            Priority refinement sends sender, subject, category, and at most 150 characters of the
            cached snippet to the selected AI provider. Complete bodies are never used for triage.
          </div>
          <button
            type="button"
            onClick={() => void clearLocalData()}
            disabled={clearing}
            style={{ ...button('ghost'), opacity: clearing ? 0.6 : 1 }}
          >
            {clearing ? 'Deleting…' : 'Delete cached Gmail data now'}
          </button>
          {clearMessage !== null && (
            <div style={{ color: C.good, fontSize: 11.5, marginTop: 8 }}>{clearMessage}</div>
          )}
        </section>

        <section style={card}>
          <h3 style={{ margin: '0 0 4px', fontSize: 15, color: C.text }}>How it works</h3>
          <div style={{ color: C.dim, fontSize: 12, lineHeight: 1.7, marginTop: 12 }}>
            <div>• New mail arrives through Gmail IMAP IDLE.</div>
            <div>• Rules score every message locally with zero tokens.</div>
            <div>• Only ambiguous messages use compact LLM triage.</div>
            <div>• Sent-thread activity cancels reply reminders.</div>
            <div>• Promotions and updates never interrupt you.</div>
          </div>
        </section>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 10,
          marginTop: 16,
        }}
      >
        {saved && <span style={{ color: C.good, fontSize: 12.5 }}>✓ Settings applied</span>}
        {saveError !== null && <span style={{ color: C.warn, fontSize: 12.5 }}>{saveError}</span>}
        <button
          id="gmail-preview-alert"
          type="button"
          onClick={() => void preview()}
          style={button('ghost')}
        >
          Preview alert
        </button>
        <button type="button" onClick={restoreDefaults} style={button('ghost')}>
          Restore defaults
        </button>
        <button
          id="gmail-save-settings"
          type="button"
          onClick={() => void save()}
          disabled={saving}
          style={{ ...button('primary'), opacity: saving ? 0.6 : 1 }}
        >
          {saving ? 'Applying…' : 'Save settings'}
        </button>
      </div>
    </div>
  );
}
