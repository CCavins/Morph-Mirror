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
    mode: "body" | "flow" | "ember" | "aura" | "kaleido",
    audio: number,
  ): void {
    const speed = settings.particleSpeed * (1 + audio * 0.8);
    const attract = settings.attract;
    const turb = settings.turbulence;
    const grav = settings.gravity * 80;
    const nAttr = attractors.length;

    for (let i = 0; i < this.count; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        if (nAttr && (mode === "body" || mode === "aura" || mode === "kaleido")) {
          const a = attractors[(Math.random() * nAttr) | 0];
          this.x[i] = a.x + (Math.random() - 0.5) * 18;
          this.y[i] = a.y + (Math.random() - 0.5) * 18;
          this.vx[i] = (Math.random() - 0.5) * 30;
          this.vy[i] = (Math.random() - 0.5) * 30;
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
        let best = 0;
        let bd = 1e12;
        const pick = 1 + ((i * 17) % Math.min(6, nAttr));
        for (let k = 0; k < pick; k++) {
          const a = attractors[(i + k * 13) % nAttr];
          const dx = a.x - this.x[i];
          const dy = a.y - this.y[i];
          const d2 = dx * dx + dy * dy + 40;
          if (d2 < bd) {
            bd = d2;
            best = k;
            ax = dx;
            ay = dy;
          }
        }
        const inv = attract * 180 / Math.sqrt(bd);
        this.vx[i] += ax * inv * dt;
        this.vy[i] += ay * inv * dt;
        void best;
      }

      if (mode === "flow" || turb > 0) {
        const n = curl2(this.x[i] * 0.004 + this.seed[i], this.y[i] * 0.004 + dt * 0.2);
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
    kaleido: boolean,
    w: number,
    h: number,
  ): void {
    const cx = w / 2;
    const cy = h / 2;
    for (let i = 0; i < this.count; i++) {
      const t = this.life[i] / Math.max(0.001, this.maxLife[i]);
      const a = Math.min(1, t * 1.4) * 0.85;
      if (a < 0.02) continue;
      ctx.fillStyle = hash2(this.seed[i], 1) > 0.5 ? colorA : colorB;
      ctx.globalAlpha = a;
      const r = this.size[i] * (0.6 + t * 0.8);
      if (kaleido) {
        for (let k = 0; k < 6; k++) {
          const ang = (k * Math.PI) / 3;
          const dx = this.x[i] - cx;
          const dy = this.y[i] - cy;
          const x = cx + dx * Math.cos(ang) - dy * Math.sin(ang);
          const y = cy + dx * Math.sin(ang) + dy * Math.cos(ang);
          if (r < 2.2) ctx.fillRect(x - r, y - r, r * 2, r * 2);
          else {
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      } else if (r < 2.2) {
        ctx.fillRect(this.x[i] - r, this.y[i] - r, r * 2, r * 2);
      } else {
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

export function sampleMaskPoints(
  mask: Float32Array,
  mw: number,
  mh: number,
  count: number,
  toDisplay: (x: number, y: number) => { x: number; y: number },
  out: Attractor[],
): void {
  out.length = 0;
  if (mw < 2 || mh < 2) return;
  const tries = count * 12;
  for (let t = 0; t < tries && out.length < count; t++) {
    const x = (Math.random() * mw) | 0;
    const y = (Math.random() * mh) | 0;
    const v = mask[y * mw + x];
    if (v > 0.55) {
      const p = toDisplay(x / mw, y / mh);
      out.push({ x: p.x, y: p.y, w: v });
    }
  }
}

export function sampleEdgePoints(
  mask: Float32Array,
  mw: number,
  mh: number,
  count: number,
  toDisplay: (x: number, y: number) => { x: number; y: number },
  out: Attractor[],
): void {
  out.length = 0;
  const tries = count * 18;
  for (let t = 0; t < tries && out.length < count; t++) {
    const x = 1 + ((Math.random() * (mw - 2)) | 0);
    const y = 1 + ((Math.random() * (mh - 2)) | 0);
    const i = y * mw + x;
    const v = mask[i];
    if (v < 0.35 || v > 0.85) continue;
    const n = mask[i - 1] + mask[i + 1] + mask[i - mw] + mask[i + mw];
    if (n > 0.6 && n < 3.2) {
      const p = toDisplay(x / mw, y / mh);
      out.push({ x: p.x, y: p.y, w: v });
    }
  }
}
