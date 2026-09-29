import { mkdir, writeFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const SIZES = [16, 32, 48, 128];
const ICONS_DIR = fileURLToPath(new URL("../icons/", import.meta.url));
const BRAND = { from: [47, 107, 255], to: [122, 168, 255] };

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(buffer: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const length = new Uint8Array(4);
  new DataView(length.buffer).setUint32(0, data.length);
  const typeBytes = new TextEncoder().encode(type);
  const payload = new Uint8Array(typeBytes.length + data.length);
  payload.set(typeBytes, 0);
  payload.set(data, typeBytes.length);
  const crc = new Uint8Array(4);
  new DataView(crc.buffer).setUint32(0, crc32(payload));
  return concat([length, payload, crc]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function insideRoundedRect(
  x: number,
  y: number,
  left: number,
  top: number,
  right: number,
  bottom: number,
  radius: number,
): boolean {
  if (x < left || x > right || y < top || y > bottom) return false;
  const clampedX = Math.min(Math.max(x, left + radius), right - radius);
  const clampedY = Math.min(Math.max(y, top + radius), bottom - radius);
  return Math.hypot(x - clampedX, y - clampedY) <= radius + 1e-9;
}

function shade(x: number, y: number, size: number): [number, number, number, number] {
  const inset = size * 0.06;
  const background = insideRoundedRect(x, y, inset, inset, size - inset, size - inset, size * 0.24);
  const bar = size * 0.075 * 0.5;
  const barOne = insideRoundedRect(x, y, size * 0.26, size * 0.3, size * 0.74, size * 0.44, bar);
  const barTwo = insideRoundedRect(x, y, size * 0.26, size * 0.56, size * 0.58, size * 0.7, bar);
  if (!background) return [0, 0, 0, 0];
  if (barOne || barTwo) return [255, 255, 255, 255];
  const t = Math.min(1, Math.max(0, (x + y) / (2 * size)));
  return [
    Math.round(BRAND.from[0]! + (BRAND.to[0]! - BRAND.from[0]!) * t),
    Math.round(BRAND.from[1]! + (BRAND.to[1]! - BRAND.from[1]!) * t),
    Math.round(BRAND.from[2]! + (BRAND.to[2]! - BRAND.from[2]!) * t),
    255,
  ];
}

function renderIcon(size: number): Uint8Array {
  const samples = 4;
  const rows = new Uint8Array((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (size * 4 + 1);
    rows[rowStart] = 0;
    for (let x = 0; x < size; x += 1) {
      let alpha = 0;
      let red = 0;
      let green = 0;
      let blue = 0;
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const [r, g, b, a] = shade(
            x + (sx + 0.5) / samples,
            y + (sy + 0.5) / samples,
            size,
          );
          const weight = a / 255;
          alpha += weight;
          red += r * weight;
          green += g * weight;
          blue += b * weight;
        }
      }
      const total = samples * samples;
      const coverage = alpha / total;
      const offset = rowStart + 1 + x * 4;
      const denominator = alpha || 1;
      rows[offset] = Math.round(red / denominator);
      rows[offset + 1] = Math.round(green / denominator);
      rows[offset + 2] = Math.round(blue / denominator);
      rows[offset + 3] = Math.round(coverage * 255);
    }
  }
  return rows;
}

function encodePng(size: number): Uint8Array {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, size);
  view.setUint32(4, size);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;
  return concat([
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(renderIcon(size), { level: 9 })),
    chunk("IEND", new Uint8Array()),
  ]);
}

export async function generateIcons(): Promise<string[]> {
  await mkdir(ICONS_DIR, { recursive: true });
  const written: string[] = [];
  for (const size of SIZES) {
    const path = `${ICONS_DIR}icon-${size}.png`;
    await writeFile(path, encodePng(size));
    written.push(path);
  }
  return written;
}

if (import.meta.main) {
  const paths = await generateIcons();
  console.log(`[extension] generated ${paths.length} icons`);
}

