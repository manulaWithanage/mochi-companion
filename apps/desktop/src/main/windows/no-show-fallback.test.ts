import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A guard, not a unit test.
 *
 * Twice now a `setTimeout(..., Nms)` that force-shows the overlay or the setup
 * window has been added to "make sure the window appears", and twice it has had
 * to be removed. It is not harmless belt-and-braces:
 *
 *   setPaused(true) hides the overlay by calling win.hide(). A timer armed at
 *   window creation fires afterwards, sees a hidden window, and shows it again
 *   — un-hiding a mascot the user deliberately paused. Whether it happens at
 *   all depends on which callback wins a race, which is the worst kind of bug
 *   to reproduce.
 *
 * Showing a window is driven by 'ready-to-show'. If that event is not firing,
 * the fix belongs wherever the renderer fails to load, not in a timer that
 * papers over it and overrides pause state as a side effect.
 *
 * Reading the source is deliberate: these are BrowserWindow lifecycle wirings
 * with no seam to test through, and this catches a reintroduction in CI even if
 * it arrives with confident-sounding intent.
 *
 * Both observed reintroductions passed a *named* function to setTimeout, so
 * looking for `.show()` inside the timer's own text is not enough — the
 * reference has to be resolved.
 */

const read = (file: string): string => readFileSync(join(import.meta.dirname, file), 'utf8');

/** Strip comments, so prose about timers does not trip this. */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const SHOW_CALL = /\.(show|showInactive)\s*\(/;

/** Argument text of every `setTimeout(...)` call, via balanced-paren scanning. */
function setTimeoutArgs(code: string): string[] {
  const found: string[] = [];
  const call = /setTimeout\s*\(/g;
  let match: RegExpExecArray | null;

  while ((match = call.exec(code)) !== null) {
    let depth = 1;
    let i = match.index + match[0].length;
    const start = i;
    while (i < code.length && depth > 0) {
      const ch = code[i];
      if (ch === '(') depth += 1;
      else if (ch === ')') depth -= 1;
      i += 1;
    }
    found.push(code.slice(start, i - 1));
  }
  return found;
}

/** Names of local functions whose body shows a window. */
function showerNames(code: string): Set<string> {
  const names = new Set<string>();
  const decl =
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g;
  let match: RegExpExecArray | null;

  while ((match = decl.exec(code)) !== null) {
    // Take a generous window after the declaration; these helpers are short.
    const body = code.slice(match.index, match.index + 500);
    if (SHOW_CALL.test(body)) names.add(match[1]!);
  }

  const fn = /function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g;
  while ((match = fn.exec(code)) !== null) {
    const body = code.slice(match.index, match.index + 500);
    if (SHOW_CALL.test(body)) names.add(match[1]!);
  }
  return names;
}

describe.each(['overlay.ts', 'setup.ts'])('%s', (file) => {
  it('does not force a window visible on a timer', () => {
    const code = stripComments(read(file));
    const showers = showerNames(code);

    const offenders = setTimeoutArgs(code).filter((args) => {
      if (SHOW_CALL.test(args)) return true; // inline body shows a window
      const firstArg = args.split(',')[0]?.trim() ?? '';
      return showers.has(firstArg); // named reference to something that does
    });

    expect(
      offenders,
      `${file}: a timer that shows the window can override setPaused(true). ` +
        'Drive visibility from the ready-to-show event instead.',
    ).toEqual([]);
  });

  it('still shows the window when the renderer is ready', () => {
    // The other half of the contract: removing the timer must not leave a
    // window that never appears at all.
    const code = stripComments(read(file));
    expect(code).toMatch(/once\(\s*['"]ready-to-show['"]/);
    expect(code).toMatch(SHOW_CALL);
  });
});
