import { useEffect, useState, type JSX } from 'react';
import type {
  MochiSettings,
  RoutineCategory,
  RoutineDay,
  UserRoutine,
  UserRoutineInput,
} from '@mochi/core';
import { EMOJI_OPTIONS, ROUTINE_PRESETS } from '@mochi/core';
import { button, C, card, h2, input, label, sub } from '../ui.js';

const DAYS_MAP: { key: RoutineDay; label: string }[] = [
  { key: 'mon', label: 'M' },
  { key: 'tue', label: 'T' },
  { key: 'wed', label: 'W' },
  { key: 'thu', label: 'T' },
  { key: 'fri', label: 'F' },
  { key: 'sat', label: 'S' },
  { key: 'sun', label: 'S' },
];

const CATEGORY_MAP: Record<RoutineCategory, { label: string; defaultIcon: string; color: string }> = {
  health: { label: 'Health & Wellness', defaultIcon: '💧', color: '#10b981' },
  focus: { label: 'Deep Work', defaultIcon: '🎯', color: '#6366f1' },
  mindfulness: { label: 'Mindful Break', defaultIcon: '🧘', color: '#ec4899' },
  custom: { label: 'Custom Habit', defaultIcon: '⚡', color: '#f59e0b' },
};

const Toggle = ({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
}): JSX.Element => (
  <button
    onClick={() => onChange(!on)}
    aria-pressed={on}
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
  const [settings, setSettings] = useState<MochiSettings | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

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

  useEffect(() => {
    void window.mochi.userRoutines.list().then(setRoutines);
    void window.mochi.settings.get().then(setSettings);

    const offRoutines = window.mochi.userRoutines.onChange(setRoutines);
    const offSettings = window.mochi.settings.onChange(setSettings);

    return () => {
      offRoutines();
      offSettings();
    };
  }, []);

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

  const addTimeSlot = (): void => {
    if (newTimeInput && !times.includes(newTimeInput)) {
      const updated = [...times, newTimeInput].sort();
      setTimes(updated);
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

    let finalTimes = [...times];
    if (newTimeInput && !finalTimes.includes(newTimeInput)) {
      finalTimes.push(newTimeInput);
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
    setRoutines(updated);
  };

  const handleTestAlert = (): void => {
    void window.mochi.userRoutines.triggerTestAlert(
      'Hydration Break',
      'Time for a glass of water! Staying hydrated keeps your energy steady.',
    );
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h2 style={h2}>Personal Routines</h2>
          <p style={sub}>Schedule daily habits & health breaks with local clock sync. Mochi will remind you on time.</p>
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
        <div style={{ ...card, marginBottom: 16, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Center-Screen Reminder Animation</div>
            <div style={{ fontSize: 11.5, color: C.dim, marginTop: 2 }}>
              When a routine triggers, Mochi glides smoothly to the center of your screen to deliver the reminder.
            </div>
          </div>
          <Toggle
            on={settings.centerScreenAlerts}
            onChange={(v) => void window.mochi.settings.setCenterScreenAlerts(v)}
          />
        </div>
      )}

      {/* Preset Quick-Add Banner */}
      {!isEditing && (
        <div style={{ ...card, marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.dim, marginBottom: 10 }}>
            ⚡ QUICK ADD PRESETS
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            {ROUTINE_PRESETS.map((preset) => {
              const catInfo = CATEGORY_MAP[preset.category];
              const displayIcon = preset.icon || catInfo.defaultIcon;
              const displayTimes = preset.times && preset.times.length > 0 ? preset.times.join(', ') : preset.time;
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
                  <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {preset.title}
                  </div>
                  <div style={{ fontSize: 11, color: C.dim, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
                    border: `1px solid ${C.border}`,
                    borderRadius: 20,
                    padding: '4px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    color: C.accent,
                  }}
                >
                  <span>🕒 {t}</span>
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
                        fontSize: 13,
                        lineHeight: 1,
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Add New Time Input */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                style={{ ...input, width: 120, marginBottom: 0 }}
                type="time"
                value={newTimeInput}
                onChange={(e) => setNewTimeInput(e.target.value)}
              />
              <button
                type="button"
                style={{ ...button('ghost'), padding: '7px 12px', fontSize: 12 }}
                onClick={addTimeSlot}
              >
                + Add Time
              </button>
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
            <div style={{ display: 'flex', gap: 6 }}>
              {DAYS_MAP.map(({ key, label: dLabel }) => {
                const active = selectedDays.includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleDay(key)}
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
                    {dLabel}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ padding: '10px 0', borderTop: `1px solid ${C.border}`, marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>Remind with Mochi</div>
                <div style={{ fontSize: 12, color: C.dim }}>Mochi will popup a cute reminder bubble at each specified time.</div>
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
            {routines.map((r) => {
              const catInfo = CATEGORY_MAP[r.category] ?? CATEGORY_MAP.custom;
              const displayIcon = r.icon || catInfo.defaultIcon;
              const displayTimes = r.times && r.times.length > 0 ? r.times : [r.time];

              return (
                <div
                  key={r.id}
                  style={{
                    ...card,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 14,
                    opacity: r.enabled ? 1 : 0.6,
                    borderColor: r.enabled ? C.border : 'transparent',
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{r.title}</span>
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
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
                        {/* Render all scheduled times */}
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <span style={{ fontSize: 12 }}>🕒</span>
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
                              {t}
                            </span>
                          ))}
                        </div>

                        {/* Render active days */}
                        <div style={{ display: 'flex', gap: 3 }}>
                          {DAYS_MAP.map(({ key, label: dLabel }) => (
                            <span
                              key={key}
                              style={{
                                fontSize: 10,
                                padding: '1px 5px',
                                borderRadius: 4,
                                background: r.days.includes(key) ? '#382e44' : 'transparent',
                                color: r.days.includes(key) ? C.text : C.faint,
                              }}
                            >
                              {dLabel}
                            </span>
                          ))}
                        </div>
                      </div>

                      {r.mochiReminder && r.reminderMessage && (
                        <div style={{ fontSize: 11.5, color: C.dim, marginTop: 6, fontStyle: 'italic' }}>
                          💬 "{r.reminderMessage}"
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Toggle on={r.enabled} onChange={() => void handleToggle(r.id)} />
                    <button
                      onClick={() => openEditForm(r)}
                      style={{ ...button('ghost'), padding: '4px 8px', fontSize: 12 }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => void handleDelete(r.id)}
                      style={{ ...button('ghost'), padding: '4px 8px', fontSize: 12, color: C.warn }}
                    >
                      Delete
                    </button>
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
