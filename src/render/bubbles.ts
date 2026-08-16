import { clamp, curl2, hash2, rand, rgbCss, type RGB } from "../math";
import { LM, VIS_MIN, type PoseFrame } from "../types";
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
  scale: number;
  kind: Kind;
  life: number;
  seed: number;
  cool: number;
  alive: boolean;
}

const JOINTS: Array<{ i: number; s: number }> = [
  { i: LM.nose, s: 1.7 },
  { i: LM.leftShoulder, s: 1.5 },
  { i: LM.rightShoulder, s: 1.5 },
  { i: LM.leftElbow, s: 1.2 },
  { i: LM.rightElbow, s: 1.2 },
  { i: LM.leftWrist, s: 1.1 },
  { i: LM.rightWrist, s: 1.1 },
  { i: LM.leftHip, s: 1.55 },
  { i: LM.rightHip, s: 1.55 },
  { i: LM.leftKnee, s: 1.25 },
  { i: LM.rightKnee, s: 1.25 },
  { i: LM.leftAnkle, s: 1.05 },
  { i: LM.rightAnkle, s: 1.05 },
];

function blank(): Bubble {
  return {
    x: 0, y: 0, vx: 0, vy: 0, r: 12, base: 12,
    ax: 0, ay: 0, scale: 1, kind: "ambient",
    life: 1, seed: Math.random() * 1000, cool: 0, alive: false,
  };
}

export class BubbleEngine {
  private pool: Bubble[] = Array.from({ length: 96 }, blank);
  private goo = document.createElement("canvas");
  private gooCtx = this.goo.getContext("2d");
  private tick = 0;
  private edge: Array<{ x: number; y: number }> = [];

  burst(cx: number, cy: number): void {
    for (const b of this.pool) {
      if (!b.alive || (b.kind !== "ambient" && b.kind !== "free")) continue;
      if (Math.hypot(b.x - cx, b.y - cy) < 220) this.pop(b);
    }
  }

  step(d: DrawCtx, dt: number, reduced: boolean): void {
    this.tick++;
    const { w, h, settings, frame, time } = d;
    const bodyN = reduced ? 12 : clamp(14 + settings.particleCount / 220, 16, 32) | 0;
    const ambientN = reduced ? 6 : clamp(8 + settings.particleCount / 380, 10, 20) | 0;
    const size = 22 + settings.particleSize * 16;
    const cling = 3.2 + settings.attract * 9;
    const turb = settings.turbulence;
    const speed = settings.particleSpeed;
    const lift = -36 + settings.gravity * 70;

    this.gatherEdge(d);
    this.ensureBody(d, bodyN, size);
    this.ensureAmbient(w, h, ambientN, size * 0.72);
    this.bindBody(d, size);

    const hits = this.hitters(d);

    for (const b of this.pool) {
      if (!b.alive) continue;
      b.cool = Math.max(0, b.cool - dt);
      const n = curl2(b.x * 0.003 + b.seed, b.y * 0.003 + time * 0.35);
      b.vx += n.x * turb * 55 * dt;
      b.vy += n.y * turb * 55 * dt;

      if (b.kind === "body") {
        b.vx += (b.ax - b.x) * cling * dt;
        b.vy += (b.ay - b.y) * cling * dt;
        b.vx *= 0.86;
        b.vy *= 0.86;
        const reach = Math.hypot(b.x - b.ax, b.y - b.ay);
        const lim = b.r * (1.65 + 0.55 / Math.max(0.25, settings.attract));
        if (b.cool <= 0 && reach > lim && Math.hypot(b.vx, b.vy) > 70 * speed) {
          const nx = (b.x - b.ax) / Math.max(1, reach);
          const ny = (b.y - b.ay) / Math.max(1, reach);
          this.emit(
            b.x + nx * b.r * 0.4,
            b.y + ny * b.r * 0.4,
            b.vx * 0.9,
            b.vy * 0.9,
            b.r * 0.48,
            "free",
            2.6,
          );
          b.x = b.ax + (b.x - b.ax) * 0.32;
          b.y = b.ay + (b.y - b.ay) * 0.32;
          b.vx *= 0.22;
          b.vy *= 0.22;
          b.cool = 0.32;
        }
        b.r += (b.base - b.r) * 0.08;
      } else if (b.kind === "ambient") {
        b.vy += lift * dt;
        b.vx += Math.sin(time * 0.7 + b.seed) * 12 * speed * dt;
        b.vx *= 0.99;
        b.vy *= 0.99;
        this.wrap(b, w, h);
        if (this.collides(b, frame, d, hits)) {
          this.pop(b);
          continue;
        }
      } else if (b.kind === "free") {
        b.vy += lift * 0.55 * dt;
        b.vx *= 0.985;
        b.vy *= 0.985;
        b.life -= dt * 0.18;
        b.r += (b.base - b.r) * 0.06;
        if (b.life <= 0) {
          this.pop(b);
          continue;
        }
        if (b.cool <= 0 && this.hitOnly(b, hits)) {
          this.pop(b);
          continue;
        }
        this.tryAbsorb(b);
        if (!b.alive) continue;
      } else {
        b.life -= dt * 1.6;
        b.r *= 0.96;
        b.vx *= 0.94;
        b.vy *= 0.94;
        if (b.life <= 0 || b.r < 2) b.alive = false;
      }

      b.x += b.vx * dt * speed;
      b.y += b.vy * dt * speed;
    }
  }

  draw(d: DrawCtx, reduced: boolean): void {
    const { ctx, colors, settings, time } = d;
    const bloom = settings.bloom;
    if (!reduced) this.drawGoo(d);

    for (const b of this.pool) {
      if (!b.alive) continue;
      const spd = Math.hypot(b.vx, b.vy);
      const stretch = 1 + Math.min(0.55, spd * 0.0028);
      const ang = Math.atan2(b.vy, b.vx);
      const wobble = 1 + Math.sin(time * 3.1 + b.seed) * 0.07 * settings.turbulence;
      const rx = b.r * stretch * wobble;
      const ry = b.r / stretch * wobble;
      const tint = hash2(b.seed, 1) > 0.5 ? colors.primary : colors.secondary;
      const glow = hash2(b.seed, 2) > 0.5 ? colors.glowA : colors.glowB;
      const a = b.kind === "shard" ? Math.max(0, b.life) * 0.9
        : b.kind === "free" ? 0.55 + b.life * 0.2
        : 0.92;
      drawDroplet(ctx, b.x, b.y, rx, ry, ang, tint, glow, a, bloom);
    }
  }

  private drawGoo(d: DrawCtx): void {
    const gctx = this.gooCtx;
    if (!gctx) return;
    const scale = 0.28;
    const bw = Math.max(2, (d.w * scale) | 0);
    const bh = Math.max(2, (d.h * scale) | 0);
    if (this.goo.width !== bw) this.goo.width = bw;
    if (this.goo.height !== bh) this.goo.height = bh;
    gctx.clearRect(0, 0, bw, bh);
    gctx.globalCompositeOperation = "lighter";
    for (const b of this.pool) {
      if (!b.alive || (b.kind !== "body" && b.kind !== "free")) continue;
      const x = b.x * scale;
      const y = b.y * scale;
      const r = b.r * 1.15 * scale;
      const grd = gctx.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, rgbCss(d.colors.glowA, 0.95));
      grd.addColorStop(0.55, rgbCss(d.colors.secondary, 0.45));
      grd.addColorStop(1, "rgba(0,0,0,0)");
      gctx.fillStyle = grd;
      gctx.beginPath();
      gctx.arc(x, y, r, 0, Math.PI * 2);
      gctx.fill();
    }
    d.ctx.save();
    d.ctx.filter = "blur(7px) contrast(16)";
    d.ctx.globalCompositeOperation = "lighter";
    d.ctx.globalAlpha = 0.72;
    d.ctx.drawImage(this.goo, 0, 0, d.w, d.h);
    d.ctx.filter = "none";
    d.ctx.restore();
  }

  private ensureBody(d: DrawCtx, n: number, size: number): void {
    let have = this.countKind("body");
    for (let i = have; i < n; i++) {
      const b = this.take();
      if (!b) break;
      b.kind = "body";
      b.alive = true;
      b.life = 1;
      b.scale = 0.85 + (i % 7) * 0.12;
      b.base = size * b.scale;
      b.r = b.base;
      b.x = d.w * 0.5;
      b.y = d.h * 0.5;
      b.ax = b.x;
      b.ay = b.y;
      have += 1;
    }
    let extra = have - n;
    for (const b of this.pool) {
      if (extra <= 0) break;
      if (b.alive && b.kind === "body") {
        b.alive = false;
        extra -= 1;
      }
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
      b.base = size * (0.55 + Math.random() * 0.9);
      b.r = b.base;
      b.x = Math.random() * w;
      b.y = Math.random() * h;
      b.vx = rand(-18, 18);
      b.vy = rand(-24, -6);
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

  private bindBody(d: DrawCtx, size: number): void {
    const pose = d.frame.poses[0];
    const anchors: Array<{ x: number; y: number; s: number }> = [];
    if (pose) {
      for (const j of JOINTS) {
        const lm = pose.landmarks[j.i];
        if (!visible(lm, VIS_MIN)) continue;
        const p = toScreen(lm, d);
        anchors.push({ x: p.x, y: p.y, s: j.s });
      }
      const ls = pose.landmarks[LM.leftShoulder];
      const rs = pose.landmarks[LM.rightShoulder];
      const lh = pose.landmarks[LM.leftHip];
      const rh = pose.landmarks[LM.rightHip];
      if (visible(ls, VIS_MIN) && visible(rs, VIS_MIN)) {
        const a = toScreen(ls, d);
        const b = toScreen(rs, d);
        anchors.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, s: 1.65 });
      }
      if (visible(ls, VIS_MIN) && visible(lh, VIS_MIN) && visible(rs, VIS_MIN) && visible(rh, VIS_MIN)) {
        const a = toScreen(ls, d);
        const b = toScreen(rs, d);
        const c = toScreen(lh, d);
        const e = toScreen(rh, d);
        anchors.push({
          x: (a.x + b.x + c.x + e.x) / 4,
          y: (a.y + b.y + c.y + e.y) / 4,
          s: 1.9,
        });
      }
    }
    for (const p of this.edge) anchors.push({ x: p.x, y: p.y, s: 1.15 });
    if (!anchors.length) return;

    let i = 0;
    for (const b of this.pool) {
      if (!b.alive || b.kind !== "body") continue;
      const a = anchors[i % anchors.length];
      i += 1;
      b.ax = a.x;
      b.ay = a.y;
      b.base = size * b.scale * a.s * 0.72;
      if (Math.hypot(b.x - b.ax, b.y - b.ay) > 420) {
        b.x = a.x;
        b.y = a.y;
        b.vx = 0;
        b.vy = 0;
      }
    }
  }

  private gatherEdge(d: DrawCtx): void {
    if (this.tick % 4 !== 0) return;
    this.edge.length = 0;
    const { frame } = d;
    if (!frame.mask || frame.maskWidth < 4) return;
    const mw = frame.maskWidth;
    const mh = frame.maskHeight;
    const want = 18;
    let tries = 0;
    while (this.edge.length < want && tries < 280) {
      tries += 1;
      const x = 1 + ((Math.random() * (mw - 2)) | 0);
      const y = 1 + ((Math.random() * (mh - 2)) | 0);
      const i = y * mw + x;
      const v = frame.mask[i];
      if (v < 0.3 || v > 0.82) continue;
      const n = frame.mask[i - 1] + frame.mask[i + 1] + frame.mask[i - mw] + frame.mask[i + mw];
      if (n < 0.7 || n > 3.1) continue;
      this.edge.push(toScreen({ x: x / mw, y: y / mh, z: 0, vis: 1 }, d));
    }
  }

  private hitters(d: DrawCtx): Array<{ x: number; y: number; r: number }> {
    const out: Array<{ x: number; y: number; r: number }> = [];
    const pose = d.frame.poses[0];
    if (!pose) return out;
    for (const idx of [LM.leftWrist, LM.rightWrist, LM.leftIndex, LM.rightIndex, LM.nose]) {
      const lm = pose.landmarks[idx];
      if (!visible(lm, VIS_MIN)) continue;
      const p = toScreen(lm, d);
      out.push({ x: p.x, y: p.y, r: idx === LM.nose ? 42 : 38 + d.settings.particleSize * 8 });
    }
    return out;
  }

  private hitOnly(b: Bubble, hits: Array<{ x: number; y: number; r: number }>): boolean {
    for (const h of hits) {
      if (Math.hypot(b.x - h.x, b.y - h.y) < b.r + h.r) return true;
    }
    return false;
  }

  private collides(b: Bubble, frame: PoseFrame, d: DrawCtx, hits: Array<{ x: number; y: number; r: number }>): boolean {
    for (const h of hits) {
      if (Math.hypot(b.x - h.x, b.y - h.y) < b.r + h.r) return true;
    }
    for (const o of this.pool) {
      if (!o.alive || o === b || o.kind !== "body") continue;
      if (Math.hypot(b.x - o.x, b.y - o.y) < (b.r + o.r) * 0.72) return true;
    }
    if (!frame.mask || frame.maskWidth < 2) return false;
    const nx = (b.x - d.cover.x) / (d.srcW * d.cover.scale);
    const ny = (b.y - d.cover.y) / (d.srcH * d.cover.scale);
    if (nx < 0.02 || ny < 0.02 || nx > 0.98 || ny > 0.98) return false;
    const mx = Math.min(frame.maskWidth - 1, (nx * frame.maskWidth) | 0);
    const my = Math.min(frame.maskHeight - 1, (ny * frame.maskHeight) | 0);
    return frame.mask[my * frame.maskWidth + mx] > 0.48;
  }

  private tryAbsorb(b: Bubble): void {
    for (const o of this.pool) {
      if (!o.alive || o.kind !== "body") continue;
      if (Math.hypot(b.x - o.x, b.y - o.y) < (b.r + o.r) * 0.45) {
        o.r = Math.min(o.base * 1.35, o.r + b.r * 0.18);
        b.alive = false;
        return;
      }
    }
  }

  private pop(b: Bubble): void {
    const n = 3 + ((Math.random() * 3) | 0);
    const r = b.r;
    const x = b.x;
    const y = b.y;
    const vx = b.vx;
    const vy = b.vy;
    b.alive = false;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 40 + Math.random() * 90;
      this.emit(x, y, vx * 0.3 + Math.cos(a) * s, vy * 0.3 + Math.sin(a) * s - 20, r * (0.18 + Math.random() * 0.22), "shard", 0.7);
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
    b.cool = kind === "free" ? 0.55 : 0.2;
    b.scale = 1;
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
  const body = ctx.createRadialGradient(-rx * 0.18, -ry * 0.22, rad * 0.04, 0, 0, rad);
  body.addColorStop(0, rgbCss(fill, 0.12 + bloom * 0.08));
  body.addColorStop(0.42, rgbCss(glow, 0.2));
  body.addColorStop(0.78, rgbCss(glow, 0.55 + bloom * 0.12));
  body.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `rgba(255,255,255,${0.22 + bloom * 0.18})`;
  ctx.lineWidth = Math.max(1, rad * 0.04);
  ctx.stroke();
  ctx.fillStyle = `rgba(255,255,255,${0.42 + bloom * 0.28})`;
  ctx.beginPath();
  ctx.ellipse(-rx * 0.32, -ry * 0.38, rx * 0.22, ry * 0.13, -0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = alpha * 0.7;
  ctx.beginPath();
  ctx.ellipse(rx * 0.22, ry * 0.08, rx * 0.07, ry * 0.04, 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
