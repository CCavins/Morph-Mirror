import { clamp, hash2, lerp, rand, rgbCss, type RGB } from "../math";
import { LM, VIS_MIN } from "../types";
import { visible } from "../pose";
import { toScreen, type DrawCtx } from "./effects";

type Kind = "body" | "ambient" | "free" | "shard";

interface Bubble {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  base: number;
  ax: number;
  ay: number;
  slot: number;
  kind: Kind;
  life: number;
  seed: number;
  cool: number;
  alive: boolean;
}

const RAYS = 16;
const INNER = 0.97;
const CHAINS: Array<[number, number, number]> = [
  [LM.leftShoulder, LM.leftElbow, LM.leftWrist],
  [LM.rightShoulder, LM.rightElbow, LM.rightWrist],
  [LM.leftHip, LM.leftKnee, LM.leftAnkle],
  [LM.rightHip, LM.rightKnee, LM.rightAnkle],
];

function blank(): Bubble {
  return {
    x: 0, y: 0, vx: 0, vy: 0, r: 28, base: 28,
    ax: 0, ay: 0, slot: 0, kind: "ambient",
    life: 1, seed: Math.random() * 1000, cool: 0, alive: false,
  };
}

export class BubbleEngine {
  private pool: Bubble[] = Array.from({ length: 64 }, blank);
  private goo = document.createElement("canvas");
  private gooCtx = this.goo.getContext("2d");
  private hullSmooth: Array<{ x: number; y: number; s: number }> = [];
  private radii = new Float32Array(RAYS);
  private cx = 0;
  private cy = 0;
  private ready = false;

  burst(cx: number, cy: number): void {
    for (const b of this.pool) {
      if (!b.alive || (b.kind !== "ambient" && b.kind !== "free")) continue;
      if (Math.hypot(b.x - cx, b.y - cy) < 240) this.pop(b, 2);
    }
  }

  step(d: DrawCtx, dt: number, reduced: boolean): void {
    const { w, h, settings } = d;
    const bodyN = RAYS;
    const ambientN = reduced ? 3 : 5;
    const size = 38 + settings.particleSize * 16;
    const follow = 0.055 + settings.attract * 0.045;
    const speed = settings.particleSpeed;
    const lift = -12 + settings.gravity * 28;
    const wobble = settings.turbulence * 3.2;
    this.updateHull(d, dt);
    this.ensureBody(d, bodyN, size);
    this.ensureAmbient(w, h, ambientN, size * 0.48);
    this.bindBody(d, size, wobble);

    const hits = this.hitters(d);
    const k = 1 - Math.pow(1 - follow, dt * 60);

    for (const b of this.pool) {
      if (!b.alive) continue;
      b.cool = Math.max(0, b.cool - dt);

      if (b.kind === "body") {
        b.x += (b.ax - b.x) * k;
        b.y += (b.ay - b.y) * k;
        b.vx = (b.ax - b.x) / Math.max(0.016, dt);
        b.vy = (b.ay - b.y) / Math.max(0.016, dt);
        const reach = Math.hypot(b.x - b.ax, b.y - b.ay);
        if (b.cool <= 0 && reach > b.r * 4.8 && Math.hypot(b.vx, b.vy) > 420) {
          const nx = (b.x - b.ax) / Math.max(1, reach);
          const ny = (b.y - b.ay) / Math.max(1, reach);
          this.emit(b.x + nx * 6, b.y + ny * 6, b.vx * 0.18, b.vy * 0.18, b.r * 0.34, "free", 2.4);
          b.x += (b.ax - b.x) * 0.55;
          b.y += (b.ay - b.y) * 0.55;
          b.cool = 1.1;
        }
        b.r += (b.base - b.r) * (1 - Math.pow(0.92, dt * 60));
        continue;
      }

      if (b.kind === "ambient") {
        b.vy += lift * dt;
        b.vx += Math.sin(d.time * 0.16 + b.seed) * 3.2 * speed * dt;
        b.vx *= 0.994;
        b.vy *= 0.994;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        this.wrap(b, w, h);
        if (this.handHit(b, hits)) this.pop(b, 2);
        continue;
      }

      if (b.kind === "free") {
        b.vy += lift * 0.22 * dt;
        b.vx *= 0.98;
        b.vy *= 0.98;
        b.x += b.vx * dt * 0.4;
        b.y += b.vy * dt * 0.4;
        b.life -= dt * 0.09;
        b.r += (b.base - b.r) * 0.04;
        if (b.life <= 0) {
          this.pop(b, 1);
          continue;
        }
        if (b.cool <= 0 && this.handHit(b, hits)) {
          this.pop(b, 2);
          continue;
        }
        this.tryAbsorb(b);
        continue;
      }

      b.life -= dt * 1.4;
      b.r *= 0.97;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.vx *= 0.94;
      b.vy *= 0.94;
      if (b.life <= 0 || b.r < 3) b.alive = false;
    }
  }

  draw(d: DrawCtx, reduced: boolean): void {
    const { ctx, colors, settings } = d;
    const bloom = settings.bloom;
    this.drawGoo(d, reduced);

    for (const b of this.pool) {
      if (!b.alive) continue;
      if (b.kind === "body") {
        if ((b.slot & 1) === 0) {
          drawSpec(ctx, b.x, b.y, b.r * 0.9, colors.glowA, 0.2 + bloom * 0.14);
        }
        continue;
      }
      const spd = Math.hypot(b.vx, b.vy);
      const stretch = 1 + Math.min(0.16, spd * 0.001);
      const ang = Math.atan2(b.vy, b.vx);
      const tint = hash2(b.seed, 1) > 0.5 ? colors.primary : colors.secondary;
      const glow = hash2(b.seed, 2) > 0.5 ? colors.glowA : colors.glowB;
      const a = b.kind === "shard" ? Math.max(0, b.life) * 0.8
        : b.kind === "free" ? 0.42 + b.life * 0.16
        : 0.78;
      drawDroplet(ctx, b.x, b.y, b.r * stretch, b.r / stretch, ang, tint, glow, a, bloom);
    }
  }

  private drawGoo(d: DrawCtx, reduced: boolean): void {
    const gctx = this.gooCtx;
    if (!gctx) return;
    const scale = reduced ? 0.2 : 0.28;
    const bw = Math.max(2, (d.w * scale) | 0);
    const bh = Math.max(2, (d.h * scale) | 0);
    if (this.goo.width !== bw) this.goo.width = bw;
    if (this.goo.height !== bh) this.goo.height = bh;
    gctx.clearRect(0, 0, bw, bh);
    gctx.globalCompositeOperation = "source-over";
    gctx.filter = reduced ? "blur(3px)" : "blur(5px)";
    for (const b of this.pool) {
      if (!b.alive || (b.kind !== "body" && b.kind !== "free")) continue;
      const x = b.x * scale;
      const y = b.y * scale;
      const r = b.r * 1.55 * scale;
      const grd = gctx.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, rgbCss(d.colors.primary, 0.9));
      grd.addColorStop(0.42, rgbCss(d.colors.glowA, 0.48));
      grd.addColorStop(0.78, rgbCss(d.colors.secondary, 0.16));
      grd.addColorStop(1, "rgba(0,0,0,0)");
      gctx.fillStyle = grd;
      gctx.beginPath();
      gctx.arc(x, y, r, 0, Math.PI * 2);
      gctx.fill();
    }
    gctx.filter = "none";
    gctx.globalCompositeOperation = "source-over";
    d.ctx.save();
    d.ctx.filter = reduced ? "blur(10px)" : "blur(16px)";
    d.ctx.globalCompositeOperation = "source-over";
    d.ctx.globalAlpha = 0.94;
    d.ctx.drawImage(this.goo, 0, 0, d.w, d.h);
    d.ctx.filter = "none";
    d.ctx.restore();
  }

  private updateHull(d: DrawCtx, dt: number): void {
    const fromMask = this.maskInterior(d);
    const targets = fromMask.length === RAYS ? fromMask : this.jointInterior(d);
    if (!targets.length) return;

    const ease = 1 - Math.pow(0.82, dt * 60);
    if (this.hullSmooth.length !== targets.length) {
      this.hullSmooth = targets.map((p) => ({ ...p }));
      this.ready = true;
      return;
    }
    const t = this.ready ? ease : 1;
    for (let i = 0; i < targets.length; i++) {
      const a = this.hullSmooth[i];
      const b = targets[i];
      a.x = lerp(a.x, b.x, t);
      a.y = lerp(a.y, b.y, t);
      a.s = lerp(a.s, b.s, Math.min(1, t * 0.85));
    }
    for (let i = 0; i < RAYS; i++) {
      const a = this.hullSmooth[i];
      const prev = this.hullSmooth[(i + RAYS - 1) % RAYS];
      const next = this.hullSmooth[(i + 1) % RAYS];
      a.x = a.x * 0.78 + prev.x * 0.11 + next.x * 0.11;
      a.y = a.y * 0.78 + prev.y * 0.11 + next.y * 0.11;
    }
    this.ready = true;
  }

  private maskInterior(d: DrawCtx): Array<{ x: number; y: number; s: number }> {
    const { frame } = d;
    if (!frame.mask || frame.maskWidth < 8) return [];
    const mw = frame.maskWidth;
    const mh = frame.maskHeight;
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let y = 0; y < mh; y += 3) {
      const row = y * mw;
      for (let x = 0; x < mw; x += 3) {
        if (frame.mask[row + x] > 0.45) {
          sx += x;
          sy += y;
          n += 1;
        }
      }
    }
    if (n < 12) return [];
    const rawCx = sx / n;
    const rawCy = sy / n;
    const jumped = !this.ready || Math.hypot(rawCx - this.cx, rawCy - this.cy) > 90;
    const mix = jumped ? 1 : 0.22;
    this.cx += (rawCx - this.cx) * mix;
    this.cy += (rawCy - this.cy) * mix;

    const rawR = new Float32Array(RAYS);
    for (let i = 0; i < RAYS; i++) {
      const ang = (i / RAYS) * Math.PI * 2;
      const dx = Math.cos(ang);
      const dy = Math.sin(ang);
      let last = 2;
      for (let t = 2; t < Math.max(mw, mh); t += 2) {
        const x = this.cx + dx * t;
        const y = this.cy + dy * t;
        if (x < 1 || y < 1 || x >= mw - 1 || y >= mh - 1) break;
        if (frame.mask[(y | 0) * mw + (x | 0)] < 0.38) break;
        last = t;
      }
      rawR[i] = last;
    }
    const rMix = jumped ? 1 : 0.2;
    for (let i = 0; i < RAYS; i++) {
      const sm = rawR[(i + RAYS - 1) % RAYS] * 0.2 + rawR[i] * 0.6 + rawR[(i + 1) % RAYS] * 0.2;
      this.radii[i] += (sm - this.radii[i]) * rMix;
    }

    let mean = 0;
    for (let i = 0; i < RAYS; i++) mean += this.radii[i];
    mean /= RAYS;
    const out: Array<{ x: number; y: number; s: number }> = [];
    for (let i = 0; i < RAYS; i++) {
      const ang = (i / RAYS) * Math.PI * 2;
      const r = this.radii[i];
      const nx = clamp((this.cx + Math.cos(ang) * r * INNER) / mw, 0, 1);
      const ny = clamp((this.cy + Math.sin(ang) * r * INNER) / mh, 0, 1);
      const p = toScreen({ x: nx, y: ny, z: 0, vis: 1 }, d);
      out.push({ x: p.x, y: p.y, s: 0.9 + clamp(r / Math.max(8, mean), 0.55, 1.55) * 0.3 });
    }
    return out;
  }

  private jointInterior(d: DrawCtx): Array<{ x: number; y: number; s: number }> {
    const pose = d.frame.poses[0];
    if (!pose) return [];
    const pts: Array<{ x: number; y: number }> = [];
    for (const chain of CHAINS) {
      for (const idx of chain) {
        const lm = pose.landmarks[idx];
        if (!visible(lm, VIS_MIN)) continue;
        pts.push(toScreen(lm, d));
      }
    }
    const nose = pose.landmarks[LM.nose];
    if (visible(nose, VIS_MIN)) pts.push(toScreen(nose, d));
    if (pts.length < 3) return [];
    let cx = 0;
    let cy = 0;
    for (const p of pts) {
      cx += p.x;
      cy += p.y;
    }
    cx /= pts.length;
    cy /= pts.length;
    const out: Array<{ x: number; y: number; s: number }> = [];
    let mean = 0;
    const rs: number[] = [];
    for (let i = 0; i < RAYS; i++) {
      const ang = (i / RAYS) * Math.PI * 2;
      const dx = Math.cos(ang);
      const dy = Math.sin(ang);
      let best = 0;
      for (const p of pts) {
        const proj = (p.x - cx) * dx + (p.y - cy) * dy;
        if (proj > best) best = proj;
      }
      rs.push(Math.max(24, best));
      mean += rs[i];
    }
    mean /= RAYS;
    for (let i = 0; i < RAYS; i++) {
      const ang = (i / RAYS) * Math.PI * 2;
      const r = rs[i];
      out.push({
        x: cx + Math.cos(ang) * r * INNER,
        y: cy + Math.sin(ang) * r * INNER,
        s: 0.9 + clamp(r / mean, 0.6, 1.5) * 0.28,
      });
    }
    return out;
  }

  private bindBody(d: DrawCtx, size: number, wobble: number): void {
    const anchors = this.hullSmooth;
    if (!anchors.length) return;
    for (const b of this.pool) {
      if (!b.alive || b.kind !== "body") continue;
      const a = anchors[b.slot % anchors.length];
      const ox = Math.sin(d.time * 0.55 + b.seed) * wobble;
      const oy = Math.cos(d.time * 0.42 + b.seed * 0.7) * wobble * 0.7;
      b.ax = a.x + ox;
      b.ay = a.y + oy;
      b.base = size * a.s * (0.88 + (b.slot % 4) * 0.02);
      if (!this.ready || Math.hypot(b.x - b.ax, b.y - b.ay) > 560) {
        b.x = a.x;
        b.y = a.y;
        b.vx = 0;
        b.vy = 0;
      }
    }
  }

  private ensureBody(d: DrawCtx, n: number, size: number): void {
    let have = 0;
    for (const b of this.pool) if (b.alive && b.kind === "body") have += 1;
    while (have < n) {
      const b = this.take();
      if (!b) break;
      b.kind = "body";
      b.alive = true;
      b.life = 1;
      b.slot = have;
      b.base = size;
      b.r = size;
      const a = this.hullSmooth[have % Math.max(1, this.hullSmooth.length)];
      b.x = a?.x ?? d.w * 0.5;
      b.y = a?.y ?? d.h * 0.45;
      b.ax = b.x;
      b.ay = b.y;
      have += 1;
    }
    if (have > n) {
      for (const b of this.pool) {
        if (have <= n) break;
        if (b.alive && b.kind === "body") {
          b.alive = false;
          have -= 1;
        }
      }
    }
    let i = 0;
    for (const b of this.pool) {
      if (!b.alive || b.kind !== "body") continue;
      b.slot = i;
      i += 1;
    }
  }

  private ensureAmbient(w: number, h: number, n: number, size: number): void {
    let have = this.countKind("ambient");
    for (let i = have; i < n; i++) {
      const b = this.take();
      if (!b) break;
      b.kind = "ambient";
      b.alive = true;
      b.life = 1;
      b.slot = i;
      b.base = size * (0.7 + Math.random() * 0.4);
      b.r = b.base;
      const edge = Math.random();
      b.x = edge < 0.5 ? Math.random() * w : (edge < 0.75 ? -40 : w + 40);
      b.y = edge < 0.5 ? h + 40 : Math.random() * h;
      b.vx = rand(-5, 5);
      b.vy = rand(-12, -3);
      have += 1;
    }
    let extra = have - n;
    for (const b of this.pool) {
      if (extra <= 0) break;
      if (b.alive && b.kind === "ambient") {
        b.alive = false;
        extra -= 1;
      }
    }
  }

  private hitters(d: DrawCtx): Array<{ x: number; y: number; r: number }> {
    const out: Array<{ x: number; y: number; r: number }> = [];
    const pose = d.frame.poses[0];
    if (!pose) return out;
    for (const idx of [LM.leftWrist, LM.rightWrist, LM.leftIndex, LM.rightIndex]) {
      const lm = pose.landmarks[idx];
      if (!visible(lm, VIS_MIN)) continue;
      const p = toScreen(lm, d);
      out.push({ x: p.x, y: p.y, r: 28 + d.settings.particleSize * 5 });
    }
    return out;
  }

  private handHit(b: Bubble, hits: Array<{ x: number; y: number; r: number }>): boolean {
    for (const h of hits) {
      if (Math.hypot(b.x - h.x, b.y - h.y) < b.r + h.r) return true;
    }
    return false;
  }

  private tryAbsorb(b: Bubble): void {
    for (const o of this.pool) {
      if (!o.alive || o.kind !== "body") continue;
      if (Math.hypot(b.x - o.x, b.y - o.y) < (b.r + o.r) * 0.5) {
        o.r = Math.min(o.base * 1.12, o.r + b.r * 0.08);
        b.alive = false;
        return;
      }
    }
  }

  private pop(b: Bubble, shards: number): void {
    const r = b.r;
    const x = b.x;
    const y = b.y;
    const vx = b.vx;
    const vy = b.vy;
    b.alive = false;
    const n = Math.max(1, shards);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 12 + Math.random() * 22;
      this.emit(x, y, vx * 0.15 + Math.cos(a) * s, vy * 0.15 + Math.sin(a) * s - 8, r * (0.2 + Math.random() * 0.12), "shard", 0.45);
    }
  }

  private emit(x: number, y: number, vx: number, vy: number, r: number, kind: Kind, life: number): void {
    const b = this.take();
    if (!b) return;
    b.alive = true;
    b.kind = kind;
    b.x = x;
    b.y = y;
    b.vx = vx;
    b.vy = vy;
    b.r = r;
    b.base = r;
    b.life = life;
    b.cool = kind === "free" ? 0.9 : 0.2;
    b.slot = 0;
  }

  private countKind(kind: Kind): number {
    let n = 0;
    for (const b of this.pool) if (b.alive && b.kind === kind) n += 1;
    return n;
  }

  private take(): Bubble | null {
    for (const b of this.pool) if (!b.alive) return b;
    return null;
  }

  private wrap(b: Bubble, w: number, h: number): void {
    if (b.x < -b.r) b.x = w + b.r;
    if (b.x > w + b.r) b.x = -b.r;
    if (b.y < -b.r) {
      b.y = h + b.r;
      b.x = Math.random() * w;
    }
    if (b.y > h + b.r * 2) b.y = -b.r;
  }
}

function drawDroplet(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  ang: number,
  fill: RGB,
  glow: RGB,
  alpha: number,
  bloom: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.globalAlpha = alpha;
  const rad = Math.max(rx, ry);
  const body = ctx.createRadialGradient(-rx * 0.16, -ry * 0.2, rad * 0.05, 0, 0, rad);
  body.addColorStop(0, rgbCss(fill, 0.1 + bloom * 0.06));
  body.addColorStop(0.5, rgbCss(glow, 0.22));
  body.addColorStop(0.82, rgbCss(glow, 0.5 + bloom * 0.1));
  body.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(255,255,255,${0.28 + bloom * 0.18})`;
  ctx.beginPath();
  ctx.ellipse(-rx * 0.28, -ry * 0.34, rx * 0.18, ry * 0.11, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSpec(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  glow: RGB,
  alpha: number,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = rgbCss(glow, 0.35);
  ctx.beginPath();
  ctx.ellipse(x - r * 0.22, y - r * 0.28, r * 0.16, r * 0.1, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.beginPath();
  ctx.ellipse(x - r * 0.24, y - r * 0.3, r * 0.08, r * 0.045, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
