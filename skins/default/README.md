# Default skin

Mochi, drawn as what it's named after: a soft rice cake with a face.

The artwork is **generated procedurally** by [`scripts/generate-default-skin.mjs`](../../scripts/generate-default-skin.mjs) — original work under MIT, the same licence as the code, with no third-party asset licences to audit. Every shape is drawn from code (superellipse body, gradient fill, catchlights, blush, contact shadow), rendered at 4× and box-downsampled so the edges stay clean on a transparent window.

Regenerate after editing the script:

```bash
node scripts/generate-default-skin.mjs
```

| State     | Frames | FPS | What it does                                      |
| :-------- | -----: | --: | :------------------------------------------------ |
| `idle`    |     12 |   8 | Breathes gently, blinks near the end of the cycle |
| `working` |     12 |  12 | Glasses on, tiny laptop, quicker double-bounce    |
| `resting` |      8 |   4 | Eyes closed, slow sway, drifting `z`s             |

The body is deliberately **identical across all three states**. Mochi is differentiated by expression, accessory and motion — never by recolouring the whole character, which would read as three different mascots rather than one in three moods.

## Authoring a skin

A skin is a directory containing `manifest.json` and one horizontal sprite-sheet PNG per state. No paid tooling is required — Aseprite, Piskel, Krita or anything that exports a strip will do.

```json
{
  "name": "my-skin",
  "version": "1.0.0",
  "frameWidth": 128,
  "frameHeight": 128,
  "defaultState": "idle",
  "author": "Your Name",
  "license": "CC-BY-4.0",
  "source": "https://github.com/you/my-mochi-skin",
  "states": {
    "idle": { "file": "idle.png", "frames": 8, "fps": 8, "loop": true },
    "working": { "file": "working.png", "frames": 12, "fps": 12, "loop": true },
    "resting": { "file": "resting.png", "frames": 4, "fps": 4, "loop": true }
  }
}
```

### Rules

- **Sheets are horizontal strips.** Frame _n_ is at `x = n * frameWidth`.
- **`idle`, `working` and `resting` are required.** `thinking`, `speaking` and `alert` are V2 states; if you omit them Mochi falls back to `defaultState`.
- **`fps` must be 1–24.** Mochi is an always-on desktop app — 8–12 is the intended range. High frame rates get the app uninstalled, so they are rejected at load.
- **`file` must be a bare filename**, no paths. Manifests are third-party content and are not allowed to reference anything outside their own directory.
- **Transparent background.** The overlay window is transparent; anything you draw opaque becomes a visible box on the user's desktop.

Drop your skin in `<userData>/skins/<name>/` to test it without rebuilding. It appears in the skin picker automatically.

### Licensing

Code in this directory is MIT. **Artwork keeps its own license**, declared in the `license` field — CC BY 4.0, CC BY-SA 4.0, or whatever you choose. Mochi displays it in the skin picker. See [LICENSING.md](../../LICENSING.md).
