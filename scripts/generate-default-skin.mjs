/**
 * Draws the default Mochi skin.
 *
 * Original artwork, generated procedurally — MIT, same as the code, with no
 * third-party asset licences to audit. Run it and the sheets regenerate:
 *
 *   node scripts/generate-default-skin.mjs
 *
 * Rendered at 4x and box-downsampled for antialiasing, because hard pixel
 * edges on a transparent always-on-top window look like a cut-out sticker.
 *
 * The body is identical across states on purpose. Mochi is differentiated by
 * expression, accessory and motion — never by recolouring the whole
 * character, which reads as three different mascots.
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'skins', 'default');
// 192 rather than 128: the overlay draws the sprite into a 200px backing
// store, so a 128px source was being upscaled and going soft.
const FRAME = 192;
const SS = 4; // supersampling factor
/** Design unit — the character was proportioned against a 128px frame. */
const U = FRAME / 128;

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------
const BODY_TOP = [255, 250, 251];
const BODY_BOTTOM = [246, 219, 228];
const RIM = [226, 190, 203];
const SHADOW = [120, 96, 112];
const INK = [74, 52, 68];
const BLUSH = [250, 172, 190];
const GLASS = [120, 150, 190];
const LAPTOP = [198, 214, 236];
const LAPTOP_DARK = [150, 172, 205];
const ZZZ = [176, 158, 186];

// ---------------------------------------------------------------------------
// Tiny raster surface with alpha blending
// ---------------------------------------------------------------------------
class Surface {
  constructor(width, height) {
    this.w = width;
    this.h = height;
    this.data = new Float32Array(width * height * 4); // straight RGBA 0..255 / a 0..1
  }

  blend(x, y, rgb, a) {
    if (a <= 0 || x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    const dst = this.data;
    const da = dst[i + 3];
    const outA = a + da * (1 - a);
    if (outA <= 0) return;
    for (let c = 0; c < 3; c += 1) {
      dst[i + c] = (rgb[c] * a + dst[i + c] * da * (1 - a)) / outA;
    }
    dst[i + 3] = outA;
  }

  /** Fill wherever `inside(x, y)` is true, colour from `colour(x, y)`. */
  fill(bounds, inside, colour, alpha = 1) {
    const x0 = Math.max(0, Math.floor(bounds[0]));
    const y0 = Math.max(0, Math.floor(bounds[1]));
    const x1 = Math.min(this.w, Math.ceil(bounds[2]));
    const y1 = Math.min(this.h, Math.ceil(bounds[3]));
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        if (inside(x + 0.5, y + 0.5)) {
          this.blend(x, y, typeof colour === 'function' ? colour(x, y) : colour, alpha);
        }
      }
    }
  }

  /** Average SSxSS blocks down to the output resolution. */
  downsample(factor) {
    const out = new Uint8ClampedArray((this.w / factor) * (this.h / factor) * 4);
    const ow = this.w / factor;
    for (let y = 0; y < this.h / factor; y += 1) {
      for (let x = 0; x < ow; x += 1) {
        let r = 0,
          g = 0,
          b = 0,
          a = 0;
        for (let sy = 0; sy < factor; sy += 1) {
          for (let sx = 0; sx < factor; sx += 1) {
            const i = ((y * factor + sy) * this.w + (x * factor + sx)) * 4;
            const sa = this.data[i + 3];
            // Weight colour by alpha so transparent pixels do not wash out edges.
            r += this.data[i] * sa;
            g += this.data[i + 1] * sa;
            b += this.data[i + 2] * sa;
            a += sa;
          }
        }
        const o = (y * ow + x) * 4;
        if (a > 0) {
          out[o] = r / a;
          out[o + 1] = g / a;
          out[o + 2] = b / a;
        }
        out[o + 3] = (a / (factor * factor)) * 255;
      }
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------
const lerp = (a, b, t) => a + (b - a) * t;
const mixRgb = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** Superellipse — a squircle. n=2 is an ellipse; higher is boxier/softer. */
const squircle = (cx, cy, rx, ry, n = 2.6) => ({
  bounds: [cx - rx - 2, cy - ry - 2, cx + rx + 2, cy + ry + 2],
  inside: (x, y) => Math.abs((x - cx) / rx) ** n + Math.abs((y - cy) / ry) ** n <= 1,
});

const ellipse = (cx, cy, rx, ry) => squircle(cx, cy, rx, ry, 2);

const roundRect = (x, y, w, h, r) => ({
  bounds: [x - 1, y - 1, x + w + 1, y + h + 1],
  inside: (px, py) => {
    const dx = Math.max(x + r - px, 0, px - (x + w - r));
    const dy = Math.max(y + r - py, 0, py - (y + h - r));
    if (px < x || px > x + w || py < y || py > y + h) return false;
    return dx * dx + dy * dy <= r * r || dx === 0 || dy === 0;
  },
});

/** Downward-opening arc, used for closed/happy eyes and the mouth. */
const arc = (cx, cy, r, thickness, from, to) => ({
  bounds: [cx - r - thickness, cy - r - thickness, cx + r + thickness, cy + r + thickness],
  inside: (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    const d = Math.hypot(dx, dy);
    if (Math.abs(d - r) > thickness / 2) return false;
    let ang = Math.atan2(dy, dx);
    if (ang < 0) ang += Math.PI * 2;
    return ang >= from && ang <= to;
  },
});

// ---------------------------------------------------------------------------
// The character
// ---------------------------------------------------------------------------
function drawMochi(s, opts) {
  const { squash = 0, bob = 0, eyes = 'open', glasses = false, laptop = false, lean = 0 } = opts;

  const cx = (FRAME / 2) * SS;
  const cy = (FRAME / 2 + 2 * U + bob * U) * SS;
  const rx = (40 + squash) * U * SS;
  const ry = (36 - squash) * U * SS;

  // Contact shadow — grounds the character instead of leaving it floating.
  const shadowW = rx * 0.78 - squash * U * SS * 0.5;
  const shadow = ellipse(cx + lean * U * SS, cy + ry + 7 * U * SS, shadowW, 5 * U * SS);
  s.fill(shadow.bounds, shadow.inside, SHADOW, 0.16);

  const bx = cx + lean * U * SS;

  // Soft rim, then the body slightly inset so the rim reads as an outline.
  const rim = squircle(bx, cy, rx + 1.6 * U * SS, ry + 1.6 * U * SS);
  s.fill(rim.bounds, rim.inside, RIM, 0.55);

  const body = squircle(bx, cy, rx, ry);
  s.fill(body.bounds, body.inside, (x, y) => {
    const t = Math.min(1, Math.max(0, (y - (cy - ry)) / (ry * 2)));
    // Ease the gradient so the top stays bright and the falloff is soft.
    return mixRgb(BODY_TOP, BODY_BOTTOM, t * t * 0.9);
  });

  // Specular highlight, upper-left.
  const gloss = ellipse(bx - rx * 0.34, cy - ry * 0.46, rx * 0.26, ry * 0.17);
  s.fill(gloss.bounds, gloss.inside, [255, 255, 255], 0.5);

  const eyeY = cy - ry * 0.06;
  const eyeDx = rx * 0.36;
  const eyeR = 5.6 * U * SS;

  // Blush
  for (const dir of [-1, 1]) {
    const b = ellipse(bx + dir * rx * 0.62, eyeY + eyeR * 1.15, 6.2 * U * SS, 4 * U * SS);
    s.fill(b.bounds, b.inside, BLUSH, 0.42);
  }

  if (eyes === 'closed' || eyes === 'happy') {
    // Upward-curving closed eyes: content, not dead.
    for (const dir of [-1, 1]) {
      const a = arc(
        bx + dir * eyeDx,
        eyeY + 2.4 * U * SS,
        5 * U * SS,
        2.1 * U * SS,
        Math.PI * 1.15,
        Math.PI * 1.85,
      );
      s.fill(a.bounds, a.inside, INK, 0.92);
    }
  } else {
    for (const dir of [-1, 1]) {
      const e = ellipse(bx + dir * eyeDx, eyeY, eyeR * 0.82, eyeR);
      s.fill(e.bounds, e.inside, INK, 0.95);
      // Catchlight — the single biggest contributor to "cute".
      const hl = ellipse(bx + dir * eyeDx - eyeR * 0.3, eyeY - eyeR * 0.34, eyeR * 0.3, eyeR * 0.34);
      s.fill(hl.bounds, hl.inside, [255, 255, 255], 0.95);
      const hl2 = ellipse(bx + dir * eyeDx + eyeR * 0.28, eyeY + eyeR * 0.36, eyeR * 0.16, eyeR * 0.18);
      s.fill(hl2.bounds, hl2.inside, [255, 255, 255], 0.55);
    }
  }

  // Mouth — a tiny smile.
  const mouth = arc(
    bx,
    eyeY + eyeR * 1.5,
    3.4 * U * SS,
    1.7 * U * SS,
    Math.PI * 0.18,
    Math.PI * 0.82,
  );
  s.fill(mouth.bounds, mouth.inside, INK, 0.75);

  if (glasses) {
    for (const dir of [-1, 1]) {
      const outer = ellipse(bx + dir * eyeDx, eyeY, eyeR * 1.5, eyeR * 1.42);
      const inner = ellipse(
        bx + dir * eyeDx,
        eyeY,
        eyeR * 1.5 - 1.5 * U * SS,
        eyeR * 1.42 - 1.5 * U * SS,
      );
      s.fill(outer.bounds, (x, y) => outer.inside(x, y) && !inner.inside(x, y), GLASS, 0.85);
      s.fill(inner.bounds, inner.inside, [210, 232, 255], 0.16);
    }
    const bridge = roundRect(
      bx - eyeDx * 0.34,
      eyeY - 0.6 * U * SS,
      eyeDx * 0.68,
      1.6 * U * SS,
      0.8 * U * SS,
    );
    s.fill(bridge.bounds, bridge.inside, GLASS, 0.85);
  }

  if (laptop) {
    const lw = 34 * U * SS;
    const lh = 17 * U * SS;
    const lx = bx - lw / 2;
    // Sits at the very bottom edge so it reads as held in front of Mochi,
    // rather than pasted across the middle of the body like a bib.
    const ly = cy + ry * 0.94;
    // Screen
    const screen = roundRect(lx + 3 * U * SS, ly - lh * 0.85, lw - 6 * U * SS, lh * 0.85, 1.6 * U * SS);
    s.fill(screen.bounds, screen.inside, LAPTOP_DARK, 0.95);
    const glow = roundRect(lx + 4.6 * U * SS, ly - lh * 0.72, lw - 9.2 * U * SS, lh * 0.6, 1 * U * SS);
    s.fill(glow.bounds, glow.inside, [225, 240, 255], 0.9);
    // Base
    const base = roundRect(lx, ly, lw, 3.4 * U * SS, 1.7 * U * SS);
    s.fill(base.bounds, base.inside, LAPTOP, 0.98);
  }
}

function drawZzz(s, phase) {
  // Two little z's drifting up and fading.
  for (let i = 0; i < 2; i += 1) {
    const t = (phase + i * 0.5) % 1;
    const size = (5 + i * 2) * U * SS;
    const x = (FRAME / 2 + 30 * U + i * 6 * U) * SS;
    const y = (FRAME / 2 - 26 * U - t * 18 * U) * SS;
    const a = 0.75 * (1 - t);
    const th = 1.5 * U * SS;
    // Top bar, diagonal, bottom bar.
    s.fill([x, y, x + size, y + th], () => true, ZZZ, a);
    s.fill([x, y, x + size, y + size], (px, py) => Math.abs(px - x - (size - (py - y))) < th, ZZZ, a);
    s.fill([x, y + size - th, x + size, y + size], () => true, ZZZ, a);
  }
}

// ---------------------------------------------------------------------------
// PNG encoder (RGBA, 8-bit)
// ---------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const start = y * (1 + width * 4);
    raw[start] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset).copy(
      raw,
      start + 1,
      y * width * 4,
      (y + 1) * width * 4,
    );
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------
function buildSheet(frames, frameOpts) {
  const sheet = new Uint8ClampedArray(FRAME * frames * FRAME * 4);
  for (let f = 0; f < frames; f += 1) {
    const s = new Surface(FRAME * SS, FRAME * SS);
    drawMochi(s, frameOpts(f, frames));
    const extra = frameOpts(f, frames).zzz;
    if (extra !== undefined) drawZzz(s, extra);
    const frame = s.downsample(SS);
    // Composite this frame into the strip.
    for (let y = 0; y < FRAME; y += 1) {
      for (let x = 0; x < FRAME; x += 1) {
        const src = (y * FRAME + x) * 4;
        const dst = (y * FRAME * frames + f * FRAME + x) * 4;
        for (let c = 0; c < 4; c += 1) sheet[dst + c] = frame[src + c];
      }
    }
  }
  return encodePng(FRAME * frames, FRAME, sheet);
}

const SHEETS = {
  // Breathing, with a blink near the end of the cycle.
  'idle.png': [
    12,
    (f, n) => {
      const phase = (f / n) * Math.PI * 2;
      return {
        squash: Math.sin(phase) * 1.6,
        bob: Math.sin(phase) * 1.6,
        eyes: f === 9 || f === 10 ? 'closed' : 'open',
      };
    },
  ],

  // Head-down at a tiny laptop, glasses on, quicker bounce.
  'working.png': [
    12,
    (f, n) => {
      const phase = (f / n) * Math.PI * 4; // two bounces per loop
      return {
        squash: Math.sin(phase) * 2.4,
        bob: Math.sin(phase) * 2.2 + 1,
        eyes: 'open',
        glasses: true,
        laptop: true,
      };
    },
  ],

  // Asleep: slow sway, closed eyes, drifting z's.
  'resting.png': [
    8,
    (f, n) => {
      const phase = (f / n) * Math.PI * 2;
      return {
        squash: Math.sin(phase) * 1.1,
        bob: Math.sin(phase) * 1.3,
        lean: Math.sin(phase) * 1.6,
        eyes: 'closed',
        zzz: f / n,
      };
    },
  ],
};

mkdirSync(OUT_DIR, { recursive: true });
for (const [file, [frames, opts]] of Object.entries(SHEETS)) {
  const png = buildSheet(frames, opts);
  writeFileSync(join(OUT_DIR, file), png);
  console.log(`${file.padEnd(13)} ${String(frames).padStart(2)} frames  ${png.length} bytes`);
}
console.log(`\nWrote ${OUT_DIR}`);
