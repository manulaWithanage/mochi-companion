/**
 * Skin manifest — the public contract for community skins.
 *
 * Validated at runtime because manifests are third-party data. Frame counts
 * are never hardcoded anywhere in the app (RULE 4). Hand-rolled rather than
 * schema-library-based to keep packages/core dependency-free.
 */

import { isMascotState, type MascotState, V1_STATES } from './state.js';

/**
 * A one-shot animation played occasionally in place of a looping state.
 *
 * Idle breakers. A loop the eye has already learned stops registering as
 * movement after about a minute, and what restores attention is a *break*
 * rather than more detail in the loop — so a glance or a stretch, now and
 * then, does more than doubling the frame count would.
 *
 * Variants are deliberately not mascot states. They carry no meaning: nothing
 * in the app decides to glance, and no event produces one. Making them states
 * would put entries in the state machine that no producer ever sets, which is
 * exactly the shape `speaking` and `thinking` were in before this pass.
 *
 * Always one-shot, so there is no `loop` field to set wrongly: a variant that
 * looped would never give the base state back.
 */
export interface SkinStateVariant {
  /** PNG filename relative to the skin directory. */
  readonly file: string;
  readonly frames: number;
  readonly fps: number;
}

export interface SkinStateAnimation {
  /** PNG filename relative to the skin directory. */
  readonly file: string;
  readonly frames: number;
  readonly fps: number;
  readonly loop: boolean;
  /**
   * Alternative one-shots for this state. Looping states only — a one-shot
   * has no completed cycle to interrupt.
   */
  readonly variants?: readonly SkinStateVariant[];
  /**
   * Chance, per completed loop, that a variant plays instead of the next
   * cycle. 0 to 1; absent means never.
   *
   * Low by design. At 0.15 and a two-second idle loop a variant turns up
   * roughly every thirteen seconds, which is often enough to keep the mascot
   * alive and rare enough that it still registers as something happening.
   */
  readonly variantChance?: number;
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

  const variants = validateVariants(stateName, raw.variants, loop === true, errors);
  if (variants === null) valid = false;

  let variantChance: number | undefined;
  if (raw.variantChance !== undefined) {
    if (
      typeof raw.variantChance !== 'number' ||
      !Number.isFinite(raw.variantChance) ||
      raw.variantChance < 0 ||
      raw.variantChance > 1
    ) {
      errors.push(`states.${stateName}.variantChance: expected a number between 0 and 1`);
      valid = false;
    } else {
      variantChance = raw.variantChance;
    }
  }

  if (!valid) return null;
  return {
    file: file as string,
    frames: frames as number,
    fps: fps as number,
    loop: loop as boolean,
    ...(variants !== null && variants.length > 0 ? { variants } : {}),
    ...(variantChance !== undefined ? { variantChance } : {}),
  };
}

/**
 * Validate the variants array.
 *
 * Returns null on error, an array otherwise — including an empty one when the
 * field is absent, which is the common case and not a problem.
 */
function validateVariants(
  stateName: string,
  raw: unknown,
  looping: boolean,
  errors: string[],
): SkinStateVariant[] | null {
  if (raw === undefined) return [];

  if (!Array.isArray(raw)) {
    errors.push(`states.${stateName}.variants: expected an array`);
    return null;
  }

  if (!looping) {
    // A one-shot has no completed cycle for a variant to replace, so this is
    // a manifest that will never do what its author intended.
    errors.push(`states.${stateName}.variants: only a looping state can have variants`);
    return null;
  }

  const variants: SkinStateVariant[] = [];
  let valid = true;

  raw.forEach((entry, i) => {
    if (!isRecord(entry)) {
      errors.push(`states.${stateName}.variants[${i}]: expected an object`);
      valid = false;
      return;
    }
    const { file, frames, fps } = entry;

    if (typeof file !== 'string' || file.length === 0) {
      errors.push(`states.${stateName}.variants[${i}].file: expected a non-empty string`);
      valid = false;
    } else if (file.includes('..') || file.includes('/') || file.includes('\\')) {
      // Same escape check as the main animation. Skins are third-party content.
      errors.push(`states.${stateName}.variants[${i}].file: must be a bare filename`);
      valid = false;
    }

    if (!isPositiveInt(frames)) {
      errors.push(`states.${stateName}.variants[${i}].frames: expected a positive integer`);
      valid = false;
    }

    if (!isPositiveInt(fps)) {
      errors.push(`states.${stateName}.variants[${i}].fps: expected a positive integer`);
      valid = false;
    } else if (fps < MIN_FPS || fps > MAX_FPS) {
      errors.push(
        `states.${stateName}.variants[${i}].fps: must be between ${MIN_FPS} and ${MAX_FPS}`,
      );
      valid = false;
    }

    if (valid) {
      variants.push({ file: file as string, frames: frames as number, fps: fps as number });
    }
  });

  return valid ? variants : null;
}

/**
 * Decide whether the next idle cycle is a variant, and which one.
 *
 * Pure, with the roll handed in, so the renderer's randomness is testable and
 * the decision does not live inside an animation loop.
 */
export function pickVariant<T>(
  animation: {
    readonly variants?: readonly T[];
    readonly variantChance?: number;
  },
  roll: number,
): T | null {
  const variants = animation.variants;
  if (variants === undefined || variants.length === 0) return null;

  const chance = animation.variantChance ?? 0;
  if (chance <= 0) return null;

  // One roll decides both questions: the first slice of it is "does a variant
  // play at all", and the remainder, rescaled, chooses which. Two rolls would
  // need two sources of randomness threaded through the loop for no gain.
  if (roll >= chance) return null;
  const within = roll / chance;
  const index = Math.min(variants.length - 1, Math.floor(within * variants.length));
  return variants[index] ?? null;
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
