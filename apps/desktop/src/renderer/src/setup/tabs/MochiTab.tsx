import { useEffect, useRef, useState, type JSX } from 'react';
import { parseHhMm, type LoadedSkin, type MascotState, type MochiSettings, type SkinSummary } from '@mochi/core';
import { button, C, card, h2, input, label, sub } from '../ui.js';

const STATES: readonly MascotState[] = ['idle', 'working', 'resting'];

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
  const [name, setName] = useState('');
  const [skinName, setSkinName] = useState('default');
  const [preview, setPreview] = useState<MascotState>('idle');
  const [saved, setSaved] = useState(false);

  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('17:00');
  const [hoursSaved, setHoursSaved] = useState(false);

  useEffect(() => {
    void window.mochi.settings.get().then((s) => {
      setSettings(s);
      setName(s.assistantName);
      setSkinName(s.skinName);
      setStart(s.workHours.start);
      setEnd(s.workHours.end);
    });
    void window.mochi.skin.listAvailable().then(setSkins);
    return window.mochi.settings.onChange((s) => {
      setSettings(s);
      setStart(s.workHours.start);
      setEnd(s.workHours.end);
    });
  }, []);

  if (settings === null) return <div style={card}>Loading…</div>;

  const dirty = name !== settings.assistantName || skinName !== settings.skinName;

  const saveIdentity = async (): Promise<void> => {
    await window.mochi.settings.completeSetup({
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
        <span style={label}>Name</span>
        <input
          style={{ ...input, marginBottom: 14 }}
          value={name}
          maxLength={24}
          onChange={(e) => setName(e.target.value)}
        />

        <span style={label}>Skin</span>
        <select style={input} value={skinName} onChange={(e) => setSkinName(e.target.value)}>
          {skins.map((s) => (
            <option key={s.name} value={s.name}>
              {s.name}
              {s.license !== undefined ? ` — ${s.license}` : ''}
            </option>
          ))}
        </select>

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
          Outside these hours {settings.assistantName} rests, and day-start/day-end greetings are scheduled from them.
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
          All of these pass an interruption budget first — at most 3 an hour, silent during quiet hours and while anything is fullscreen.
        </p>
      </div>
    </div>
  );
}
