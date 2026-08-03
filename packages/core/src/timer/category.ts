/**
 * Splitting a category name into its icon and its words.
 *
 * Categories are stored as one string with the emoji glued to the front —
 * `"💼 Work Time"` — because that is what the create form submits. The overlay
 * shows only the icon (the badges under Mochi are 30px circles, there is no
 * room for words), while the dashboard shows the whole thing. Both need the
 * same answer about where the icon ends.
 *
 * The overlay used to do this with `name.slice(0, 2)`, which is right only for
 * emoji that happen to be exactly two UTF-16 units. `🏋️` is three (it carries
 * a variation selector) and `🧘‍♂️` is four (pictographic, zero-width joiner,
 * gender sign, variation selector) — and both are offered in the icon pickers.
 * Slicing those in half yields a *different* emoji, so the badge under Mochi
 * showed something other than what was chosen.
 */

/**
 * One emoji, including any variation selectors, skin-tone modifiers and
 * zero-width-joined parts that belong to it.
 */
const LEADING_EMOJI =
  /^\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})*(?:‍\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})*)*/u;

/** The default for a category saved without one. */
export const DEFAULT_CATEGORY_ICON = '🎯';

/** The emoji a category name starts with, or the default if it has none. */
export function categoryIcon(name: string, fallback = DEFAULT_CATEGORY_ICON): string {
  const match = LEADING_EMOJI.exec(name.trim());
  return match === null ? fallback : match[0];
}

/** The category name with its leading emoji removed. */
export function categoryLabel(name: string): string {
  const trimmed = name.trim();
  const match = LEADING_EMOJI.exec(trimmed);
  return match === null ? trimmed : trimmed.slice(match[0].length).trim();
}
