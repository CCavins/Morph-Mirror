import { clamp, curl2, hash2, rand } from "../math";
import type { Settings } from "../types";

export interface Attractor {
  x: number;
  y: number;
  w: number;
}

export class ParticleEngine {
  private x: Float32Array;
  private y: Float32Array;
  private vx: Float32Array;
  private vy: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private size: Float32Array;
  private seed: Float32Array;
  count: number;
  private cap: number;

  constructor(cap = 12000) {
    this.cap = cap;
    this.count = 0;
    this.x = new Float32Array(cap);
    this.y = new Float32Array(cap);
    this.vx = new Float32Array(cap);
    this.vy = new Float32Array(cap);
    this.life = new Float32Array(cap);
    this.maxLife = new Float32Array(cap);
    this.size = new Float32Array(cap);
    this.seed = new Float32Array(cap);
  }

  setCount(n: number, w: number, h: number, settings: Settings): void {
    const next = clamp(Math.round(n), 0, this.cap);
    if (next > this.count) {
      for (let i = this.count; i < next; i++) this.spawn(i, w, h, settings, true);
    }
    this.count = next;
  }

  burst(cx: number, cy: number, n: number, speed = 1.6, life = 1.4): void {
    const k = Math.min(n, Math.max(this.count, 1));
    for (let i = 0; i < k; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (0.8 + Math.random() * 2.4) * speed * 220;
      this.x[i] = cx;
      this.y[i] = cy;
      this.vx[i] = Math.cos(a) * s;
      this.vy[i] = Math.sin(a) * s;
      this.maxLife[i] = life;
      this.life[i] = life * (0.4 + Math.random() * 0.6);
    }
  }

  private spawn(i: number, w: number, h: number, settings: Settings, scatter: boolean): void {
    this.x[i] = scatter ? Math.random() * w : Math.random() * w;
    this.y[i] = scatter ? Math.random() * h : Math.random() * h;
    this.vx[i] = (Math.random() - 0.5) * 40 * settings.particleSpeed;
    this.vy[i] = (Math.random() - 0.5) * 40 * settings.particleSpeed;
    const life = (0.6 + Math.random() * 1.4) * settings.particleLife;
    this.maxLife[i] = life;
    this.life[i] = Math.random() * life;
    this.size[i] = (0.5 + Math.random() * 1.6) * settings.particleSize;
    this.seed[i] = Math.random() * 1000;
  }

  step(
    dt: number,
    w: number,
    h: number,
    settings: Settings,
    attractors: Attractor[],
    mode: "body" | "flow" | "ember" | "aura",
    audio: number,
    time: number,
  ): void {
    const speed = settings.particleSpeed * (1 + audio * 0.8);
    const attract = settings.attract;
    const turb = settings.turbulence;
    const grav = settings.gravity * 80;
    const nAttr = attractors.length;
    const cling = mode === "aura" ? attract * 240 : attract * 180;

    for (let i = 0; i < this.count; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        if (nAttr && (mode === "body" || mode === "aura")) {
          const a = attractors[(i * 17 + (this.seed[i] | 0)) % nAttr];
          this.x[i] = a.x + (Math.random() - 0.5) * 10;
          this.y[i] = a.y + (Math.random() - 0.5) * 10;
          this.vx[i] = (Math.random() - 0.5) * 22;
          this.vy[i] = (Math.random() - 0.5) * 22;
          const life = (0.5 + Math.random()) * settings.particleLife;
          this.maxLife[i] = life;
          this.life[i] = life;
        } else {
          this.spawn(i, w, h, settings, true);
        }
        continue;
      }

      let ax = 0;
      let ay = 0;
      if (nAttr && attract > 0 && mode !== "ember") {
        let bd = 1e12;
        const pick = 1 + ((i * 17) % Math.min(6, nAttr));
        for (let k = 0; k < pick; k++) {
          const a = attractors[(i + k * 13) % nAttr];
          const dx = a.x - this.x[i];
          const dy = a.y - this.y[i];
          const d2 = dx * dx + dy * dy + 40;
          if (d2 < bd) {
            bd = d2;
            ax = dx;
            ay = dy;
          }
        }
        const inv = cling / Math.sqrt(bd);
        this.vx[i] += ax * inv * dt;
        this.vy[i] += ay * inv * dt;
      }

      if (mode === "flow" || turb > 0) {
        const n = curl2(this.x[i] * 0.0036 + this.seed[i], this.y[i] * 0.0036 + time * 0.18);
        this.vx[i] += n.x * turb * 90 * speed * dt;
        this.vy[i] += n.y * turb * 90 * speed * dt;
      }

      if (mode === "ember") {
        this.vy[i] -= (90 + hash2(this.seed[i], 2) * 80) * dt * speed;
        this.vx[i] += (hash2(this.seed[i], this.life[i]) - 0.5) * 40 * dt;
      }

      this.vy[i] += grav * dt;
      this.vx[i] *= 0.96;
      this.vy[i] *= 0.96;
      this.x[i] += this.vx[i] * dt * speed;
      this.y[i] += this.vy[i] * dt * speed;

      if (this.x[i] < -40 || this.x[i] > w + 40 || this.y[i] < -40 || this.y[i] > h + 40) {
        this.life[i] = 0;
      }
    }
  }

  draw(
    ctx: CanvasRenderingContext2D,
    colorA: string,
    colorB: string,
  ): void {
    for (let i = 0; i < this.count; i++) {
      const t = this.life[i] / Math.max(0.001, this.maxLife[i]);
      const a = Math.min(1, t * 1.4) * 0.85;
      if (a < 0.02) continue;
      ctx.fillStyle = hash2(this.seed[i], 1) > 0.5 ? colorA : colorB;
      ctx.globalAlpha = a;
      const r = this.size[i] * (0.6 + t * 0.8);
      if (r < 2.2) ctx.fillRect(this.x[i] - r, this.y[i] - r, r * 2, r * 2);
      else {
        ctx.beginPath();
        ctx.arc(this.x[i], this.y[i], r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  emitFrom(x: number, y: number, vx: number, vy: number, settings: Settings, n = 6): void {
    for (let k = 0; k < n; k++) {
      const i = (Math.random() * this.count) | 0;
      this.x[i] = x + rand(-8, 8);
      this.y[i] = y + rand(-8, 8);
      this.vx[i] = vx + rand(-40, 40);
      this.vy[i] = vy + rand(-40, 40);
      const life = (0.35 + Math.random() * 0.8) * settings.particleLife;
      this.maxLife[i] = life;
      this.life[i] = life;
      this.size[i] = (0.7 + Math.random()) * settings.particleSize;
    }
  }
}

function setAttractor(out: Attractor[], i: number, x: number, y: number, w: number): void {
  const a = out[i];
  if (a) {
    a.x = x;
    a.y = y;
    a.w = w;
  } else {
    out[i] = { x, y, w };
  }
}

export function sampleMaskGrid(
  mask: Float32Array,
  mw: number,
  mh: number,
  cols: number,
  rows: number,
  toDisplay: (x: number, y: number) => { x: number; y: number },
  out: Attractor[],
): void {
  let n = 0;
  if (mw >= 2 && mh >= 2) {
    for (let gy = 0; gy < rows; gy++) {
      const y = Math.min(mh - 1, (((gy + 0.5) / rows) * mh) | 0);
      const row = y * mw;
      for (let gx = 0; gx < cols; gx++) {
        const x = Math.min(mw - 1, (((gx + 0.5) / cols) * mw) | 0);
        const v = mask[row + x];
        if (v > 0.52) {
          const p = toDisplay((x + 0.5) / mw, (y + 0.5) / mh);
          setAttractor(out, n, p.x, p.y, v);
          n += 1;
        }
      }
    }
  }
  out.length = n;
}

export function sampleEdgeGrid(
  mask: Float32Array,
  mw: number,
  mh: number,
  toDisplay: (x: number, y: number) => { x: number; y: number },
  out: Attractor[],
): void {
  let n = 0;
  if (mw >= 4 && mh >= 4) {
    const ys = Math.max(2, (mh / 26) | 0);
    const xs = Math.max(2, (mw / 18) | 0);
    for (let y = 1; y < mh - 1; y += ys) {
      const row = y * mw;
      let left = -1;
      let right = -1;
      for (let x = 1; x < mw - 1; x++) {
        if (mask[row + x] > 0.45) {
          if (left < 0) left = x;
          right = x;
        }
      }
      if (left > 0) {
        const a = toDisplay(left / mw, y / mh);
        setAttractor(out, n, a.x, a.y, 1);
        n += 1;
        if (right - left > 2) {
          const b = toDisplay(right / mw, y / mh);
          setAttractor(out, n, b.x, b.y, 1);
          n += 1;
        }
      }
    }
    for (let x = 1; x < mw - 1; x += xs) {
      let top = -1;
      let bot = -1;
      for (let y = 1; y < mh - 1; y++) {
        if (mask[y * mw + x] > 0.45) {
          if (top < 0) top = y;
          bot = y;
        }
      }
      if (top > 0) {
        const a = toDisplay(x / mw, top / mh);
        setAttractor(out, n, a.x, a.y, 1);
        n += 1;
        if (bot - top > 2) {
          const b = toDisplay(x / mw, bot / mh);
          setAttractor(out, n, b.x, b.y, 1);
          n += 1;
        }
      }
    }
  }
  out.length = n;
}
