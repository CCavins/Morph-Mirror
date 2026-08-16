export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function invLerp(a: number, b: number, v: number): number {
  if (b === a) return 0;
  return clamp((v - a) / (b - a), 0, 1);
}

export function rand(min = 0, max = 1): number {
  return min + Math.random() * (max - min);
}

export function hash2(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

export function noise2(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

export function curl2(x: number, y: number, e = 0.08): { x: number; y: number } {
  const n1 = noise2(x, y + e);
  const n2 = noise2(x, y - e);
  const n3 = noise2(x + e, y);
  const n4 = noise2(x - e, y);
  return { x: (n1 - n2) / (2 * e), y: (n4 - n3) / (2 * e) };
}

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = Number.parseInt(full.slice(0, 6), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex(c: RGB): string {
  const v = (clamp(Math.round(c.r), 0, 255) << 16)
    | (clamp(Math.round(c.g), 0, 255) << 8)
    | clamp(Math.round(c.b), 0, 255);
  return `#${v.toString(16).padStart(6, "0")}`;
}

export function mixRgb(a: RGB, b: RGB, t: number): RGB {
  return {
    r: lerp(a.r, b.r, t),
    g: lerp(a.g, b.g, t),
    b: lerp(a.b, b.b, t),
  };
}

export function rgbCss(c: RGB, a = 1): string {
  return `rgba(${c.r | 0},${c.g | 0},${c.b | 0},${a})`;
}

export function hueShift(c: RGB, deg: number): RGB {
  const { h, s, l } = rgbToHsl(c);
  return hslToRgb({ h: (h + deg + 360) % 360, s, l });
}

function rgbToHsl(c: RGB): { h: number; s: number; l: number } {
  const r = c.r / 255;
  const g = c.g / 255;
  const b = c.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s, l };
}

export function hslToRgb(c: { h: number; s: number; l: number }): RGB {
  const { h, s, l } = c;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: f(0) * 255, g: f(8) * 255, b: f(4) * 255 };
}

export interface CoverTransform {
  scale: number;
  x: number;
  y: number;
}

export function coverFit(srcW: number, srcH: number, dstW: number, dstH: number): CoverTransform {
  const scale = Math.max(dstW / srcW, dstH / srcH);
  return {
    scale,
    x: (dstW - srcW * scale) / 2,
    y: (dstH - srcH * scale) / 2,
  };
}

export function mapCover(
  px: number,
  py: number,
  srcW: number,
  srcH: number,
  cover: CoverTransform,
): { x: number; y: number } {
  return {
    x: px * srcW * cover.scale + cover.x,
    y: py * srcH * cover.scale + cover.y,
  };
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.hypot(dx, dy);
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
