/**
 * Integration check on the shipped default skin.
 *
 * Catches the drift that is easy to introduce by hand: editing the generator
 * so a sheet gains frames, but forgetting to update manifest.json. The
 * renderer would then slice frames at the wrong offsets and the mascot would
 * animate through garbage.
 *
 * Reads files, so it lives in a test (exempt from the RULE 2 import ban)
 * rather than in library code.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseSkinManifest, type SkinStateAnimation } from './manifest.js';
import { ALL_STATES, V1_STATES } from './state.js';

const SKIN_DIR = join(fileURLToPath(import.meta.url), '../../../../../skins/default');

/** Width and height straight out of the PNG IHDR chunk. */
function pngSize(path: string): { width: number; height: number } {
  const buf = readFileSync(path);
  const signature = buf.subarray(0, 8).toString('hex');
  expect(signature).toBe('89504e470d0a1a0a');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe('shipped default skin', () => {
  const raw: unknown = JSON.parse(readFileSync(join(SKIN_DIR, 'manifest.json'), 'utf8'));
  const result = parseSkinManifest(raw);

  it('passes its own validator', () => {
    if (!result.ok) {
      throw new Error(`default skin manifest is invalid:\n  ${result.errors.join('\n  ')}`);
    }
    expect(result.ok).toBe(true);
  });

  it('declares every V1 state', () => {
    if (!result.ok) return;
    for (const state of V1_STATES) {
      expect(result.manifest.states[state]).toBeDefined();
    }
  });

  it('has sheet dimensions matching the declared frame counts', () => {
    if (!result.ok) return;
    const { frameWidth, frameHeight, states } = result.manifest;

    for (const [state, animation] of Object.entries(states) as [
      string,
      SkinStateAnimation | undefined,
    ][]) {
      if (animation === undefined) continue;
      const { width, height } = pngSize(join(SKIN_DIR, animation.file));

      expect(
        width,
        `${state}: ${animation.file} is ${width}px wide but the manifest declares ` +
          `${animation.frames} frames x ${frameWidth}px = ${animation.frames * frameWidth}px`,
      ).toBe(animation.frames * frameWidth);

      expect(height, `${state}: ${animation.file} height must equal frameHeight`).toBe(frameHeight);
    }
  });

  it('keeps every state inside the always-on-app frame budget', () => {
    if (!result.ok) return;
    for (const animation of Object.values(result.manifest.states)) {
      if (animation === undefined) continue;
      expect(animation.fps).toBeLessThanOrEqual(12);
    }
  });
});

describe('shipped default skin variants', () => {
  const raw: unknown = JSON.parse(readFileSync(join(SKIN_DIR, 'manifest.json'), 'utf8'));
  const result = parseSkinManifest(raw);

  it('declares a sheet for every state the app can enter', () => {
    // The bug this is here to stop: `speaking` and `thinking` were declared
    // mascot states with no artwork, and a missing sheet silently falls back
    // to the default state — so the state machine worked perfectly and
    // nothing on screen changed.
    if (!result.ok) return;
    for (const state of ALL_STATES) {
      expect(result.manifest.states[state], `${state} has no sheet`).toBeDefined();
    }
  });

  it('has variant sheet dimensions matching their declared frame counts', () => {
    if (!result.ok) return;
    const { frameWidth, frameHeight, states } = result.manifest;

    for (const [state, animation] of Object.entries(states)) {
      for (const variant of animation?.variants ?? []) {
        const { width, height } = pngSize(join(SKIN_DIR, variant.file));
        expect(
          width,
          `${state}: ${variant.file} is ${width}px wide but declares ${variant.frames} frames`,
        ).toBe(variant.frames * frameWidth);
        expect(height, `${state}: ${variant.file} height must equal frameHeight`).toBe(frameHeight);
      }
    }
  });

  it('keeps every variant inside the frame budget too', () => {
    if (!result.ok) return;
    for (const animation of Object.values(result.manifest.states)) {
      for (const variant of animation?.variants ?? []) {
        expect(variant.fps).toBeLessThanOrEqual(12);
      }
    }
  });

  it('gives every state with variants a chance of playing one', () => {
    // Variants with no chance never play, which looks exactly like having no
    // variants at all.
    if (!result.ok) return;
    for (const [state, animation] of Object.entries(result.manifest.states)) {
      if ((animation?.variants ?? []).length === 0) continue;
      expect(animation?.variantChance, `${state} has variants but no chance`).toBeGreaterThan(0);
    }
  });
});
