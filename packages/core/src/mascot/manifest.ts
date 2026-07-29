/**
 * Skin manifest — the public contract for community skins.
 *
 * Validated at runtime because manifests are third-party data. Frame counts
 * are never hardcoded anywhere in the app (RULE 4). Hand-rolled rather than
 * schema-library-based to keep packages/core dependency-free.
 */

import { isMascotState, type MascotState, V1_STATES } from './state.js';

export interface SkinStateAnimation {
  /** PNG filename relative to the skin directory. */
  readonly file: string;
  readonly frames: number;
  readonly fps: number;
  readonly loop: boolean;
}

export interface SkinManifest {
  readonly name: string;
  readonly version: string;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly defaultState: MascotState;
  readonly states: Readonly<Partial<Record<MascotState, SkinStateAnimation>>>;
  /** Present on third-party skins. See LICENSING.md. */
  readonly author?: string;
  readonly license?: string;
  readonly source?: string;
}

export type ManifestResult =
  | { readonly ok: true; readonly manifest: SkinManifest }
  | { readonly ok: false; readonly errors: readonly string[] };

/** Hard bounds. 8-12 is the intended range; anything above 24 is a mistake. */
export const MIN_FPS = 1;
export const MAX_FPS = 24;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isPositiveInt = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v > 0;

function validateAnimation(
  stateName: string,
  raw: unknown,
  errors: string[],
): SkinStateAnimation | null {
  if (!isRecord(raw)) {
    errors.push(`states.${stateName}: expected an object`);
    return null;
  }

  const { file, frames, fps, loop } = raw;
  let valid = true;

  if (typeof file !== 'string' || file.length === 0) {
    errors.push(`states.${stateName}.file: expected a non-empty string`);
    valid = false;
  } else if (file.includes('..') || file.includes('/') || file.includes('\\')) {
    // Skins are third-party content; never let a manifest escape its directory.
    errors.push(`states.${stateName}.file: must be a bare filename, got "${file}"`);
    valid = false;
  }

  if (!isPositiveInt(frames)) {
    errors.push(`states.${stateName}.frames: expected a positive integer`);
    valid = false;
  }

  if (!isPositiveInt(fps)) {
    errors.push(`states.${stateName}.fps: expected a positive integer`);
    valid = false;
  } else if (fps < MIN_FPS || fps > MAX_FPS) {
    errors.push(`states.${stateName}.fps: must be between ${MIN_FPS} and ${MAX_FPS}, got ${fps}`);
    valid = false;
  }

  if (typeof loop !== 'boolean') {
    errors.push(`states.${stateName}.loop: expected a boolean`);
    valid = false;
  }

  if (!valid) return null;
  return {
    file: file as string,
    frames: frames as number,
    fps: fps as number,
    loop: loop as boolean,
  };
}

/**
 * Parse and validate an unknown value (typically `JSON.parse` output) into a
 * SkinManifest. Collects every error rather than failing on the first, so a
 * skin author sees the whole list at once.
 */
export function parseSkinManifest(raw: unknown): ManifestResult {
  const errors: string[] = [];

  if (!isRecord(raw)) {
    return { ok: false, errors: ['manifest: expected a JSON object'] };
  }

  if (typeof raw.name !== 'string' || raw.name.length === 0) {
    errors.push('name: expected a non-empty string');
  }
  if (typeof raw.version !== 'string' || raw.version.length === 0) {
    errors.push('version: expected a non-empty string');
  }
  if (!isPositiveInt(raw.frameWidth)) {
    errors.push('frameWidth: expected a positive integer');
  }
  if (!isPositiveInt(raw.frameHeight)) {
    errors.push('frameHeight: expected a positive integer');
  }

  const states: Partial<Record<MascotState, SkinStateAnimation>> = {};
  if (!isRecord(raw.states)) {
    errors.push('states: expected an object');
  } else {
    for (const [key, value] of Object.entries(raw.states)) {
      if (!isMascotState(key)) {
        errors.push(`states.${key}: unknown mascot state`);
        continue;
      }
      const animation = validateAnimation(key, value, errors);
      if (animation !== null) states[key] = animation;
    }

    // A skin that cannot render the V1 states is unusable.
    for (const required of V1_STATES) {
      if (states[required] === undefined) {
        errors.push(`states.${required}: required state is missing`);
      }
    }
  }

  const defaultState = raw.defaultState;
  if (!isMascotState(defaultState)) {
    errors.push('defaultState: expected a valid mascot state');
  } else if (states[defaultState] === undefined) {
    errors.push(`defaultState: "${defaultState}" has no animation defined`);
  }

  if (errors.length > 0) return { ok: false, errors };

  const manifest: SkinManifest = {
    name: raw.name as string,
    version: raw.version as string,
    frameWidth: raw.frameWidth as number,
    frameHeight: raw.frameHeight as number,
    defaultState: defaultState as MascotState,
    states,
    ...(typeof raw.author === 'string' ? { author: raw.author } : {}),
    ...(typeof raw.license === 'string' ? { license: raw.license } : {}),
    ...(typeof raw.source === 'string' ? { source: raw.source } : {}),
  };
  return { ok: true, manifest };
}

/**
 * Pick the animation for a state, falling back to the manifest's default.
 * Guarantees a renderable animation for any valid manifest.
 */
export function animationFor(manifest: SkinManifest, state: MascotState): SkinStateAnimation {
  return manifest.states[state] ?? manifest.states[manifest.defaultState]!;
}

/** Which frame index to show, given how long the animation has been running. */
export function frameAt(animation: SkinStateAnimation, elapsedMs: number): number {
  const frameDuration = 1000 / animation.fps;
  const index = Math.floor(Math.max(0, elapsedMs) / frameDuration);
  if (animation.loop) return index % animation.frames;
  return Math.min(index, animation.frames - 1);
}
