import { describe, expect, it } from 'vitest';
import { animationFor, frameAt, parseSkinManifest, type SkinStateAnimation } from './manifest.js';

const anim = (over: Partial<SkinStateAnimation> = {}): SkinStateAnimation => ({
  file: 'idle.png',
  frames: 8,
  fps: 8,
  loop: true,
  ...over,
});

const validRaw = () => ({
  name: 'default',
  version: '1.0.0',
  frameWidth: 128,
  frameHeight: 128,
  defaultState: 'idle',
  states: {
    idle: { file: 'idle.png', frames: 8, fps: 8, loop: true },
    working: { file: 'working.png', frames: 12, fps: 12, loop: true },
    resting: { file: 'resting.png', frames: 4, fps: 4, loop: true },
  },
});

describe('parseSkinManifest', () => {
  it('accepts the documented default manifest', () => {
    const r = parseSkinManifest(validRaw());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.manifest.name).toBe('default');
    expect(r.manifest.states.working?.frames).toBe(12);
  });

  it('keeps optional attribution fields when present', () => {
    const r = parseSkinManifest({
      ...validRaw(),
      author: 'Someone',
      license: 'CC-BY-4.0',
      source: 'https://example.com/skin',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.manifest.license).toBe('CC-BY-4.0');
  });

  it('rejects non-objects', () => {
    expect(parseSkinManifest(null).ok).toBe(false);
    expect(parseSkinManifest('nope').ok).toBe(false);
    expect(parseSkinManifest([]).ok).toBe(false);
  });

  it('requires every V1 state', () => {
    const raw = validRaw();
    delete (raw.states as Record<string, unknown>).working;
    const r = parseSkinManifest(raw);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toContain('states.working: required state is missing');
  });

  it('rejects a defaultState with no animation', () => {
    const r = parseSkinManifest({ ...validRaw(), defaultState: 'alert' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toContain('defaultState: "alert" has no animation defined');
  });

  it('rejects unknown state names', () => {
    const raw = validRaw();
    (raw.states as Record<string, unknown>).sleeping = anim();
    const r = parseSkinManifest(raw);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toContain('states.sleeping: unknown mascot state');
  });

  it('rejects path traversal in a filename', () => {
    // Skins are third-party content — a manifest must not escape its directory.
    const raw = validRaw();
    raw.states.idle.file = '../../../etc/passwd';
    const r = parseSkinManifest(raw);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => e.includes('must be a bare filename'))).toBe(true);
  });

  it('rejects an fps outside the allowed band', () => {
    const raw = validRaw();
    raw.states.idle.fps = 60;
    const r = parseSkinManifest(raw);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => e.includes('must be between 1 and 24'))).toBe(true);
  });

  it('reports every error at once rather than only the first', () => {
    const r = parseSkinManifest({ name: '', version: '', frameWidth: 0, states: {} });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.length).toBeGreaterThan(4);
  });
});

describe('animationFor', () => {
  it('returns the requested state', () => {
    const r = parseSkinManifest(validRaw());
    if (!r.ok) throw new Error('fixture invalid');
    expect(animationFor(r.manifest, 'working').file).toBe('working.png');
  });

  it('falls back to the default state for an undefined one', () => {
    const r = parseSkinManifest(validRaw());
    if (!r.ok) throw new Error('fixture invalid');
    // 'alert' is a V2 state the default skin does not ship.
    expect(animationFor(r.manifest, 'alert').file).toBe('idle.png');
  });
});

describe('frameAt', () => {
  it('advances at the declared fps', () => {
    const a = anim({ frames: 8, fps: 8 }); // 125ms per frame
    expect(frameAt(a, 0)).toBe(0);
    expect(frameAt(a, 124)).toBe(0);
    expect(frameAt(a, 125)).toBe(1);
    expect(frameAt(a, 875)).toBe(7);
  });

  it('wraps a looping animation', () => {
    const a = anim({ frames: 8, fps: 8 });
    expect(frameAt(a, 1000)).toBe(0);
    expect(frameAt(a, 1125)).toBe(1);
  });

  it('holds the last frame of a non-looping animation', () => {
    const a = anim({ frames: 4, fps: 8, loop: false });
    expect(frameAt(a, 10_000)).toBe(3);
  });

  it('clamps negative elapsed time to the first frame', () => {
    expect(frameAt(anim(), -500)).toBe(0);
  });
});
