/**
 * The tray icon, drawn at runtime.
 *
 * Drawn rather than shipped for the same reason the mascot is
 * ([[procedural-artwork]]): the artwork is original, parameterised, and there
 * is no binary asset in the repository to license, lose, or forget to rebuild
 * for a new density.
 *
 * What this replaces was a flat 16x16 dot with aliased edges, which read as a
 * missing icon rather than as Mochi. The shape here is the mascot's own
 * silhouette — a squircle body, two eyes — at the only two sizes Windows and
 * macOS actually ask for.
 *
 * **Supersampling is not optional at this size.** A 16-pixel circle tested
 * pixel-by-pixel has a visibly stepped edge; every pixel is either fully
 * coloured or fully transparent, and at 16px those steps are a third of the
 * icon's radius. Each representation is therefore rendered at 4x and box-
 * filtered down, which is what produces the antialiased edge.
 */

import { nativeImage } from 'electron';

/** The mascot's palette, kept in step with `scripts/generate-default-skin.mjs`. */
const BODY_TOP: Rgb = [255, 250, 251];
const BODY_BOTTOM: Rgb = [246, 219, 228];
const RIM: Rgb = [226, 190, 203];
const INK: Rgb = [74, 52, 68];

type Rgb = readonly [number, number, number];

/** Supersampling factor. 4x is enough; 8x costs four times as much for no visible gain. */
const SS = 4;

/**
 * Logical sizes the platforms ask for.
 *
 * Windows wants 16px and reads a 32px representation on a 200% display;
 * macOS wants 16pt and the @2x alongside it. Nothing asks for more, and a
 * representation nobody requests is wasted startup time.
 */
const SCALES = [1, 2] as const;
const BASE = 16;

/**
 * A superellipse, matching the mascot's body.
 *
 * `n = 2` would be an ellipse. The mascot uses 2.6, which is slightly boxier
 * and reads as a rice cake rather than a ball — the difference is subtle at
 * 192px and still visible at 16.
 */
function squircleTest(cx: number, cy: number, rx: number, ry: number, n = 2.6) {
  return (x: number, y: number): boolean =>
    Math.abs((x - cx) / rx) ** n + Math.abs((y - cy) / ry) ** n <= 1;
}

function ellipseTest(cx: number, cy: number, rx: number, ry: number) {
  return squircleTest(cx, cy, rx, ry, 2);
}

/**
 * Render one representation.
 *
 * `template` produces the macOS menu bar form: shape in the alpha channel and
 * nothing in the colour channels, because the system recolours a template
 * image to match the bar — which flips between black and white with the
 * appearance setting, and again when the bar sits over a light wallpaper. A
 * coloured icon is passed through untouched, so Mochi's pink would stay pink
 * against a dark menu bar and read as a foreign object.
 */
function renderIcon(logical: number, template: boolean): Buffer {
  const size = logical * SS;
  // Float accumulation per channel, so the downsample can average honestly.
  const rgba = new Float64Array(size * size * 4);

  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  // Just inside the frame: a tray icon that touches its own edges looks
  // cropped next to every other icon in the bar.
  const rx = size * 0.44;
  const ry = size * 0.41;

  const body = squircleTest(cx, cy + size * 0.015, rx, ry);
  const rim = squircleTest(cx, cy + size * 0.015, rx * 1.045, ry * 1.05);

  // Eyes sit high and wide, as on the mascot. At 16px they are about a pixel
  // and a half each, which is why they are drawn into the supersampled buffer
  // rather than stamped onto the final one.
  const eyeR = size * 0.072;
  const eyeDx = size * 0.165;
  const eyeY = cy - size * 0.055;
  const eyeL = ellipseTest(cx - eyeDx, eyeY, eyeR * 0.82, eyeR);
  const eyeR2 = ellipseTest(cx + eyeDx, eyeY, eyeR * 0.82, eyeR);

  const put = (i: number, colour: Rgb, alpha: number): void => {
    rgba[i] = colour[0];
    rgba[i + 1] = colour[1];
    rgba[i + 2] = colour[2];
    rgba[i + 3] = alpha * 255;
  };

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;

      if (!rim(x, y)) continue;

      if (template) {
        // Shape only. The eyes are punched out as holes so the silhouette is
        // recognisably a face once the system fills it with a single colour.
        const hole = eyeL(x, y) || eyeR2(x, y);
        put(i, [0, 0, 0], hole ? 0 : 1);
        continue;
      }

      if (!body(x, y)) {
        put(i, RIM, 0.85);
        continue;
      }

      if (eyeL(x, y) || eyeR2(x, y)) {
        put(i, INK, 0.95);
        continue;
      }

      // Vertical gradient, top to bottom, as on the body sprite.
      const t = (y - (cy - ry)) / (ry * 2);
      const clamped = Math.min(1, Math.max(0, t));
      put(
        i,
        [
          BODY_TOP[0] + (BODY_BOTTOM[0] - BODY_TOP[0]) * clamped,
          BODY_TOP[1] + (BODY_BOTTOM[1] - BODY_TOP[1]) * clamped,
          BODY_TOP[2] + (BODY_BOTTOM[2] - BODY_TOP[2]) * clamped,
        ],
        1,
      );
    }
  }

  return downsampleToBgra(rgba, size, logical);
}

/**
 * Box-filter the supersampled buffer down, and convert to the BGRA order
 * `createFromBuffer` expects.
 *
 * Colour is weighted by alpha before averaging. Without that, transparent
 * pixels — which carry colour 0,0,0 — drag the edge towards black and leave a
 * dark fringe around the icon.
 */
function downsampleToBgra(src: Float64Array, size: number, out: number): Buffer {
  const buffer = Buffer.alloc(out * out * 4);
  const cells = SS * SS;

  for (let y = 0; y < out; y += 1) {
    for (let x = 0; x < out; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const i = ((y * SS + sy) * size + (x * SS + sx)) * 4;
          const alpha = src[i + 3] ?? 0;
          r += (src[i] ?? 0) * alpha;
          g += (src[i + 1] ?? 0) * alpha;
          b += (src[i + 2] ?? 0) * alpha;
          a += alpha;
        }
      }

      const o = (y * out + x) * 4;
      if (a > 0) {
        buffer[o] = Math.round(b / a);
        buffer[o + 1] = Math.round(g / a);
        buffer[o + 2] = Math.round(r / a);
      }
      buffer[o + 3] = Math.round(a / cells);
    }
  }

  return buffer;
}

/**
 * The tray icon, with a representation for each density.
 *
 * Built once at startup and reused: the maths is cheap but it is not free, and
 * the tray rebuilds its menu on every timer tick.
 */
export function mochiTrayIcon(): Electron.NativeImage {
  const template = process.platform === 'darwin';
  const image = nativeImage.createEmpty();

  for (const scaleFactor of SCALES) {
    const logical = BASE * scaleFactor;
    image.addRepresentation({
      scaleFactor,
      width: logical,
      height: logical,
      buffer: renderIcon(logical, template),
    });
  }

  if (template) image.setTemplateImage(true);
  return image;
}
