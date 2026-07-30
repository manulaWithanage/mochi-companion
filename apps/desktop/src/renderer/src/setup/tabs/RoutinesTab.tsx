import { useEffect, useState, type JSX } from 'react';
import type {
  RoutineCategory,
  RoutineDay,
  UserRoutine,
  UserRoutineInput,
} from '@mochi/core';
import { ROUTINE_PRESETS } from '@mochi/core';
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

const CATEGORY_MAP: Record<RoutineCategory, { label: string; icon: string; color: string }> = {
  health: { label: 'Health & Wellness', icon: '💧', color: '#10b981' },
  focus: { label: 'Deep Work', icon: '🎯', color: '#6366f1' },
  mindfulness: { label: 'Mindful Break', icon: '🧘', color: '#ec4899' },
  custom: { label: 'Custom Habit', icon: '⚡', color: '#f59e0b' },
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
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form State
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('10:00');
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
    return window.mochi.userRoutines.onChange(setRoutines);
  }, []);

  const openNewForm = (): void => {
    setEditingId(null);
    setTitle('');
    setTime('10:00');
    setSelectedDays(['mon', 'tue', 'wed', 'thu', 'fri']);
    setCategory('health');
    setMochiReminder(true);
    setReminderMessage('');
    setIsEditing(true);
  };

  const openEditForm = (r: UserRoutine): void => {
    setEditingId(r.id);
    setTitle(r.title);
    setTime(r.time);
    setSelectedDays([...r.days]);
    setCategory(r.category);
    setMochiReminder(r.mochiReminder);
    setReminderMessage(r.reminderMessage ?? '');
    setIsEditing(true);
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
    const inputPayload: UserRoutineInput & { id?: string } = {
      ...(editingId ? { id: editingId } : {}),
      title: title.trim(),
      time,
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
    const updated = await window.mochi.userRoutines.save({
      title: preset.title,
      time: preset.time,
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

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h2 style={h2}>Personal Routines</h2>
          <p style={sub}>Schedule daily habits & health breaks. Mochi will remind you on time.</p>
        </div>
        {!isEditing && (
          <button style={button('primary')} onClick={openNewForm}>
            + Add Routine
          </button>
        )}
      </div>

      {/* Preset Quick-Add Banner */}
      {!isEditing && (
        <div style={{ ...card, marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.dim, marginBottom: 10 }}>
            ⚡ QUICK ADD PRESETS
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
            {ROUTINE_PRESETS.map((preset) => {
              const catInfo = CATEGORY_MAP[preset.category];
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
                  <div style={{ fontSize: 16, marginBottom: 4 }}>{catInfo.icon}</div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {preset.title}
                  </div>
                  <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>{preset.time}</div>
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

          <div style={{ marginBottom: 12 }}>
            <span style={label}>Routine Title</span>
            <input
              style={input}
              placeholder="e.g., Morning Water & Stretch"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <span style={label}>Time</span>
              <input style={input} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>

            <div style={{ flex: 1 }}>
              <span style={label}>Category</span>
              <select style={input} value={category} onChange={(e) => setCategory(e.target.value as RoutineCategory)}>
                {Object.entries(CATEGORY_MAP).map(([catKey, info]) => (
                  <option key={catKey} value={catKey}>
                    {info.icon} {info.label}
                  </option>
                ))}
              </select>
            </div>
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
                <div style={{ fontSize: 12, color: C.dim }}>Mochi will popup a cute reminder bubble when it's time.</div>
              </div>
              <Toggle on={mochiReminder} onChange={setMochiReminder} />
            </div>
          </div>

          {mochiReminder && (
            <div style={{ marginBottom: 16 }}>
              <span style={label}>Custom Mochi Speech (Optional)</span>
              <input
                style={input}
                placeholder="e.g., Time for a quick break! Stand up and drink some water."
                value={reminderMessage}
                onChange={(e) => setReminderMessage(e.target.value)}
              />
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button style={button('ghost')} onClick={() => setIsEditing(false)}>
              Cancel
            </button>
            <button style={button('primary')} disabled={!title.trim()} onClick={() => void saveForm()}>
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
                      {catInfo.icon}
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

                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: C.accent }}>🕒 {r.time}</span>
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
