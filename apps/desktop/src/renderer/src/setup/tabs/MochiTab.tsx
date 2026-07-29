import { useEffect, useRef, useState, type JSX } from 'react';
import type { LoadedSkin, MascotState, MochiSettings, SkinSummary } from '@mochi/core';
import { button, C, card, h2, input, label, sub } from '../ui.js';

/**
 * Identity and appearance — and, crucially, the mascot actually on screen.
 *
 * Picking a skin from a dropdown and seeing nothing was the weakest moment in
 * the old settings window. The preview animates live and can be poked into
 * each state, so the choice is visible rather than described.
 */

const STATES: readonly MascotState[] = ['idle', 'working', 'resting'];

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
        // Same frame budget as the overlay — no reason a preview should burn
        // more CPU than the mascot itself.
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

  useEffect(() => {
    void window.mochi.settings.get().then((s) => {
      setSettings(s);
      setName(s.assistantName);
      setSkinName(s.skinName);
    });
    void window.mochi.skin.listAvailable().then(setSkins);
    return window.mochi.settings.onChange(setSettings);
  }, []);

  if (settings === null) return <div style={card}>Loading…</div>;

  const dirty = name !== settings.assistantName || skinName !== settings.skinName;

  const save = async (): Promise<void> => {
    await window.mochi.settings.completeSetup({
      assistantName: name.trim() || 'Mochi',
      skinName,
      workHours: settings.workHours,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  const active = skins.find((s) => s.name === skinName);

  return (
    <div>
      <h2 style={h2}>Mochi</h2>
      <p style={sub}>Who lives on your desktop.</p>

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
          <button style={button('primary')} disabled={!dirty} onClick={() => void save()}>
            {saved ? 'Saved' : 'Save'}
          </button>
        </div>
      </div>

      <div style={{ ...card, fontSize: 12, color: C.faint, lineHeight: 1.6 }}>
        Skins are folders of sprite sheets and a <code>manifest.json</code>. Drop one into your
        Mochi folder and it appears here — no rebuild, no paid tooling. Artwork keeps its own
        licence.
      </div>
    </div>
  );
}
