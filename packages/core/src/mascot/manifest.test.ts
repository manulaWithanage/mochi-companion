import { describe, expect, it } from 'vitest';
import {
  animationFor,
  frameAt,
  parseSkinManifest,
  pickVariant,
  type SkinStateAnimation,
} from './manifest.js';

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

describe('state variants', () => {
  const base = {
    name: 'v',
    version: '1',
    frameWidth: 192,
    frameHeight: 192,
    defaultState: 'idle',
    states: {
      idle: { file: 'idle.png', frames: 12, fps: 12, loop: true },
      working: { file: 'working.png', frames: 12, fps: 12, loop: true },
      resting: { file: 'resting.png', frames: 8, fps: 12, loop: true },
    },
  };

  const withIdle = (idle: unknown): unknown => ({
    ...base,
    states: { ...base.states, idle },
  });

  it('accepts a looping state with variants', () => {
    const result = parseSkinManifest(
      withIdle({
        file: 'idle.png',
        frames: 12,
        fps: 12,
        loop: true,
        variantChance: 0.2,
        variants: [{ file: 'idle-look.png', frames: 18, fps: 12 }],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.manifest.states.idle?.variants).toHaveLength(1);
    expect(result.manifest.states.idle?.variantChance).toBe(0.2);
  });

  it('omits the variants key entirely when there are none', () => {
    const result = parseSkinManifest(base);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.manifest.states.idle?.variants).toBeUndefined();
  });

  it('rejects variants on a one-shot, which has no cycle to interrupt', () => {
    const result = parseSkinManifest(
      withIdle({
        file: 'idle.png',
        frames: 12,
        fps: 12,
        loop: false,
        variants: [{ file: 'idle-look.png', frames: 18, fps: 12 }],
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(' ')).toContain('only a looping state');
  });

  it('rejects a variant filename that escapes the skin directory', () => {
    // Skins are third-party content, so a variant gets the same check the
    // main sheet has always had.
    for (const file of ['../secrets.png', 'nested/one.png', 'back\\slash.png']) {
      const result = parseSkinManifest(
        withIdle({
          file: 'idle.png',
          frames: 12,
          fps: 12,
          loop: true,
          variants: [{ file, frames: 4, fps: 12 }],
        }),
      );
      expect(result.ok, `${file} should be rejected`).toBe(false);
    }
  });

  it('rejects an out-of-range variant chance', () => {
    for (const variantChance of [-0.1, 1.4, 'often', Number.NaN]) {
      const result = parseSkinManifest(
        withIdle({
          file: 'idle.png',
          frames: 12,
          fps: 12,
          loop: true,
          variantChance,
          variants: [{ file: 'idle-look.png', frames: 18, fps: 12 }],
        }),
      );
      expect(result.ok, `${String(variantChance)} should be rejected`).toBe(false);
    }
  });

  it('holds variants to the same fps ceiling as a state', () => {
    const result = parseSkinManifest(
      withIdle({
        file: 'idle.png',
        frames: 12,
        fps: 12,
        loop: true,
        variants: [{ file: 'fast.png', frames: 4, fps: 60 }],
      }),
    );
    expect(result.ok).toBe(false);
  });
});

describe('pickVariant', () => {
  const animation = {
    file: 'idle.png',
    frames: 12,
    fps: 12,
    loop: true,
    variantChance: 0.2,
    variants: [
      { file: 'a.png', frames: 4, fps: 12 },
      { file: 'b.png', frames: 4, fps: 12 },
    ],
  };

  it('returns nothing when the roll misses', () => {
    expect(pickVariant(animation, 0.2)).toBeNull();
    expect(pickVariant(animation, 0.9)).toBeNull();
  });

  it('splits the hit across the variants evenly', () => {
    // The roll does double duty: under the chance at all, then rescaled to
    // choose. The first half of the window picks the first variant.
    expect(pickVariant(animation, 0.0)?.file).toBe('a.png');
    expect(pickVariant(animation, 0.09)?.file).toBe('a.png');
    expect(pickVariant(animation, 0.11)?.file).toBe('b.png');
    expect(pickVariant(animation, 0.199)?.file).toBe('b.png');
  });

  it('never picks anything without variants or without a chance', () => {
    expect(pickVariant({ ...animation, variants: [] }, 0)).toBeNull();
    expect(pickVariant({ ...animation, variantChance: 0 }, 0)).toBeNull();
    const plain: SkinStateAnimation = { file: 'x', frames: 1, fps: 1, loop: true };
    expect(pickVariant(plain, 0)).toBeNull();
  });

  it('stays in range at the very top of the window', () => {
    // Math.random() can return values arbitrarily close to the chance; an
    // off-by-one here would index past the end of the array.
    expect(pickVariant(animation, 0.19999999)).not.toBeNull();
  });
});
