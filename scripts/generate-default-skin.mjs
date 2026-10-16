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
let FRAME = 192;
let SS = 4; // supersampling factor
/** Design unit — the character was proportioned against a 128px frame. */
let U = FRAME / 128;

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
/**
 * Draw one frame of Mochi.
 *
 * Expression is a set of parameters rather than a set of sheets. Before this,
 * `eyes` was the only expressive input, the mouth was a hardcoded smile, and
 * `eyes: 'happy'` fell into the same branch as `'closed'` and drew an
 * identical face — so the character physically could not look like it was
 * talking, thinking, or pleased. Every state below is now a handful of
 * arguments, which is what makes a new one cost ten lines instead of a sheet.
 *
 * - `squash` is the only shape control, and it works in both directions:
 *   positive is wide and low, negative is tall and thin. A stretch is a
 *   negative squash, so there is no second parameter that could disagree
 *   with it.
 * - `lookX` / `lookY` move both eyes together, in design units. Mochi's eyes
 *   are solid ink with no sclera, so a glance *is* a translation; there is no
 *   pupil to slide inside a white.
 */
function drawMochi(s, opts) {
  const {
    squash = 0,
    bob = 0,
    eyes = 'open',
    mouth = 'smile',
    glasses = false,
    laptop = false,
    lean = 0,
    lookX = 0,
    lookY = 0,
  } = opts;

  const cx = (FRAME / 2) * SS;
  const cy = (FRAME / 2 + 2 * U + bob * U) * SS;
  const rx = (40 + squash) * U * SS;
  const ry = (36 - squash) * U * SS;

  // Contact shadow — grounds the character instead of leaving it floating.
  // It tracks squash, so a stretched Mochi casts a smaller shadow and reads as
  // having left the ground rather than having grown.
  const shadowW = rx * 0.78 - squash * U * SS * 0.5;
  const shadow = ellipse(cx + lean * U * SS, cy + ry + 7 * U * SS, shadowW, 5 * U * SS);
  s.fill(shadow.bounds, shadow.inside, SHADOW, 0.16);

  const bx = cx + lean * U * SS;

  /*
   * Soft rim, then the body slightly inset so the rim reads as an outline.
   *
   * Widened from 1.6 to 2.0 units and dropped from 0.55 to 0.42 alpha: at the
   * small mascot size (130 CSS px) the old rim was narrow enough to alias into
   * a hard pink line against a dark wallpaper, which read as a sticker edge.
   * Wider and fainter is the same silhouette with a softer boundary.
   */
  const rim = squircle(bx, cy, rx + 2.0 * U * SS, ry + 2.0 * U * SS);
  s.fill(rim.bounds, rim.inside, RIM, 0.42);

  const body = squircle(bx, cy, rx, ry);
  s.fill(body.bounds, body.inside, (x, y) => {
    const t = Math.min(1, Math.max(0, (y - (cy - ry)) / (ry * 2)));
    // Ease the gradient so the top stays bright and the falloff is soft.
    return mixRgb(BODY_TOP, BODY_BOTTOM, t * t * 0.9);
  });

  // Specular highlight, upper-left.
  const gloss = ellipse(bx - rx * 0.34, cy - ry * 0.46, rx * 0.26, ry * 0.17);
  s.fill(gloss.bounds, gloss.inside, [255, 255, 255], 0.5);

  /*
   * Eye geometry. Nudged up from 5.6 to 6.1 units and out from 0.36 to 0.37 of
   * the body radius. The eye is the single biggest contributor to reading as a
   * creature, and at the small size the old pair sat close enough together to
   * blur into one mark on a low-DPI display.
   */
  const eyeY = cy - ry * 0.06 + lookY * U * SS;
  const eyeDx = rx * 0.37;
  const eyeR = 6.1 * U * SS;
  const gaze = lookX * U * SS;

  // Blush. Pinned to the body rather than the gaze — it is on the cheeks, and
  // moving it with a glance made the whole face look like it was sliding.
  for (const dir of [-1, 1]) {
    const b = ellipse(bx + dir * rx * 0.62, cy - ry * 0.06 + eyeR * 1.15, 6.2 * U * SS, 4 * U * SS);
    s.fill(b.bounds, b.inside, BLUSH, 0.42);
  }

  if (eyes === 'closed') {
    // Gently upward-curving closed eyes: content, not dead.
    for (const dir of [-1, 1]) {
      const a = arc(
        bx + dir * eyeDx + gaze,
        eyeY + 2.4 * U * SS,
        5 * U * SS,
        2.1 * U * SS,
        Math.PI * 1.15,
        Math.PI * 1.85,
      );
      s.fill(a.bounds, a.inside, INK, 0.92);
    }
  } else if (eyes === 'happy') {
    /*
     * Distinct from `closed`, which it used to be a synonym for. A happy eye
     * is a *higher* and *rounder* arch than a closed one, drawn thicker and
     * sitting further up the face. Side by side the difference is obvious;
     * that it was not drawn is why Mochi had no pleased expression at all.
     */
    for (const dir of [-1, 1]) {
      const a = arc(
        bx + dir * eyeDx + gaze,
        eyeY + 4.2 * U * SS,
        6.4 * U * SS,
        2.6 * U * SS,
        Math.PI * 1.08,
        Math.PI * 1.92,
      );
      s.fill(a.bounds, a.inside, INK, 0.94);
    }
  } else if (eyes === 'half') {
    // Concentration: a full eye with the top third covered by the body, so the
    // lid is the body colour rather than a drawn line.
    for (const dir of [-1, 1]) {
      const e = ellipse(bx + dir * eyeDx + gaze, eyeY, eyeR * 0.82, eyeR);
      s.fill(e.bounds, e.inside, INK, 0.95);
      const lid = ellipse(bx + dir * eyeDx + gaze, eyeY - eyeR * 0.95, eyeR * 1.1, eyeR * 0.72);
      s.fill(lid.bounds, lid.inside, (x, y) => {
        const t = Math.min(1, Math.max(0, (y - (cy - ry)) / (ry * 2)));
        return mixRgb(BODY_TOP, BODY_BOTTOM, t * t * 0.9);
      });
    }
  } else {
    // `open` and `wide`. Wide is the alert face: a bigger eye with the same
    // catchlights, which is surprise without changing the drawing.
    const scale = eyes === 'wide' ? 1.22 : 1;
    for (const dir of [-1, 1]) {
      const ex = bx + dir * eyeDx + gaze;
      const r = eyeR * scale;
      const e = ellipse(ex, eyeY, r * 0.82, r);
      s.fill(e.bounds, e.inside, INK, 0.95);
      // Catchlight — the single biggest contributor to "cute".
      const hl = ellipse(ex - r * 0.3, eyeY - r * 0.34, r * 0.3, r * 0.34);
      s.fill(hl.bounds, hl.inside, [255, 255, 255], 0.95);
      const hl2 = ellipse(ex + r * 0.28, eyeY + r * 0.36, r * 0.16, r * 0.18);
      s.fill(hl2.bounds, hl2.inside, [255, 255, 255], 0.55);
    }
  }

  drawMouth(s, bx, eyeY + eyeR * 1.5, eyeR, mouth);

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
    const screen = roundRect(
      lx + 3 * U * SS,
      ly - lh * 0.85,
      lw - 6 * U * SS,
      lh * 0.85,
      1.6 * U * SS,
    );
    s.fill(screen.bounds, screen.inside, LAPTOP_DARK, 0.95);
    const glow = roundRect(
      lx + 4.6 * U * SS,
      ly - lh * 0.72,
      lw - 9.2 * U * SS,
      lh * 0.6,
      1 * U * SS,
    );
    s.fill(glow.bounds, glow.inside, [225, 240, 255], 0.9);
    // Base
    const base = roundRect(lx, ly, lw, 3.4 * U * SS, 1.7 * U * SS);
    s.fill(base.bounds, base.inside, LAPTOP, 0.98);
  }
}

/**
 * The mouth, which used to be one hardcoded arc.
 *
 * `open` and `small` are the two halves of speech: alternating between them
 * reads as talking, and neither needs a new sheet to say something different.
 * Everything here is drawn relative to the eye radius so it stays in
 * proportion when the eye size is tuned.
 */
function drawMouth(s, bx, my, eyeR, kind) {
  if (kind === 'none') return;

  if (kind === 'flat') {
    // Concentration. A short straight line, slightly soft at the ends.
    const w = 4.6 * U * SS;
    const t = 1.6 * U * SS;
    const line = roundRect(bx - w / 2, my - t / 2, w, t, t / 2);
    s.fill(line.bounds, line.inside, INK, 0.7);
    return;
  }

  if (kind === 'open' || kind === 'small') {
    // A filled oval, taller than wide for `open` and small and round for
    // `small`. Two frames of this alternating is the whole speaking animation.
    const rw = kind === 'open' ? 3.6 * U * SS : 2.1 * U * SS;
    const rh = kind === 'open' ? 4.4 * U * SS : 2.0 * U * SS;
    const o = ellipse(bx, my + rh * 0.3, rw, rh);
    s.fill(o.bounds, o.inside, INK, 0.8);
    // A hint of inner mouth, so an open mouth is not a flat black hole.
    const inner = ellipse(bx, my + rh * 0.55, rw * 0.55, rh * 0.45);
    s.fill(inner.bounds, inner.inside, [150, 86, 110], 0.55);
    return;
  }

  // `smile` (the old default) and `wide`.
  const r = kind === 'wide' ? 5.2 * U * SS : 3.4 * U * SS;
  const t = kind === 'wide' ? 2.0 * U * SS : 1.7 * U * SS;
  const m = arc(bx, my, r, t, Math.PI * 0.18, Math.PI * 0.82);
  s.fill(m.bounds, m.inside, INK, 0.75);
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
    s.fill(
      [x, y, x + size, y + size],
      (px, py) => Math.abs(px - x - (size - (py - y))) < th,
      ZZZ,
      a,
    );
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

/*
 * Every sheet runs at 12fps, which is the ceiling the frame budget allows and
 * the number the skin test asserts. Length is therefore set by *frame count*,
 * not by slowing the playback down: a longer loop is more frames, never fewer
 * per second. Dropping idle to 6fps would have given the same two-second
 * breath and turned the blink into a 333ms eyelid droop.
 */
const SHEETS = {
  /*
   * Breathing, with a blink near the end.
   *
   * Twenty-four frames rather than twelve. At twelve it was a one-second
   * cycle, which is roughly twice the rate of a resting breath, and the pure
   * sine meant every cycle was bit-identical to the last — so the eye stopped
   * registering it as movement within about a minute. Two seconds reads as
   * calm, and the idle variants below break the repetition.
   */
  'idle.png': [
    24,
    (f, n) => {
      const phase = (f / n) * Math.PI * 2;
      return {
        squash: Math.sin(phase) * 2.4,
        bob: Math.sin(phase) * 1.8,
        eyes: f === 19 || f === 20 ? 'closed' : 'open',
      };
    },
  ],

  /*
   * Idle variant: a glance left, then right, then back.
   *
   * One-shot, played occasionally in place of a breath cycle. This is the
   * cheapest cure for a loop the eye has filtered out, because the thing that
   * restores attention is *break* rather than detail.
   */
  'idle-look.png': [
    18,
    (f, n) => {
      // Ease between held positions rather than sliding linearly; eyes move in
      // saccades, and a smooth pan reads as a doll being turned.
      const hold = (a, b, t) => a + (b - a) * (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));
      let lookX = 0;
      if (f < 3) lookX = hold(0, -3.2, f / 3);
      else if (f < 7) lookX = -3.2;
      else if (f < 10) lookX = hold(-3.2, 3.0, (f - 7) / 3);
      else if (f < 14) lookX = 3.0;
      else lookX = hold(3.0, 0, (f - 14) / 4);

      const phase = (f / n) * Math.PI * 2;
      return {
        squash: Math.sin(phase) * 1.6,
        bob: Math.sin(phase) * 1.2,
        // A small body lean with the glance, so the head is not the only thing
        // that knows it is looking.
        lean: lookX * 0.22,
        lookX,
        eyes: f === 6 ? 'closed' : 'open',
      };
    },
  ],

  /*
   * Idle variant: a stretch and a yawn.
   *
   * The one place the body shape does real work. A stretch is a *negative*
   * squash — tall and thin — so it uses the same single shape control as the
   * breath and cannot disagree with it.
   */
  'idle-stretch.png': [
    20,
    (f) => {
      // Gather, rise, hold tall, settle with one small overshoot.
      let squash;
      if (f < 3)
        squash = 2.6 * (f / 3); // crouch
      else if (f < 8)
        squash = 2.6 - 7.2 * ((f - 3) / 5); // up and thin
      else if (f < 12) squash = -4.6;
      else if (f < 16) squash = -4.6 + 6.2 * ((f - 12) / 4);
      else squash = 1.6 - 1.6 * ((f - 16) / 4);

      const lift = squash < 0 ? -squash * 0.8 : 0;
      return {
        squash,
        bob: -lift,
        // Yawn through the tall part, pleased on the way down.
        eyes: f >= 5 && f < 13 ? 'closed' : f >= 13 ? 'happy' : 'open',
        mouth: f >= 5 && f < 12 ? 'open' : f >= 12 ? 'smile' : 'smile',
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

  /*
   * Working variant: a spell of real concentration.
   *
   * Played occasionally during a long tracked session, which was otherwise the
   * same one-second bounce for two hours. Half-lidded eyes and a flat mouth,
   * leaning closer to the screen.
   */
  'working-focus.png': [
    16,
    (f, n) => {
      const phase = (f / n) * Math.PI * 2;
      // Lean in and stay there, then come back at the very end.
      const lean = f < 4 ? -1.6 * (f / 4) : f < 13 ? -1.6 : -1.6 * (1 - (f - 13) / 3);
      return {
        squash: Math.sin(phase) * 1.1 + 0.8,
        bob: Math.sin(phase) * 0.9 + 1.6,
        eyes: 'half',
        mouth: 'flat',
        lookY: 1.2,
        lean,
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
        mouth: 'none',
        zzz: f / n,
      };
    },
  ],

  /*
   * Alert — now generated.
   *
   * This sheet existed as a hand-committed PNG that no script produced, so
   * CI's "generated artwork is up to date" check passed without ever looking
   * at it: the generator never wrote the file, so there was never a diff. The
   * one genuinely expressive sheet in the skin was therefore frozen and
   * outside the system. Same frame count as before, so the manifest is
   * unchanged.
   */
  'alert.png': [
    8,
    (f, n) => {
      // Two sharp bounces, landing hard. Not a sine: an alert is a jolt.
      const t = ((f / n) * 2) % 1;
      const jolt = Math.abs(Math.sin(t * Math.PI)) ** 0.6;
      return {
        squash: 3.0 - jolt * 5.0,
        bob: -jolt * 4.4,
        eyes: 'wide',
        mouth: 'open',
      };
    },
  ],

  /*
   * Speaking.
   *
   * The gap this whole pass exists to close. `speaking` was a declared mascot
   * state with no artwork and no producer anywhere in the app, so the one
   * thing a companion does — tell you something — happened with the character
   * breathing underneath exactly as if it had nothing to say.
   *
   * Eight frames alternating between an open and a small mouth. Speech is not
   * a smooth oscillation, so the pattern is deliberately uneven: a run of
   * syllables, then a brief closed beat.
   */
  'speaking.png': [
    8,
    (f) => {
      const shapes = ['open', 'small', 'open', 'open', 'small', 'open', 'smile', 'small'];
      const phase = (f / 8) * Math.PI * 4;
      return {
        squash: Math.sin(phase) * 1.2,
        bob: Math.sin(phase) * 1.0,
        eyes: 'open',
        mouth: shapes[f],
      };
    },
  ],

  /*
   * Thinking.
   *
   * The other declared-but-undrawn state. Shown while a model call the user is
   * waiting on is in flight, which previously looked identical to idle — so an
   * AI feature that took four seconds was indistinguishable from one that had
   * silently done nothing.
   *
   * Eyes up and away, which is what thinking looks like, plus a slow sway. No
   * spinner: the character *is* the progress indicator.
   */
  'thinking.png': [
    16,
    (f, n) => {
      const phase = (f / n) * Math.PI * 2;
      // The gaze drifts rather than holding, so a long call does not freeze
      // into a single pose.
      return {
        squash: Math.sin(phase) * 1.3,
        bob: Math.sin(phase) * 1.1,
        lean: Math.sin(phase) * 1.4,
        eyes: f === 11 ? 'closed' : 'open',
        mouth: 'flat',
        lookX: 1.8 + Math.sin(phase) * 1.1,
        lookY: -2.0,
      };
    },
  ],

  /*
   * Happy — the petting response, and anything else that goes well.
   *
   * `eyes: 'happy'` drew the same arcs as `eyes: 'closed'` until this pass, so
   * "pleased" and "asleep" were literally the same face.
   */
  'happy.png': [
    12,
    (f, n) => {
      const phase = (f / n) * Math.PI * 4; // two happy bounces
      return {
        squash: Math.sin(phase) * 3.0,
        bob: Math.sin(phase) * 3.2,
        eyes: 'happy',
        mouth: 'wide',
      };
    },
  ],

  /*
   * Celebrate — a one-shot for finishing something.
   *
   * A real jump: gather, stretch upward off the ground, hang, land with a
   * squash, then settle.
   *
   * No sparkles in the sheet. They were drawn here first and were wrong twice
   * over: at the top of the arc they ran into the frame edge, because the
   * window cannot grow (RULE 3) and the jump already spends most of the
   * headroom; and white sparkles over a transparent window vanish entirely on
   * a light wallpaper. The renderer already owns a sparkle particle layer, on
   * its own canvas above the mascot, built for the petting delight. Celebrate
   * triggers that instead, which is one system rather than two and gets the
   * particles out of the fixed frame.
   */
  'celebrate.png': [
    16,
    (f) => {
      let squash;
      let bob;
      if (f < 3) {
        // Anticipation: crouch.
        squash = 3.4 * (f / 3);
        bob = 1.8 * (f / 3);
      } else if (f < 6) {
        // Launch: stretch thin and rise.
        const t = (f - 3) / 3;
        squash = 3.4 - 8.0 * t;
        bob = 1.8 - 10.0 * t;
      } else if (f < 10) {
        // Hang, shape recovering.
        const t = (f - 6) / 4;
        squash = -4.6 + 4.0 * t;
        bob = -8.2 - Math.sin(t * Math.PI) * 1.6;
      } else if (f < 13) {
        // Land hard.
        const t = (f - 10) / 3;
        squash = -0.6 + 5.0 * t;
        bob = -8.2 + 10.0 * t;
      } else {
        // Settle, with one small overshoot.
        const t = (f - 13) / 3;
        squash = 4.4 - 4.4 * t - Math.sin(t * Math.PI) * 1.2;
        bob = 1.8 - 1.8 * t;
      }
      return {
        squash,
        bob,
        eyes: f < 3 ? 'open' : 'happy',
        mouth: f < 3 ? 'smile' : 'wide',
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

// ---------------------------------------------------------------------------
// The app icon is NOT generated here.
//
// This script used to draw one large idle frame into
// apps/desktop/assets/icon.png. It no longer does, because that file is now
// the real Mochi brand logo — vector mascot, purple wordmark, subtitle —
// imported by hand in 67f24ef and shipped as the app icon by
// electron-builder.yml.
//
// Leaving the two in the same place meant the generator silently reverted the
// brand logo every time anyone ran it, and CI's "generated artwork is up to
// date" check then demanded that reversion be committed. Drawing an icon that
// must never be used is worse than not drawing one, so it is gone.
//
// If a generated icon is ever wanted again, give it its own filename. Do not
// hand this path back.
// ---------------------------------------------------------------------------
