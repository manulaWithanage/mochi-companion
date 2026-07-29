/**
 * Generates the placeholder sprite sheets for skins/default.
 *
 * Real artwork replaces these; until then the app needs *something* to draw
 * so the animation loop, frame timing and state switching can be verified.
 *
 * Writes PNGs with a minimal encoder (zlib is in Node core) rather than
 * pulling in an image dependency for three placeholder files.
 *
 *   node scripts/generate-placeholder-skin.mjs
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'skins', 'default');
const FRAME = 128;

// ---------------------------------------------------------------------------
// Minimal PNG encoder (RGBA, 8-bit, no interlace)
// ---------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  // One filter byte (0 = None) per scanline.
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Placeholder mascot: a bobbing blob, plus a dot row showing the frame index
// so frame timing is verifiable by eye without font rendering.
// ---------------------------------------------------------------------------
function drawSheet({ frames, colour, bob, squash }) {
  const width = FRAME * frames;
  const rgba = Buffer.alloc(width * FRAME * 4); // transparent

  const put = (x, y, [r, g, b], a = 255) => {
    if (x < 0 || y < 0 || x >= width || y >= FRAME) return;
    const i = (y * width + x) * 4;
    rgba[i] = r;
    rgba[i + 1] = g;
    rgba[i + 2] = b;
    rgba[i + 3] = a;
  };

  for (let f = 0; f < frames; f += 1) {
    const ox = f * FRAME;
    const phase = (f / frames) * Math.PI * 2;
    const dy = Math.round(Math.sin(phase) * bob);
    const rx = 40 + Math.round(Math.cos(phase) * squash);
    const ry = 40 - Math.round(Math.cos(phase) * squash);
    const cx = FRAME / 2;
    const cy = FRAME / 2 + dy;

    // Body.
    for (let y = 0; y < FRAME; y += 1) {
      for (let x = 0; x < FRAME; x += 1) {
        const nx = (x - cx) / rx;
        const ny = (y - cy) / ry;
        const d = nx * nx + ny * ny;
        if (d <= 1) {
          // Cheap shading so the shape reads as round.
          const shade = 1 - d * 0.25;
          put(ox + x, y, colour.map((c) => Math.round(c * shade)));
        }
      }
    }

    // Eyes.
    for (const eyeX of [cx - 13, cx + 13]) {
      for (let y = -4; y <= 4; y += 1) {
        for (let x = -3; x <= 3; x += 1) {
          if (x * x * 2 + y * y <= 16) put(ox + eyeX + x, cy - 6 + y, [32, 24, 36]);
        }
      }
    }

    // Frame-index dots along the bottom edge.
    for (let d = 0; d < frames; d += 1) {
      const on = d === f;
      const dotX = 8 + d * 6;
      for (let y = 0; y < 4; y += 1) {
        for (let x = 0; x < 4; x += 1) {
          put(ox + dotX + x, FRAME - 8 + y, on ? [255, 255, 255] : [90, 80, 100], on ? 255 : 140);
        }
      }
    }
  }

  return encodePng(width, FRAME, rgba);
}

const SHEETS = {
  // Gentle breathing.
  'idle.png': { frames: 8, colour: [242, 166, 179], bob: 3, squash: 2 },
  // Faster, more energetic — the mascot is working alongside you.
  'working.png': { frames: 12, colour: [166, 214, 242], bob: 5, squash: 4 },
  // Barely moving.
  'resting.png': { frames: 4, colour: [150, 140, 165], bob: 2, squash: 1 },
};

mkdirSync(OUT_DIR, { recursive: true });
for (const [file, spec] of Object.entries(SHEETS)) {
  const png = drawSheet(spec);
  writeFileSync(join(OUT_DIR, file), png);
  console.log(`${file}  ${spec.frames} frames  ${png.length} bytes`);
}
console.log(`\nWrote placeholder sheets to ${OUT_DIR}`);
