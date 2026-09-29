import { mkdir, writeFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const SIZES = [16, 32, 48, 128];
const ICONS_DIR = fileURLToPath(new URL("../icons/", import.meta.url));
const WEB_ICON = fileURLToPath(new URL("../../web/public/icon-128.png", import.meta.url));
const BRAND = { from: [77, 139, 251], to: [47, 107, 255] };
const WHITE: Rgba = [255, 255, 255, 255];
const TRANSPARENT: Rgba = [0, 0, 0, 0];

type Rgba = [number, number, number, number];
type Shape = (x: number, y: number) => number;

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

/* ------------------------------------------------------------------ *
 * Icon geometry, described with signed distance fields in a unit box *
 * (0..1, y pointing down) and rasterised with supersampling below.    *
 * ------------------------------------------------------------------ */

function sdRoundRect(px: number, py: number, halfWidth: number, halfHeight: number, radius: number): number {
  const qx = Math.abs(px) - (halfWidth - radius);
  const qy = Math.abs(py) - (halfHeight - radius);
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - radius;
}

function filledRect(cx: number, cy: number, halfWidth: number, halfHeight: number, radius: number): Shape {
  return (x, y) => sdRoundRect(x - cx, y - cy, halfWidth, halfHeight, radius);
}

function strokedRect(
  cx: number,
  cy: number,
  halfWidth: number,
  halfHeight: number,
  radius: number,
  strokeHalf: number,
): Shape {
  return (x, y) => Math.abs(sdRoundRect(x - cx, y - cy, halfWidth, halfHeight, radius)) - strokeHalf;
}

function sdSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const pax = px - ax;
  const pay = py - ay;
  const bax = bx - ax;
  const bay = by - ay;
  const t = Math.max(0, Math.min(1, (pax * bax + pay * bay) / (bax * bax + bay * bay)));
  return Math.hypot(pax - bax * t, pay - bay * t);
}

function strokedSegment(ax: number, ay: number, bx: number, by: number, half: number): Shape {
  return (x, y) => sdSegment(x, y, ax, ay, bx, by) - half;
}

function strokedArc(
  cx: number,
  cy: number,
  radius: number,
  startDeg: number,
  endDeg: number,
  half: number,
): Shape {
  const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
  const startX = cx + radius * Math.cos(toRadians(startDeg));
  const startY = cy + radius * Math.sin(toRadians(startDeg));
  const endX = cx + radius * Math.cos(toRadians(endDeg));
  const endY = cy + radius * Math.sin(toRadians(endDeg));
  return (x, y) => {
    let angle = (Math.atan2(y - cy, x - cx) * 180) / Math.PI;
    while (angle < startDeg) angle += 360;
    while (angle > startDeg + 360) angle -= 360;
    const distance = Math.hypot(x - cx, y - cy);
    if (angle > endDeg) {
      return Math.min(Math.hypot(x - startX, y - startY), Math.hypot(x - endX, y - endY)) - half;
    }
    return Math.abs(distance - radius) - half;
  };
}

function union(...shapes: Shape[]): Shape {
  return (x, y) => {
    let nearest = Number.POSITIVE_INFINITY;
    for (const shape of shapes) nearest = Math.min(nearest, shape(x, y));
    return nearest;
  };
}

const BACKGROUND = filledRect(0.5, 0.5, 0.47, 0.47, 0.22);
const FRAME_A = strokedRect(0.375, 0.375, 0.225, 0.225, 0.085, 0.032);
const FRAME_B = strokedRect(0.625, 0.625, 0.225, 0.225, 0.085, 0.032);
/** Outer boundary of frame B: everything inside hides frame A, so B reads as the front card. */
const FRAME_B_OUTER = filledRect(0.625, 0.625, 0.257, 0.257, 0.117);

const GLYPH_ZHONG = union(
  strokedSegment(0.315, 0.205, 0.315, 0.475, 0.024),
  strokedRect(0.315, 0.335, 0.085, 0.057, 0.012, 0.022),
);

const GLYPH_A = union(
  strokedSegment(0.625, 0.49, 0.552, 0.735, 0.022),
  strokedSegment(0.625, 0.49, 0.698, 0.735, 0.022),
  strokedSegment(0.577, 0.645, 0.673, 0.645, 0.019),
);

const ARC_TOP_RIGHT = strokedArc(0.598, 0.182, 0.122, -105, -10, 0.032);
const ARC_BOTTOM_LEFT = strokedArc(0.402, 0.818, 0.122, 100, 170, 0.032);

function shade(x: number, y: number, size: number): Rgba {
  const unitX = x / size;
  const unitY = y / size;
  // Below 32px the glyph strokes fall under a pixel; keep the cleaner silhouette.
  const showGlyphs = size >= 32;
  if (BACKGROUND(unitX, unitY) > 0) return TRANSPARENT;
  if (FRAME_B(unitX, unitY) <= 0) return WHITE;
  if (showGlyphs && (GLYPH_ZHONG(unitX, unitY) <= 0 || GLYPH_A(unitX, unitY) <= 0)) return WHITE;
  if (FRAME_B_OUTER(unitX, unitY) <= 0) return base(x, y, size);
  if (FRAME_A(unitX, unitY) <= 0) return WHITE;
  if (ARC_TOP_RIGHT(unitX, unitY) <= 0 || ARC_BOTTOM_LEFT(unitX, unitY) <= 0) return WHITE;
  return base(x, y, size);
}

function base(x: number, y: number, size: number): Rgba {
  const t = Math.min(1, Math.max(0, (x + y) / (2 * size)));
  return [
    Math.round(BRAND.from[0]! + (BRAND.to[0]! - BRAND.from[0]!) * t),
    Math.round(BRAND.from[1]! + (BRAND.to[1]! - BRAND.from[1]!) * t),
    Math.round(BRAND.from[2]! + (BRAND.to[2]! - BRAND.from[2]!) * t),
    255,
  ];
}

function renderIcon(size: number): Uint8Array {
  const samples = 5;
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
  await mkdir(fileURLToPath(new URL("../../web/public/", import.meta.url)), { recursive: true });
  await writeFile(WEB_ICON, encodePng(128));
  written.push(WEB_ICON);
  return written;
}

const paths = await generateIcons();
console.log(`[extension] generated ${paths.length} icons in apps/extension/icons`);
