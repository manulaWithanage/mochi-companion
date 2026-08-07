# Desktop UI guidelines

How Mochi's dashboard is built, and why. Written after auditing all eleven tabs,
so every rule below has a specific thing it is preventing rather than a
preference behind it.

Scope is the settings/dashboard window. The overlay has its own constraints —
see RULE 3 and RULE 4 in `CLAUDE.md`, which this does not override.

---

## Where styling lives

**Inline React styles for appearance. One stylesheet for interaction.**

The project is deliberately dependency-light: no CSS modules, no Tailwind, no
styled-components. Appearance is an inline `style` object, and shared values
come from `setup/ui.ts`.

The exception is `setup/ui.css`, the only stylesheet, and it exists because
inline styles **cannot express a pseudo-class**. `:hover`, `:active` and
`:focus-visible` have nowhere else to go. Before it existed, `button()` had no
hover state at all, and only about fourteen call sites out of dozens hand-rolled
one into React state — every other button in the app was dead under the pointer.

Rules:

- Anything that reacts to the pointer or the keyboard goes in `ui.css`.
- Anything static goes inline, using tokens from `ui.ts`.
- Do not add a second stylesheet. Two files disagreeing about hover is worse
  than none.

## Element selectors, not classes

`ui.css` styles `button`, `input`, `select` and `[role="button"]` directly.

That is intentional. A class means opting in at every call site across eleven
tab files, and **the controls most in need of a hover state are exactly the
ones nobody remembered to give one**. An element rule reaches all of them at
once, including any button written next week.

Inline styles beat a stylesheet on specificity, so components that already
animate themselves keep their own behaviour. The category pills scale to 1.22
from React state and are unaffected. The stylesheet only fills gaps.

## Motion

Three durations. Use them; do not invent a fourth.

| Token         | Value | For                                                                 |
| :------------ | :---- | :------------------------------------------------------------------ |
| `MOTION.fast` | 120ms | Pressed, ticked, switched. Instant, or it reads as lag.             |
| `MOTION.base` | 160ms | Hover and focus. Visible travelling, still keeps up with a pointer. |
| `MOTION.slow` | 240ms | Entering or leaving the screen, which needs time to be read.        |

Two easings:

- `MOTION.easeOut` — decelerating. The default for interface motion.
- `MOTION.easeSpring` — overshoots and returns. **Arrivals only.** On a hover it
  reads as a wobble.

The audit found twelve distinct transition strings doing the same job:
`all 160ms ease`, `all 140ms ease`, `all 0.15s ease`, `all 150ms ease`,
`color 0.15s`, and more. Close enough to look accidental rather than designed,
and different enough that two adjacent controls settled at different moments.

### Never `transition: all`

Two concrete reasons, not style:

1. It animates every property that changes, including ones that trigger layout.
2. **It silently resets any longhand set beside it.** A `transitionDelay` next
   to a `transition` shorthand is overwritten — which is how the radial menu's
   staggered entrance came to race its own reset. React warns about this; the
   warning was only seen by running the app.

Use `transition([...properties], ms, easing)` from `ui.ts`, or name the
properties by hand. Prefer `transform` and `opacity`: the compositor can animate
those without touching layout.

## Interaction states

Every interactive control needs four, and they are now automatic:

| State | Treatment                                      |
| :---- | :--------------------------------------------- |
| Rest  | Whatever the component defines inline.         |
| Hover | Lift 1px, `filter: brightness(1.14)`.          |
| Press | Return to 0, scale 0.97, at `MOTION.fast`.     |
| Focus | 2px accent outline, **`:focus-visible` only**. |

**Brightness, not a hover colour.** Buttons here carry a dozen different
backgrounds — gradients, tints, plain transparency — and no single hover colour
suits all of them. `filter: brightness` works against every one and cannot clash
with a background the stylesheet has never seen.

**`:focus-visible`, not `:focus`.** `:focus` rings a button the moment it is
clicked, which is the reason focus styling so often gets deleted outright and
takes keyboard users with it. `:focus-visible` is the browser's own answer.

**Press must be faster than hover.** A press that eases in at hover speed feels
like the button is thinking about it.

## Reduced motion

`prefers-reduced-motion: reduce` disables transitions and the hover lift. Not
"animate less" — a shortened transform is still a transform, and motion
sickness does not care about duration. Colour and opacity are left alone
because they are not movement.

The operating system already knows who needs this. Nothing was asking.

## Colour

From `C` in `ui.ts`. Never hardcode a hex that is already a token.

| Token                             | Use                                                |
| :-------------------------------- | :------------------------------------------------- |
| `C.bg` / `C.panel` / `C.panelAlt` | Surfaces, darkest to lightest                      |
| `C.border` / `C.borderStrong`     | Hairlines; `borderStrong` on hover or emphasis     |
| `C.text` / `C.dim` / `C.faint`    | Body, supporting, metadata                         |
| `C.accent`                        | One accent per view. It means "this is the thing". |
| `C.good` / `C.warn`               | Outcome only, never decoration                     |

`C.accent` earns its weight by being rare. A screen with four accented controls
has none.

## Icons

**Vector, never emoji, for anything the interface owns.**

Emoji are drawn by the operating system, so a row of them is a row of different
typefaces at different weights and colours, none of them matching the text
beside them. The setup wizard had five emoji headings that each rendered in a
different face. Use `setup/icons.tsx`, which inherits `currentColor` and lines
up with adjacent text.

The exception is **user data**: a project's or routine's emoji is the icon the
user picked, and it is shown as they chose it.

## Writing

- **No em dashes.** An em dash joining two clauses is the surest tell that a
  sentence was generated. Use a full stop where the second half is its own
  thought, a colon where it explains the first.
- Say what a control does, not what it is. "Hide Mochi. Bring it back from the
  tray" beats "Toggle visibility".
- Never state something the code does not do. Two toggles in the setup wizard
  were removed rather than restyled because nothing read them.

## Before adding a control

1. Does `ui.ts` already have the token?
2. Does it need a hover state the stylesheet does not already give it? Usually
   not.
3. Is the label true?
4. Does it work from the keyboard?

## Known inconsistencies

Recorded rather than hidden. All eleven tabs render, none of these break
anything, and none is worth a risky sweep while other work is in flight:

- Roughly fourteen components hand-roll hover into React state. They still work
  and the stylesheet does not fight them, but new code should not copy the
  pattern.
- Several transitions still name their own durations rather than using `MOTION`.
- `MochiTab` and `GmailSettingsPanel` each define a private `Toggle`. They should
  be one shared component.
- `SegmentedControl` and the sub-tab switch inside `SettingsView` are the same
  control, built twice.
