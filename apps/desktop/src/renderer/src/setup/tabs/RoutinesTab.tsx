import { useEffect, useMemo, useState, type JSX } from 'react';
import type {
  MochiSettings,
  RoutineCategory,
  RoutineDay,
  UserRoutine,
  UserRoutineInput,
} from '@mochi/core';
import {
  describeDays,
  describeNext,
  EMOJI_OPTIONS,
  nextOccurrence,
  ROUTINE_PRESETS,
  routineTimes,
  runsOnDay,
  sortByNext,
} from '@mochi/core';
import { button, C, card, h2, input, label, sub } from '../ui.js';

/**
 * Two letters, not one.
 *
 * Single initials give M T W T F S S: Tuesday and Thursday are the same
 * button, and so are Saturday and Sunday. The full name rides along as a
 * tooltip and an accessible name so nothing depends on decoding the label.
 */
const DAYS_MAP: { key: RoutineDay; short: string; full: string }[] = [
  { key: 'mon', short: 'Mo', full: 'Monday' },
  { key: 'tue', short: 'Tu', full: 'Tuesday' },
  { key: 'wed', short: 'We', full: 'Wednesday' },
  { key: 'thu', short: 'Th', full: 'Thursday' },
  { key: 'fri', short: 'Fr', full: 'Friday' },
  { key: 'sat', short: 'Sa', full: 'Saturday' },
  { key: 'sun', short: 'Su', full: 'Sunday' },
];

/** The three schedules almost everyone wants, one click instead of seven. */
const DAY_SHORTCUTS: { label: string; days: RoutineDay[] }[] = [
  { label: 'Weekdays', days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
  { label: 'Every day', days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] },
  { label: 'Weekends', days: ['sat', 'sun'] },
];

const CATEGORY_MAP: Record<RoutineCategory, { label: string; defaultIcon: string; color: string }> =
  {
    health: { label: 'Health & Wellness', defaultIcon: '💧', color: '#10b981' },
    focus: { label: 'Deep Work', defaultIcon: '🎯', color: '#6366f1' },
    mindfulness: { label: 'Mindful Break', defaultIcon: '🧘', color: '#ec4899' },
    custom: { label: 'Custom Habit', defaultIcon: '⚡', color: '#f59e0b' },
  };

/** Parses inputs like "14:00", "2:00 PM", "9:30", "930", "9am", "11pm", "1430" -> "14:00" */
function parseFlexibleTime(inputStr: string): string | null {
  const str = inputStr.trim().toLowerCase();
  if (!str) return null;

  // Match 12-hour with am/pm: "2:30 pm", "2:30pm", "9am", "11:15pm", "2pm"
  const ampmMatch = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i.exec(str);
  if (ampmMatch && ampmMatch[1] && ampmMatch[3]) {
    let hours = parseInt(ampmMatch[1], 10);
    const minutes = ampmMatch[2] ? parseInt(ampmMatch[2], 10) : 0;
    const isPm = ampmMatch[3].toLowerCase() === 'pm';
    if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) return null;
    if (isPm && hours < 12) hours += 12;
    if (!isPm && hours === 12) hours = 0;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  // Match 24-hour with colon: "14:30", "9:00", "09:15"
  const colonMatch = /^(\d{1,2}):(\d{2})$/.exec(str);
  if (colonMatch && colonMatch[1] && colonMatch[2]) {
    const hours = parseInt(colonMatch[1], 10);
    const minutes = parseInt(colonMatch[2], 10);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  // Match 3 or 4 digit numbers or single/double hour: "930" -> 09:30, "1430" -> 14:30, "9" -> 09:00
  const numMatch = /^(\d{1,4})$/.exec(str);
  if (numMatch && numMatch[1]) {
    const raw = numMatch[1];
    let hours = 0;
    let minutes = 0;
    if (raw.length <= 2) {
      hours = parseInt(raw, 10);
      minutes = 0;
    } else if (raw.length === 3) {
      hours = parseInt(raw.slice(0, 1), 10);
      minutes = parseInt(raw.slice(1), 10);
    } else {
      hours = parseInt(raw.slice(0, 2), 10);
      minutes = parseInt(raw.slice(2), 10);
    }
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  return null;
}

/** Formats "14:00" -> "2:00 PM", "09:30" -> "9:30 AM" */
function formatTime12h(time24: string): string {
  const parts = time24.split(':');
  let h = parseInt(parts[0] || '0', 10);
  const m = parts[1] || '00';
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

const TIME_SUGGESTIONS = [
  { label: '08:00 AM', value: '08:00' },
  { label: '09:00 AM', value: '09:00' },
  { label: '10:00 AM', value: '10:00' },
  { label: '11:30 AM', value: '11:30' },
  { label: '12:30 PM', value: '12:30' },
  { label: '02:00 PM', value: '14:00' },
  { label: '03:30 PM', value: '15:30' },
  { label: '05:00 PM', value: '17:00' },
  { label: '06:30 PM', value: '18:30' },
  { label: '08:00 PM', value: '20:00' },
  { label: '09:30 PM', value: '21:30' },
] as const;

const Toggle = ({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  /** Says which routine this switch belongs to; the control itself is unlabelled. */
  label?: string;
}): JSX.Element => (
  <button
    onClick={() => onChange(!on)}
    aria-pressed={on}
    {...(label === undefined ? {} : { 'aria-label': label, title: label })}
    style={{
      flexShrink: 0,
      width: 38,
      height: 22,
      borderRadius: 999,
      border: 'none',
      cursor: 'pointer',
      background: on ? C.accent : '#3b3244',
      position: 'relative',
      transition: 'background 160ms ease',
    }}
  >
    <span
      style={{
        position: 'absolute',
        top: 2,
        left: on ? 18 : 2,
        width: 18,
        height: 18,
        borderRadius: '50%',
        background: on ? '#241f2b' : C.text,
        transition: 'left 160ms ease',
      }}
    />
  </button>
);

export function RoutinesTab(): JSX.Element {
  const [routines, setRoutines] = useState<readonly UserRoutine[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [settings, setSettings] = useState<MochiSettings | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Delete asks first. It sat next to Edit at the same size with no undo
  // behind it, which is one slip away from losing a routine.
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Form State
  const [title, setTitle] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('💧');
  const [times, setTimes] = useState<string[]>(['10:00']);
  const [newTimeInput, setNewTimeInput] = useState('14:00');
  const [selectedDays, setSelectedDays] = useState<RoutineDay[]>([
    'mon',
    'tue',
    'wed',
    'thu',
    'fri',
  ]);
  const [category, setCategory] = useState<RoutineCategory>('health');
  const [mochiReminder, setMochiReminder] = useState(true);
  const [reminderMessage, setReminderMessage] = useState('');
  const [customIntervalMins, setCustomIntervalMins] = useState('30');
  const [intervalStart, setIntervalStart] = useState('09:00');
  const [intervalEnd, setIntervalEnd] = useState('17:00');

  useEffect(() => {
    void window.mochi.userRoutines.list().then(setRoutines);
    void window.mochi.settings.get().then(setSettings);

    const offRoutines = window.mochi.userRoutines.onChange(setRoutines);
    const offSettings = window.mochi.settings.onChange(setSettings);
    // "in 20 min" is a lie a minute later unless something re-renders.
    const tick = setInterval(() => setNow(new Date()), 30_000);

    return () => {
      offRoutines();
      offSettings();
      clearInterval(tick);
    };
  }, []);

  // Schedule order, not creation order: a list of daily routines should read
  // like a day.
  const ordered = useMemo(() => sortByNext(routines, now), [routines, now]);
  const upNext = ordered.find((r) => nextOccurrence(r, now) !== null) ?? null;

  const applyIntervalTimes = (mins: number): void => {
    const parseMin = (tStr: string): number => {
      if (!tStr) return 9 * 60;
      const parts = tStr.split(':').map(Number);
      return (parts[0] || 0) * 60 + (parts[1] || 0);
    };

    let start = parseMin(intervalStart);
    let end = parseMin(intervalEnd);
    if (end <= start) end = start + 8 * 60;

    const step = Math.max(1, mins);
    const result: string[] = [];

    for (let current = start; current <= end; current += step) {
      const hh = String(Math.floor(current / 60)).padStart(2, '0');
      const mm = String(current % 60).padStart(2, '0');
      result.push(`${hh}:${mm}`);
    }

    const uniqueSorted = [...new Set(result)].sort();
    setTimes(uniqueSorted);
  };

  const openNewForm = (): void => {
    setEditingId(null);
    setTitle('');
    setSelectedIcon('💧');
    setTimes(['10:00']);
    setNewTimeInput('14:00');
    setSelectedDays(['mon', 'tue', 'wed', 'thu', 'fri']);
    setCategory('health');
    setMochiReminder(true);
    setReminderMessage('');
    setIsEditing(true);
  };

  const openEditForm = (r: UserRoutine): void => {
    setEditingId(r.id);
    setTitle(r.title);
    setSelectedIcon(r.icon || CATEGORY_MAP[r.category]?.defaultIcon || '💧');
    const existingTimes = r.times && r.times.length > 0 ? [...r.times] : [r.time || '10:00'];
    setTimes(existingTimes);
    setNewTimeInput('14:00');
    setSelectedDays([...r.days]);
    setCategory(r.category);
    setMochiReminder(r.mochiReminder);
    setReminderMessage(r.reminderMessage ?? '');
    setIsEditing(true);
  };

  const addTimeSlot = (timeToAdd?: string): void => {
    const target = timeToAdd || parseFlexibleTime(newTimeInput);
    if (target && !times.includes(target)) {
      const updated = [...times, target].sort();
      setTimes(updated);
      setNewTimeInput('');
    }
  };

  const removeTimeSlot = (timeToRemove: string): void => {
    if (times.length > 1) {
      setTimes(times.filter((t) => t !== timeToRemove));
    }
  };

  const toggleDay = (dayKey: RoutineDay): void => {
    if (selectedDays.includes(dayKey)) {
      if (selectedDays.length > 1) {
        setSelectedDays(selectedDays.filter((d) => d !== dayKey));
      }
    } else {
      setSelectedDays([...selectedDays, dayKey]);
    }
  };

  const saveForm = async (): Promise<void> => {
    if (!title.trim()) return;

    const finalTimes = [...times];
    const parsedNew = parseFlexibleTime(newTimeInput);
    if (parsedNew && !finalTimes.includes(parsedNew)) {
      finalTimes.push(parsedNew);
      finalTimes.sort();
    }

    if (finalTimes.length === 0) return;

    const inputPayload: UserRoutineInput & { id?: string } = {
      ...(editingId ? { id: editingId } : {}),
      title: title.trim(),
      icon: selectedIcon,
      time: finalTimes[0] || '10:00',
      times: finalTimes,
      days: selectedDays,
      category,
      mochiReminder,
      reminderMessage: reminderMessage.trim() || undefined,
    };
    const updated = await window.mochi.userRoutines.save(inputPayload);
    setRoutines(updated);
    setIsEditing(false);
  };

  const addPreset = async (preset: (typeof ROUTINE_PRESETS)[number]): Promise<void> => {
    const presetTimes = preset.times && preset.times.length > 0 ? [...preset.times] : [preset.time];
    const updated = await window.mochi.userRoutines.save({
      title: preset.title,
      icon: preset.icon,
      time: presetTimes[0] || preset.time,
      times: presetTimes,
      days: [...preset.days],
      category: preset.category,
      mochiReminder: preset.mochiReminder,
      reminderMessage: preset.reminderMessage,
    });
    setRoutines(updated);
  };

  const handleToggle = async (id: string): Promise<void> => {
    const updated = await window.mochi.userRoutines.toggle(id);
    setRoutines(updated);
  };

  const handleDelete = async (id: string): Promise<void> => {
    const updated = await window.mochi.userRoutines.remove(id);
    setConfirmDelete(null);
    setRoutines(updated);
  };

  /**
   * Preview the alert using a routine the user actually has.
   *
   * It used to send a hardcoded "Hydration Break" regardless, which shows how
   * the animation looks but not what *your* reminder will say — and reads as a
   * developer button rather than a preview.
   */
  const handleTestAlert = (): void => {
    const sample = upNext ?? ordered[0];
    void window.mochi.userRoutines.triggerTestAlert(
      sample?.title ?? 'Hydration Break',
      sample?.reminderMessage ??
        'Time for a glass of water! Staying hydrated keeps your energy steady.',
    );
  };

  // Offering a preset that is already in the list just makes a duplicate, and
  // the panel keeps its full height for ever. Once they are all added it goes
  // away, which is roughly 130px back for the list that matters.
  const availablePresets = useMemo(() => {
    const existing = new Set(routines.map((r) => r.title.trim().toLowerCase()));
    return ROUTINE_PRESETS.filter((p) => !existing.has(p.title.trim().toLowerCase()));
  }, [routines]);

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 16,
        }}
      >
        <div>
          <h2 style={h2}>Personal Routines</h2>
          <p style={sub}>
            Schedule daily habits & health breaks with local clock sync. Mochi will remind you on
            time.
          </p>
        </div>
        {!isEditing && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ ...button('ghost'), fontSize: 12.5 }} onClick={handleTestAlert}>
              ⚡ Test Center Alert
            </button>
            <button style={button('primary')} onClick={openNewForm}>
              + Add Routine
            </button>
          </div>
        )}
      </div>

      {/* Center Screen Animation Setting Toggle */}
      {settings !== null && (
        <div
          style={{
            ...card,
            marginBottom: 16,
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
              Center-Screen Reminder Animation
            </div>
            <div style={{ fontSize: 11.5, color: C.dim, marginTop: 2 }}>
              When a routine triggers, Mochi glides smoothly to the center of your screen to deliver
              the reminder.
            </div>
          </div>
          <Toggle
            on={settings.centerScreenAlerts}
            onChange={(v) => void window.mochi.settings.setCenterScreenAlerts(v)}
          />
        </div>
      )}

      {/* Preset Quick-Add Banner — only what is not already in the list */}
      {!isEditing && availablePresets.length > 0 && (
        <div style={{ ...card, marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.dim, marginBottom: 10 }}>
            ⚡ QUICK ADD PRESETS
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 10,
            }}
          >
            {availablePresets.map((preset) => {
              const catInfo = CATEGORY_MAP[preset.category];
              const displayIcon = preset.icon || catInfo.defaultIcon;
              const displayTimes =
                preset.times && preset.times.length > 0 ? preset.times.join(', ') : preset.time;
              return (
                <button
                  key={preset.title}
                  onClick={() => void addPreset(preset)}
                  style={{
                    background: '#1a1622',
                    border: `1px solid ${C.border}`,
                    borderRadius: 10,
                    padding: '10px 12px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 160ms ease',
                    color: C.text,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = catInfo.color)}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = C.border)}
                >
                  <div style={{ fontSize: 18, marginBottom: 4 }}>{displayIcon}</div>
                  <div
                    style={{
                      fontSize: 12.5,
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {preset.title}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: C.dim,
                      marginTop: 2,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    🕒 {displayTimes}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Add / Edit Routine Form */}
      {isEditing && (
        <div style={{ ...card, marginBottom: 20, border: `1px solid ${C.accent}` }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 14 }}>
            {editingId ? 'Edit Routine' : 'Create New Routine'}
          </div>

          {/* Title Row */}
          <div style={{ marginBottom: 14 }}>
            <span style={label}>Routine Title</span>
            <input
              style={input}
              placeholder="e.g., Water & Hydration Break"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* Custom Emoji Selector */}
          <div style={{ marginBottom: 14 }}>
            <span style={label}>Choose Icon</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {EMOJI_OPTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setSelectedIcon(emoji)}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 8,
                    border: `1px solid ${selectedIcon === emoji ? C.accent : C.border}`,
                    background: selectedIcon === emoji ? `${C.accent}33` : '#1c1724',
                    fontSize: 16,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Multiple Times Selector */}
          <div style={{ marginBottom: 14 }}>
            <span style={label}>Reminder Times (Add multiple times during the day)</span>

            {/* Active Time Chips */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {times.map((t) => (
                <div
                  key={t}
                  style={{
                    background: '#2a2236',
                    border: `1px solid ${C.accent}`,
                    borderRadius: 20,
                    padding: '5px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 12.5,
                    fontWeight: 650,
                    color: C.accent,
                  }}
                >
                  <span>
                    🕒 {formatTime12h(t)} <span style={{ opacity: 0.6, fontSize: 11 }}>({t})</span>
                  </span>
                  {times.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeTimeSlot(t)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: C.warn,
                        cursor: 'pointer',
                        padding: 0,
                        fontSize: 14,
                        lineHeight: 1,
                        marginLeft: 2,
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Add New Time Input */}
            <div
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                flexWrap: 'wrap',
                marginBottom: 8,
              }}
            >
              <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
                <input
                  style={{ ...input, marginBottom: 0, paddingRight: 90 }}
                  type="text"
                  placeholder="Type e.g., 2:30 PM, 14:00, 9am"
                  value={newTimeInput}
                  onChange={(e) => setNewTimeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTimeSlot();
                    }
                  }}
                />
                {newTimeInput.trim().length > 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      right: 10,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      fontSize: 11,
                      fontWeight: 600,
                      color: parseFlexibleTime(newTimeInput) ? C.good : C.warn,
                      pointerEvents: 'none',
                    }}
                  >
                    {parseFlexibleTime(newTimeInput)
                      ? `✓ ${formatTime12h(parseFlexibleTime(newTimeInput)!)}`
                      : 'Invalid format'}
                  </div>
                )}
              </div>
              <button
                type="button"
                disabled={!parseFlexibleTime(newTimeInput)}
                style={{
                  ...button('primary'),
                  padding: '8px 14px',
                  fontSize: 12,
                  opacity: parseFlexibleTime(newTimeInput) ? 1 : 0.5,
                }}
                onClick={() => addTimeSlot()}
              >
                + Add Time
              </button>
            </div>

            {/* Quick Time Suggestion Chips */}
            <div>
              <div style={{ fontSize: 11, color: C.dim, marginBottom: 6, fontWeight: 500 }}>
                Quick suggestions:
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {TIME_SUGGESTIONS.map((sug) => {
                  const alreadyAdded = times.includes(sug.value);
                  return (
                    <button
                      key={sug.value}
                      type="button"
                      onClick={() => addTimeSlot(sug.value)}
                      disabled={alreadyAdded}
                      style={{
                        background: alreadyAdded ? '#1e1828' : '#251e30',
                        border: `1px solid ${alreadyAdded ? C.border : 'rgba(255,255,255,0.12)'}`,
                        borderRadius: 6,
                        padding: '4px 8px',
                        fontSize: 11.5,
                        color: alreadyAdded ? C.faint : C.text,
                        cursor: alreadyAdded ? 'default' : 'pointer',
                        opacity: alreadyAdded ? 0.5 : 1,
                      }}
                    >
                      + {sug.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <span style={label}>Category</span>
            <select
              style={input}
              value={category}
              onChange={(e) => {
                const cat = e.target.value as RoutineCategory;
                setCategory(cat);
                if (CATEGORY_MAP[cat]) {
                  setSelectedIcon(CATEGORY_MAP[cat].defaultIcon);
                }
              }}
            >
              {Object.entries(CATEGORY_MAP).map(([catKey, info]) => (
                <option key={catKey} value={catKey}>
                  {info.defaultIcon} {info.label}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 14 }}>
            <span style={label}>Repeat Days</span>

            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              {DAY_SHORTCUTS.map((shortcut) => {
                const applied =
                  shortcut.days.length === selectedDays.length &&
                  shortcut.days.every((d) => selectedDays.includes(d));
                return (
                  <button
                    key={shortcut.label}
                    type="button"
                    onClick={() => setSelectedDays([...shortcut.days])}
                    style={{
                      ...button('ghost'),
                      padding: '3px 10px',
                      fontSize: 11.5,
                      color: applied ? C.accent : C.dim,
                      borderColor: applied ? C.accent : C.border,
                    }}
                  >
                    {shortcut.label}
                  </button>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: 6 }}>
              {DAYS_MAP.map(({ key, short, full }) => {
                const active = selectedDays.includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleDay(key)}
                    title={full}
                    aria-label={full}
                    aria-pressed={active}
                    style={{
                      flex: 1,
                      padding: '6px 0',
                      fontSize: 12,
                      fontWeight: 600,
                      borderRadius: 6,
                      border: `1px solid ${active ? C.accent : C.border}`,
                      background: active ? C.accent : '#201a28',
                      color: active ? '#241f2b' : C.text,
                      cursor: 'pointer',
                    }}
                  >
                    {short}
                  </button>
                );
              })}
            </div>

            {/* Reads back what was chosen, in the same words the list uses. */}
            <div style={{ fontSize: 11.5, color: C.dim, marginTop: 6 }}>
              Repeats: <strong style={{ color: C.text }}>{describeDays(selectedDays)}</strong>
            </div>
          </div>

          <div style={{ padding: '10px 0', borderTop: `1px solid ${C.border}`, marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>Remind with Mochi</div>
                <div style={{ fontSize: 12, color: C.dim }}>
                  Mochi will popup a cute reminder bubble at each specified time.
                </div>
              </div>
              <Toggle on={mochiReminder} onChange={setMochiReminder} />
            </div>
          </div>

          {mochiReminder && (
            <div style={{ marginBottom: 16 }}>
              <span style={label}>Custom Mochi Speech (Optional)</span>
              <input
                style={input}
                placeholder="e.g., Time for a glass of water! Stand up and stretch."
                value={reminderMessage}
                onChange={(e) => setReminderMessage(e.target.value)}
              />
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button style={button('ghost')} onClick={() => setIsEditing(false)}>
              Cancel
            </button>
            <button
              style={button('primary')}
              disabled={!title.trim() || (times.length === 0 && !newTimeInput.trim())}
              onClick={() => void saveForm()}
            >
              Save Routine
            </button>
          </div>
        </div>
      )}

      {/* Active Routines List */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.dim, marginBottom: 10 }}>
          YOUR ROUTINES ({routines.length})
        </div>

        {routines.length === 0 ? (
          <div style={{ ...card, textAlign: 'center', padding: '30px 20px', color: C.dim }}>
            No routines created yet. Click <strong>+ Add Routine</strong> or pick a preset above!
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {ordered.map((r) => {
              const catInfo = CATEGORY_MAP[r.category] ?? CATEGORY_MAP.custom;
              const displayIcon = r.icon || catInfo.defaultIcon;
              const displayTimes = routineTimes(r);
              const next = nextOccurrence(r, now);
              const isNext = upNext !== null && upNext.id === r.id;
              const today = runsOnDay(r, now);
              const askingToDelete = confirmDelete === r.id;

              return (
                <div
                  key={r.id}
                  style={{
                    ...card,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 14,
                    // Dimmed, not faded out. At 0.55 with a transparent border
                    // a paused routine was hard to read and hard to aim at,
                    // which makes the toggle feel one-way.
                    opacity: r.enabled ? 1 : 0.78,
                    // The one firing next is picked out, so the list answers
                    // "what is coming" without being read top to bottom.
                    borderColor: askingToDelete
                      ? C.warn
                      : isNext
                        ? 'rgba(242,166,179,0.45)'
                        : C.border,
                    background: isNext ? 'rgba(242,166,179,0.05)' : undefined,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 10,
                        background: '#191522',
                        border: `1px solid ${catInfo.color}44`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 18,
                        flexShrink: 0,
                      }}
                    >
                      {displayIcon}
                    </div>

                    <div style={{ flex: 1 }}>
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
                      >
                        <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
                          {r.title}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            padding: '2px 7px',
                            borderRadius: 99,
                            background: `${catInfo.color}22`,
                            color: catInfo.color,
                            fontWeight: 500,
                          }}
                        >
                          {catInfo.label}
                        </span>
                        {/* On the title line rather than a line of its own:
                            four stacked lines per row fitted three routines
                            on screen out of four. */}
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: 99,
                            color: isNext ? '#241f2b' : r.enabled ? C.dim : C.faint,
                            background: isNext ? C.accent : '#251e30',
                          }}
                        >
                          {isNext ? `next · ${describeNext(next, now)}` : describeNext(next, now)}
                        </span>
                      </div>

                      {/*
                        One line for the whole schedule. The seven day pills
                        that used to sit here read "M T W T F S S" — two Ts,
                        two Ss, and on/off told apart only by a shade of grey.
                      */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          marginTop: 4,
                          flexWrap: 'wrap',
                          fontSize: 12,
                        }}
                      >
                        <span>🕒</span>
                        {displayTimes.map((t) => (
                          <span
                            key={t}
                            style={{
                              fontSize: 11.5,
                              fontWeight: 600,
                              color: C.accent,
                              background: '#251e30',
                              padding: '1px 6px',
                              borderRadius: 4,
                            }}
                          >
                            {formatTime12h(t)}
                          </span>
                        ))}
                        <span style={{ color: C.faint }}>·</span>
                        <span style={{ fontSize: 11.5, color: C.dim, fontWeight: 500 }}>
                          {describeDays(r.days)}
                        </span>
                        {r.enabled && !today && (
                          // Otherwise a Mon/Wed/Fri routine looks identical on a
                          // Tuesday to one that is about to fire.
                          <span style={{ fontSize: 11.5, color: C.faint }}>· not today</span>
                        )}
                      </div>

                      {r.mochiReminder && r.reminderMessage && (
                        <div
                          style={{
                            fontSize: 11.5,
                            color: C.dim,
                            marginTop: 5,
                            fontStyle: 'italic',
                            // One line. A long message used to push every other
                            // routine below the fold.
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: 460,
                          }}
                          title={r.reminderMessage}
                        >
                          💬 “{r.reminderMessage}”
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    {askingToDelete ? (
                      // Asks before destroying. There is no undo behind this,
                      // and it used to be one click, the same size as Edit and
                      // right beside it.
                      <>
                        <span style={{ fontSize: 12, color: C.warn, fontWeight: 600 }}>
                          Delete “{r.title}”?
                        </span>
                        <button
                          onClick={() => void handleDelete(r.id)}
                          style={{
                            ...button('ghost'),
                            padding: '4px 10px',
                            fontSize: 12,
                            color: C.warn,
                            borderColor: C.warn,
                          }}
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => setConfirmDelete(null)}
                          style={{ ...button('ghost'), padding: '4px 10px', fontSize: 12 }}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <Toggle
                          on={r.enabled}
                          onChange={() => void handleToggle(r.id)}
                          label={`${r.enabled ? 'Pause' : 'Resume'} ${r.title}`}
                        />
                        <button
                          onClick={() => openEditForm(r)}
                          style={{ ...button('ghost'), padding: '4px 8px', fontSize: 12 }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setConfirmDelete(r.id)}
                          style={{
                            ...button('ghost'),
                            padding: '4px 8px',
                            fontSize: 12,
                            // Muted until it is the thing you are doing. A
                            // destructive action does not need to shout from
                            // every row.
                            color: C.dim,
                          }}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
