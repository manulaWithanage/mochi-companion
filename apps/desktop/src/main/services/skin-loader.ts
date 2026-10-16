/**
 * Loads skins from disk and hands the renderer data URLs.
 *
 * The renderer is sandboxed with no filesystem access, so sprite sheets are
 * read here and passed across the bridge already encoded. Manifests are
 * third-party content and are validated by @mochi/core before use (RULE 4).
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import {
  parseSkinManifest,
  type LoadedSkin,
  type MascotState,
  type SkinManifest,
  type SkinSummary,
} from '@mochi/core';

/** Skins bundled with the app, plus any the user drops in userData/skins. */
function skinRoots(): string[] {
  const bundled = app.isPackaged
    ? join(process.resourcesPath, 'skins')
    : join(import.meta.dirname, '../../../../skins');
  return [bundled, join(app.getPath('userData'), 'skins')];
}

/**
 * A skin name must be a bare directory name.
 *
 * The name arrives from the renderer and is joined into a path, so a path
 * separator or a `..` segment could climb out of the skin roots and read
 * arbitrary directories (RULE 1: renderer input is untrusted).
 */
function isSafeSkinName(name: string): boolean {
  return name.length > 0 && !/[/\\]/.test(name) && name !== '.' && name !== '..';
}

function findSkinDir(name: string): string | null {
  if (!isSafeSkinName(name)) return null;
  for (const root of skinRoots()) {
    const candidate = join(root, name);
    if (existsSync(join(candidate, 'manifest.json'))) return candidate;
  }
  return null;
}

function readManifest(dir: string): SkinManifest | null {
  try {
    const raw = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
    const result = parseSkinManifest(raw);
    if (!result.ok) {
      console.error(`[skin] ${dir} is invalid:\n  ${result.errors.join('\n  ')}`);
      return null;
    }
    return result.manifest;
  } catch (error) {
    console.error(`[skin] could not read ${dir}:`, error);
    return null;
  }
}

const toSummary = (m: SkinManifest): SkinSummary => ({
  name: m.name,
  frameWidth: m.frameWidth,
  frameHeight: m.frameHeight,
  ...(m.license !== undefined ? { license: m.license } : {}),
  ...(m.author !== undefined ? { author: m.author } : {}),
});

export function listSkins(): readonly SkinSummary[] {
  const found = new Map<string, SkinSummary>();
  for (const root of skinRoots()) {
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root)) {
      const dir = join(root, entry);
      // A broken entry — a dangling symlink, a permissions hole — must skip
      // itself, not take the whole listing down with it.
      let isDirectory: boolean;
      try {
        isDirectory = statSync(dir).isDirectory();
      } catch {
        continue;
      }
      if (!isDirectory) continue;
      const manifest = readManifest(dir);
      if (manifest !== null) found.set(manifest.name, toSummary(manifest));
    }
  }
  return [...found.values()];
}

export function loadSkin(name: string): LoadedSkin {
  const dir = findSkinDir(name);
  if (dir === null) throw new Error(`Skin "${name}" not found`);

  const manifest = readManifest(dir);
  if (manifest === null) throw new Error(`Skin "${name}" has an invalid manifest`);

  const states: Record<string, LoadedSkin['states'][MascotState]> = {};
  for (const [state, animation] of Object.entries(manifest.states)) {
    if (animation === undefined) continue;
    try {
      // Filenames are validated as bare names by parseSkinManifest, so this
      // cannot escape the skin directory.
      const bytes = readFileSync(join(dir, animation.file));

      /*
       * A variant whose file is missing is dropped, not fatal. It is a
       * decoration on a state that already has a working base sheet, so
       * failing the whole skin over one would take the mascot off screen to
       * avoid losing an occasional stretch. The error is still logged, because
       * a silently shorter variant list is the kind of thing that otherwise
       * goes unnoticed for months.
       */
      const variants = (animation.variants ?? []).flatMap((variant) => {
        try {
          const variantBytes = readFileSync(join(dir, variant.file));
          return [
            {
              dataUrl: `data:image/png;base64,${variantBytes.toString('base64')}`,
              frames: variant.frames,
              fps: variant.fps,
              loop: false,
            },
          ];
        } catch (error) {
          console.error(`[skin] missing variant ${variant.file} for state ${state}:`, error);
          return [];
        }
      });

      states[state] = {
        dataUrl: `data:image/png;base64,${bytes.toString('base64')}`,
        frames: animation.frames,
        fps: animation.fps,
        loop: animation.loop,
        ...(variants.length > 0 ? { variants } : {}),
        // Dropped along with the variants: a chance with nothing to pick from
        // would roll every loop and never produce anything.
        ...(variants.length > 0 && animation.variantChance !== undefined
          ? { variantChance: animation.variantChance }
          : {}),
      };
    } catch (error) {
      console.error(`[skin] missing sheet ${animation.file} for state ${state}:`, error);
    }
  }

  if (states[manifest.defaultState] === undefined) {
    throw new Error(`Skin "${name}" cannot render its default state`);
  }

  return {
    summary: toSummary(manifest),
    defaultState: manifest.defaultState,
    states: states as LoadedSkin['states'],
  };
}
