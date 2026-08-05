import { useEffect, useRef, useState, type JSX } from 'react';
import {
  parseHhMm,
  type LoadedSkin,
  type MascotSize,
  type MascotState,
  type MochiSettings,
  type SkinSummary,
} from '@mochi/core';
import { button, C, card, h2, input, label, sub } from '../ui.js';

const STATES: readonly MascotState[] = ['idle', 'working', 'resting', 'alert'];

const Toggle = ({
  on,
  onChange,
  title,
  desc,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  title: string;
  desc: string;
}): JSX.Element => (
  <div
    style={{
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 14,
      padding: '10px 0',
      borderTop: `1px solid ${C.border}`,
    }}
  >
    <div>
      <div style={{ fontSize: 13.5 }}>{title}</div>
      <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>{desc}</div>
    </div>
    <button
      onClick={() => onChange(!on)}
      aria-pressed={on}
      style={{
        flexShrink: 0,
        width: 42,
        height: 24,
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
          top: 3,
          left: on ? 21 : 3,
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: on ? '#241f2b' : C.text,
          transition: 'left 160ms ease',
        }}
      />
    </button>
  </div>
);

function SkinPreview({ skinName, state }: { skinName: string; state: MascotState }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [skin, setSkin] = useState<LoadedSkin | null>(null);

  useEffect(() => {
    let cancelled = false;
    void window.mochi.skin
      .load(skinName)
      .then((s) => {
        if (!cancelled) setSkin(s);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [skinName]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null || skin === null) return;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return;

    const sheet = skin.states[state] ?? skin.states[skin.defaultState];
    if (sheet === undefined) return;

    const img = new Image();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let frame = 0;
    let stopped = false;

    img.onload = () => {
      const w = img.width / sheet.frames;
      const draw = (): void => {
        if (stopped) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, frame * w, 0, w, img.height, 0, 0, canvas.width, canvas.height);
        frame = (frame + 1) % sheet.frames;
        timer = setTimeout(draw, 1000 / sheet.fps);
      };
      draw();
    };
    img.src = sheet.dataUrl;

    return () => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [skin, state]);

  return (
    <canvas
      ref={canvasRef}
      width={220}
      height={220}
      style={{ width: 130, height: 130, display: 'block' }}
    />
  );
}

export function MochiTab(): JSX.Element {
  const [settings, setSettings] = useState<MochiSettings | null>(null);
  const [skins, setSkins] = useState<readonly SkinSummary[]>([]);
  const [userName, setUserName] = useState('');
  const [name, setName] = useState('');
  const [skinName, setSkinName] = useState('default');
  const [mascotSize, setMascotSize] = useState<MascotSize>('medium');
  const [preview, setPreview] = useState<MascotState>('idle');
  const [saved, setSaved] = useState(false);

  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('17:00');
  const [hoursSaved, setHoursSaved] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deletingData, setDeletingData] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    void window.mochi.settings.get().then((s) => {
      setSettings(s);
      setUserName(s.userName ?? '');
      setName(s.assistantName);
      setSkinName(s.skinName);
      setMascotSize(s.mascotSize ?? 'medium');
      setStart(s.workHours.start);
      setEnd(s.workHours.end);
    });
    void window.mochi.skin.listAvailable().then(setSkins);
    return window.mochi.settings.onChange((s) => {
      setSettings(s);
      setUserName(s.userName ?? '');
      setName(s.assistantName);
      setMascotSize(s.mascotSize ?? 'medium');
      setStart(s.workHours.start);
      setEnd(s.workHours.end);
    });
  }, []);

  if (settings === null) return <div style={card}>Loading…</div>;

  const dirty =
    userName !== settings.userName ||
    name !== settings.assistantName ||
    skinName !== settings.skinName;

  const saveIdentity = async (): Promise<void> => {
    await window.mochi.settings.completeSetup({
      userName: userName.trim(),
      assistantName: name.trim() || 'Mochi',
      skinName,
      workHours: settings.workHours,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  const hoursValid = parseHhMm(start) !== null && parseHhMm(end) !== null && start !== end;

  const saveHours = async (): Promise<void> => {
    if (!hoursValid) return;
    await window.mochi.settings.completeSetup({
      assistantName: settings.assistantName,
      skinName: settings.skinName,
      workHours: { start, end },
    });
    setHoursSaved(true);
    setTimeout(() => setHoursSaved(false), 1800);
  };

  const active = skins.find((s) => s.name === skinName);

  const deleteAllLocalData = async (): Promise<void> => {
    if (deleteConfirmation !== 'DELETE') return;
    const confirmed = window.confirm(
      'Permanently delete all Mochi projects, sessions, tasks, routines, settings, connections, email cache, and learned memory from this device?',
    );
    if (!confirmed) return;
    setDeletingData(true);
    setDeleteError(null);
    const result = await window.mochi.settings.deleteAllLocalData(deleteConfirmation);
    if (!result.ok) {
      setDeletingData(false);
      setDeleteError(result.error ?? 'Could not delete local data.');
    }
  };

  return (
    <div>
      <h2 style={h2}>Mochi Settings</h2>
      <p style={sub}>Appearance, identity, quiet hours, and notification rules.</p>

      {/* Identity & Skin Card */}
      <div style={{ ...card, display: 'flex', gap: 20, alignItems: 'center', marginBottom: 16 }}>
        <div
          style={{
            background: '#191521',
            borderRadius: 12,
            padding: 6,
            border: `1px solid ${C.border}`,
          }}
        >
          <SkinPreview skinName={skinName} state={preview} />
        </div>

        <div style={{ flex: 1 }}>
          <span style={label}>Preview</span>
          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            {STATES.map((s) => (
              <button
                key={s}
                onClick={() => setPreview(s)}
                style={{
                  ...button(preview === s ? 'primary' : 'ghost'),
                  padding: '5px 11px',
                  fontSize: 12,
                }}
              >
                {s}
              </button>
            ))}
          </div>
          {active !== undefined && (
            <div style={{ fontSize: 12, color: C.faint, lineHeight: 1.6 }}>
              {active.frameWidth}×{active.frameHeight}
              {active.author !== undefined ? ` · by ${active.author}` : ''}
              {active.license !== undefined ? ` · ${active.license}` : ''}
            </div>
          )}
        </div>
      </div>

      <div style={{ ...card, marginBottom: 16 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 12,
            marginBottom: 14,
          }}
        >
          <div>
            <span style={label}>Your Name</span>
            <input
              style={input}
              placeholder="What should Mochi call you?"
              value={userName}
              maxLength={24}
              onChange={(e) => setUserName(e.target.value)}
            />
          </div>
          <div>
            <span style={label}>Assistant Name</span>
            <input
              style={input}
              placeholder="e.g. Mochi"
              value={name}
              maxLength={24}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        </div>

        <span style={label}>Skin</span>
        <select
          style={{ ...input, marginBottom: 14 }}
          value={skinName}
          onChange={(e) => setSkinName(e.target.value)}
        >
          {skins.map((s) => (
            <option key={s.name} value={s.name}>
              {s.name}
              {s.license !== undefined ? ` (${s.license})` : ''}
            </option>
          ))}
        </select>

        <span style={label}>Mochi Size</span>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {(['small', 'medium', 'large'] as const).map((sz) => {
            const isSelected = mascotSize === sz;
            const labels = {
              small: 'Small (130px)',
              medium: 'Medium (170px)',
              large: 'Large (210px)',
            };
            return (
              <button
                key={sz}
                type="button"
                onClick={() => void window.mochi.settings.setMascotSize(sz)}
                style={{
                  ...button(isSelected ? 'primary' : 'ghost'),
                  flex: 1,
                  padding: '8px 12px',
                  fontSize: 12.5,
                  textTransform: 'capitalize',
                }}
              >
                {labels[sz]}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button style={button('primary')} disabled={!dirty} onClick={() => void saveIdentity()}>
            {saved ? 'Saved' : 'Save Identity'}
          </button>
        </div>
      </div>

      {/* Working Hours & Interruption Rules */}
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 12 }}>
          Companion Schedule & Working Hours
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <span style={label}>From</span>
            <input style={input} value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <span style={label}>Until</span>
            <input style={input} value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <button style={button('primary')} disabled={!hoursValid} onClick={() => void saveHours()}>
            {hoursSaved ? 'Saved' : 'Save Hours'}
          </button>
        </div>
        {!hoursValid && (
          <p style={{ color: C.warn, fontSize: 12, margin: '8px 0 0' }}>
            Use HH:MM, and make the two different.
          </p>
        )}
        <p style={{ fontSize: 12, color: C.faint, margin: '10px 0 0' }}>
          Outside these hours {settings.assistantName} rests, and day-start/day-end greetings are
          scheduled from them.
        </p>
      </div>

      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 4 }}>
          Quiet Hours & Interruptions
        </div>

        <Toggle
          on={settings.doNotDisturb}
          onChange={(v) => void window.mochi.settings.setDoNotDisturb(v)}
          title="Do not disturb"
          desc="Mochi stays on screen and keeps tracking time, but never speaks unprompted."
        />
        <Toggle
          on={settings.alwaysOnTop}
          onChange={(v) => void window.mochi.settings.setAlwaysOnTop(v)}
          title="Always on top"
          desc="Keep Mochi floating on top of all application windows. Turn off to let Mochi sit behind active windows on your desktop."
        />
        <Toggle
          on={settings.centerScreenAlerts}
          onChange={(v) => void window.mochi.settings.setCenterScreenAlerts(v)}
          title="Center-Screen Routine Alerts"
          desc="When a routine triggers, Mochi smoothly glides to the center of your screen to deliver the reminder."
        />
        <Toggle
          on={settings.paused}
          onChange={(v) => void window.mochi.settings.setPaused(v)}
          title={`Hide ${settings.assistantName}`}
          desc="Removes the mascot from the screen entirely. The tray icon stays."
        />
      </div>

      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 10 }}>
          What Mochi says on its own
        </div>
        {[
          ['Start of day', 'A greeting when your working hours begin.'],
          ['Break nudges', 'Roughly every 90 minutes through the working day.'],
          ['End of day', 'A prompt to stop when your hours are over.'],
          ['Long session', 'After about 100 minutes of unbroken tracking.'],
        ].map(([title, desc]) => (
          <div
            key={title}
            style={{ padding: '8px 0', borderTop: `1px solid ${C.border}`, fontSize: 13 }}
          >
            {title}
            <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>{desc}</div>
          </div>
        ))}
        <p style={{ fontSize: 12, color: C.faint, margin: '12px 0 0', lineHeight: 1.5 }}>
          All of these pass an interruption budget first (at most 3 an hour, silent during quiet
          hours and while anything is fullscreen).
        </p>
      </div>

      <div
        style={{
          ...card,
          marginBottom: 16,
          border: '1px solid rgba(255, 100, 100, 0.28)',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: C.warn, marginBottom: 6 }}>
          Delete all local Mochi data
        </div>
        <p style={{ fontSize: 12, color: C.dim, margin: '0 0 12px', lineHeight: 1.55 }}>
          Permanently removes time history, projects, tasks, routines, settings, connected
          credentials, cached email data, generated drafts, and learned memory. Mochi will restart
          as a new installation. This cannot be undone.
        </p>
        <span style={label}>Type DELETE to confirm</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={deleteConfirmation}
            onChange={(event) => setDeleteConfirmation(event.target.value)}
            placeholder="DELETE"
            disabled={deletingData}
            style={input}
          />
          <button
            type="button"
            onClick={() => void deleteAllLocalData()}
            disabled={deleteConfirmation !== 'DELETE' || deletingData}
            style={{
              ...button('ghost'),
              color: C.warn,
              borderColor: 'rgba(255, 100, 100, 0.35)',
              opacity: deleteConfirmation !== 'DELETE' || deletingData ? 0.45 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            {deletingData ? 'Deleting…' : 'Delete everything'}
          </button>
        </div>
        {deleteError !== null && (
          <div style={{ color: C.warn, fontSize: 12, marginTop: 8 }}>{deleteError}</div>
        )}
      </div>
    </div>
  );
}
