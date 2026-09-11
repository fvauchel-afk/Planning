import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

const STONE = [28, 25, 23, 255];
const AMBER = [180, 83, 9, 255];
const CREAM = [231, 229, 228, 255];
const WARM = [214, 211, 209, 255];

function crc32(buf) {
  let crc = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (~crc) >>> 0;
}

function chunk(type, data) {
  const header = Buffer.alloc(4);
  header.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([header, typed, crc]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * stride] = 0;
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function fillRect(rgba, size, x0, y0, x1, y1, color) {
  const left = Math.max(0, Math.floor(x0));
  const top = Math.max(0, Math.floor(y0));
  const right = Math.min(size, Math.ceil(x1));
  const bottom = Math.min(size, Math.ceil(y1));
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const i = (y * size + x) * 4;
      rgba[i] = color[0];
      rgba[i + 1] = color[1];
      rgba[i + 2] = color[2];
      rgba[i + 3] = color[3];
    }
  }
}

function fillRoundRect(rgba, size, x, y, w, h, r, color) {
  const radius = Math.min(r, w / 2, h / 2);
  for (let py = Math.floor(y); py < y + h; py += 1) {
    for (let px = Math.floor(x); px < x + w; px += 1) {
      if (px < 0 || py < 0 || px >= size || py >= size) continue;
      const dx = px < x + radius ? x + radius - px : px > x + w - radius ? px - (x + w - radius) : 0;
      const dy = py < y + radius ? y + radius - py : py > y + h - radius ? py - (y + h - radius) : 0;
      if (dx * dx + dy * dy > radius * radius + radius) continue;
      const i = (py * size + px) * 4;
      rgba[i] = color[0];
      rgba[i + 1] = color[1];
      rgba[i + 2] = color[2];
      rgba[i + 3] = color[3];
    }
  }
}

const GLYPHS = {
  F: ["11111", "10000", "11110", "10000", "10000", "10000", "10000"],
  V: ["10001", "10001", "10001", "01010", "01010", "00100", "00100"],
};

function drawGlyph(rgba, size, glyph, originX, originY, pixel, color) {
  const rows = GLYPHS[glyph];
  for (let gy = 0; gy < rows.length; gy += 1) {
    for (let gx = 0; gx < rows[gy].length; gx += 1) {
      if (rows[gy][gx] !== "1") continue;
      fillRect(
        rgba,
        size,
        originX + gx * pixel,
        originY + gy * pixel,
        originX + (gx + 1) * pixel - pixel * 0.12,
        originY + (gy + 1) * pixel - pixel * 0.12,
        color,
      );
    }
  }
}

function makeIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  fillRect(rgba, size, 0, 0, size, size, STONE);
  const pad = size * 0.08;
  fillRoundRect(rgba, size, pad, pad, size - pad * 2, size - pad * 2, size * 0.16, STONE);
  const pixel = size * 0.055;
  const glyphW = 5 * pixel;
  const glyphH = 7 * pixel;
  const gap = pixel * 1.4;
  const totalW = glyphW * 2 + gap;
  const startX = (size - totalW) / 2;
  const startY = size * 0.22;
  drawGlyph(rgba, size, "F", startX, startY, pixel, AMBER);
  drawGlyph(rgba, size, "V", startX + glyphW + gap, startY, pixel, CREAM);
  const barY = size * 0.72;
  const barH = size * 0.055;
  const barX = size * 0.22;
  fillRoundRect(rgba, size, barX, barY, size * 0.56, barH, barH / 2, AMBER);
  fillRoundRect(rgba, size, barX, barY + barH * 1.7, size * 0.36, barH, barH / 2, WARM);
  return encodePng(size, size, rgba);
}

writeFileSync(join(DIR, "icon-192.png"), makeIcon(192));
writeFileSync(join(DIR, "icon-512.png"), makeIcon(512));
writeFileSync(join(DIR, "apple-touch-icon.png"), makeIcon(180));
console.log("PWA icons written to public/");
