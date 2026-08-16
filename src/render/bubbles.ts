import { clamp, hueShift, lerp, rand, rgbCss, type RGB } from "../math";
import { LM, VIS_MIN } from "../types";
import { visible } from "../pose";
import { toScreen, type DrawCtx } from "./effects";

interface Floater {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  seed: number;
  alive: boolean;
}

interface Anchor {
  x: number;
  y: number;
  s: number;
}

const RAYS = 32;
const CHAINS: Array<[number, number, number]> = [
  [LM.leftShoulder, LM.leftElbow, LM.leftWrist],
  [LM.rightShoulder, LM.rightElbow, LM.rightWrist],
  [LM.leftHip, LM.leftKnee, LM.leftAnkle],
  [LM.rightHip, LM.rightKnee, LM.rightAnkle],
];

export class BubbleEngine {
  private hull: Anchor[] = [];
  private radii = new Float32Array(RAYS);
  private floaters: Floater[] = [];
  private cx = 0;
  private cy = 0;
  private ready = false;
  private pulse = 0;

  burst(_cx: number, _cy: number): void {
    this.pulse = 1;
  }

  step(d: DrawCtx, dt: number, reduced: boolean): void {
    this.updateHull(d, dt);
    this.pulse *= Math.pow(0.12, dt);
    this.stepFloaters(d, dt, reduced);
  }

  draw(d: DrawCtx, reduced: boolean): void {
    const hue = d.settings.colorCycle > 0 ? d.time * 36 * d.settings.colorCycle : 0;
    this.drawBody(d, hue, reduced);
    const bloom = d.settings.bloom;
    for (const b of this.floaters) {
      if (!b.alive) continue;
      const tint = hueShift(d.colors.primary, hue + b.seed * 10);
      const glow = hueShift(d.colors.glowA, hue + b.seed * 16);
      drawSoap(d.ctx, b.x, b.y, b.r, tint, glow, 0.78, bloom, reduced);
    }
  }

  private drawBody(d: DrawCtx, hue: number, reduced: boolean): void {
    const pts = this.hull;
    if (pts.length < 8 || !this.ready) return;
    const ctx = d.ctx;
    let cx = 0;
    let cy = 0;
    for (const p of pts) {
      cx += p.x;
      cy += p.y;
    }
    cx /= pts.length;
    cy /= pts.length;
    let maxR = 24;
    for (const p of pts) maxR = Math.max(maxR, Math.hypot(p.x - cx, p.y - cy));

    const primary = hueShift(d.colors.primary, hue);
    const secondary = hueShift(d.colors.secondary, hue + 38);
    const glow = hueShift(d.colors.glowA, hue + 16);
    const glowB = hueShift(d.colors.glowB, hue + 54);
    const shine = d.settings.bloom;
    const pulse = this.pulse;

    ctx.save();
    pathHull(ctx, pts);

    const fill = ctx.createRadialGradient(cx - maxR * 0.18, cy - maxR * 0.22, maxR * 0.04, cx, cy, maxR);
    fill.addColorStop(0, rgbCss(glow, 0.42 + shine * 0.18 + pulse * 0.12));
    fill.addColorStop(0.28, rgbCss(primary, 0.34 + shine * 0.1));
    fill.addColorStop(0.62, rgbCss(secondary, 0.22 + shine * 0.08));
    fill.addColorStop(0.86, rgbCss(glowB, 0.38 + shine * 0.16));
    fill.addColorStop(0.96, "rgba(255,255,255,0.55)");
    fill.addColorStop(1, "rgba(255,255,255,0.08)");
    ctx.fillStyle = fill;
    ctx.fill();

    ctx.save();
    ctx.clip();
    const flow = d.settings.particleSpeed;
    ctx.globalCompositeOperation = "lighter";
    const bands = reduced ? 2 : 4;
    for (let i = 0; i < bands; i++) {
      const t = d.time * (0.11 + flow * 0.08) + i * 1.7;
      const x = cx + Math.sin(t) * maxR * 0.28;
      const y = cy + Math.cos(t * 0.8 + i) * maxR * 0.22;
      const r = maxR * (0.34 + 0.1 * Math.sin(t * 0.6 + i));
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const col = i % 2 === 0 ? glow : secondary;
      g.addColorStop(0, rgbCss(col, 0.2 + shine * 0.1));
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = `rgba(255,255,255,${0.14 + shine * 0.1 + pulse * 0.08})`;
    ctx.beginPath();
    ctx.ellipse(cx - maxR * 0.26, cy - maxR * 0.32, maxR * 0.24, maxR * 0.1, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = `rgba(255,255,255,${0.5 + shine * 0.28})`;
    ctx.lineWidth = Math.max(2, maxR * 0.022);
    ctx.stroke();
    ctx.strokeStyle = rgbCss(glow, 0.4 + shine * 0.2);
    ctx.lineWidth = Math.max(1.1, maxR * 0.012);
    ctx.stroke();
    ctx.restore();
  }

  private updateHull(d: DrawCtx, dt: number): void {
    const fromMask = this.maskInterior(d);
    const targets = fromMask.length === RAYS ? fromMask : this.jointInterior(d);
    if (!targets.length) {
      this.ready = false;
      this.hull.length = 0;
      return;
    }

    const cling = 0.06 + d.settings.attract * 0.04;
    const ease = 1 - Math.pow(1 - cling, dt * 60);
    if (this.hull.length !== targets.length) {
      this.hull = targets.map((p) => ({ ...p }));
      this.ready = true;
      return;
    }
    const t = this.ready ? Math.min(0.2, ease) : 1;
    for (let i = 0; i < targets.length; i++) {
      const a = this.hull[i];
      const b = targets[i];
      a.x = lerp(a.x, b.x, t);
      a.y = lerp(a.y, b.y, t);
      a.s = lerp(a.s, b.s, t * 0.7);
    }
    const breathe = 1 + Math.sin(d.time * 0.7) * d.settings.turbulence * 0.012;
    let mx = 0;
    let my = 0;
    for (const p of this.hull) {
      mx += p.x;
      my += p.y;
    }
    mx /= this.hull.length;
    my /= this.hull.length;
    for (let i = 0; i < RAYS; i++) {
      const a = this.hull[i];
      const prev = this.hull[(i + RAYS - 1) % RAYS];
      const next = this.hull[(i + 1) % RAYS];
      a.x = a.x * 0.72 + prev.x * 0.14 + next.x * 0.14;
      a.y = a.y * 0.72 + prev.y * 0.14 + next.y * 0.14;
      a.x = mx + (a.x - mx) * breathe;
      a.y = my + (a.y - my) * breathe;
    }
    this.ready = true;
  }

  private maskInterior(d: DrawCtx): Anchor[] {
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
    const mix = jumped ? 1 : 0.12;
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
    const rMix = jumped ? 1 : 0.12;
    for (let i = 0; i < RAYS; i++) {
      const sm = rawR[(i + RAYS - 1) % RAYS] * 0.22 + rawR[i] * 0.56 + rawR[(i + 1) % RAYS] * 0.22;
      this.radii[i] += (sm - this.radii[i]) * rMix;
    }

    let mean = 0;
    for (let i = 0; i < RAYS; i++) mean += this.radii[i];
    mean /= RAYS;
    const pad = 0.96 + d.settings.particleSize * 0.02;
    const out: Anchor[] = [];
    for (let i = 0; i < RAYS; i++) {
      const ang = (i / RAYS) * Math.PI * 2;
      const r = this.radii[i];
      const nx = clamp((this.cx + Math.cos(ang) * r * pad) / mw, 0, 1);
      const ny = clamp((this.cy + Math.sin(ang) * r * pad) / mh, 0, 1);
      const p = toScreen({ x: nx, y: ny, z: 0, vis: 1 }, d);
      out.push({ x: p.x, y: p.y, s: 0.9 + clamp(r / Math.max(8, mean), 0.55, 1.55) * 0.3 });
    }
    return out;
  }

  private jointInterior(d: DrawCtx): Anchor[] {
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
    const out: Anchor[] = [];
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
      rs.push(Math.max(24, best * 1.04));
      mean += rs[i];
    }
    mean /= RAYS;
    const pad = 0.96 + d.settings.particleSize * 0.02;
    for (let i = 0; i < RAYS; i++) {
      const ang = (i / RAYS) * Math.PI * 2;
      const r = rs[i];
      out.push({
        x: cx + Math.cos(ang) * r * pad,
        y: cy + Math.sin(ang) * r * pad,
        s: 0.9 + clamp(r / mean, 0.6, 1.5) * 0.28,
      });
    }
    return out;
  }

  private stepFloaters(d: DrawCtx, dt: number, reduced: boolean): void {
    const want = reduced ? 3 : 5;
    const size = 10 + d.settings.particleSize * 5;
    const lift = -10 + d.settings.gravity * 22;
    const speed = 0.35 + d.settings.particleSpeed * 0.45;
    while (this.floaters.length < want) {
      this.floaters.push({
        x: Math.random() * d.w,
        y: d.h + 40 + Math.random() * 80,
        vx: rand(-8, 8),
        vy: rand(-18, -6),
        r: size * (0.7 + Math.random() * 0.55),
        seed: Math.random() * 1000,
        alive: true,
      });
    }
    if (this.floaters.length > want) this.floaters.length = want;

    for (const b of this.floaters) {
      b.vy += lift * dt;
      b.vx += Math.sin(d.time * 0.12 + b.seed) * 3.2 * speed * dt;
      b.vx *= 0.996;
      b.vy *= 0.996;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < -b.r) b.x = d.w + b.r;
      if (b.x > d.w + b.r) b.x = -b.r;
      if (b.y < -b.r) {
        b.y = d.h + b.r;
        b.x = Math.random() * d.w;
        b.vy = rand(-16, -6);
      }
      if (b.y > d.h + b.r * 3) b.y = -b.r;
    }
  }
}

function pathHull(ctx: CanvasRenderingContext2D, pts: Anchor[]): void {
  const last = pts[pts.length - 1];
  const first = pts[0];
  ctx.beginPath();
  ctx.moveTo((last.x + first.x) * 0.5, (last.y + first.y) * 0.5);
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const n = pts[(i + 1) % pts.length];
    ctx.quadraticCurveTo(p.x, p.y, (p.x + n.x) * 0.5, (p.y + n.y) * 0.5);
  }
  ctx.closePath();
}

function drawSoap(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  fill: RGB,
  glow: RGB,
  alpha: number,
  bloom: number,
  reduced: boolean,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = alpha;
  const body = ctx.createRadialGradient(-r * 0.2, -r * 0.24, r * 0.04, 0, 0, r);
  body.addColorStop(0, "rgba(255,255,255,0.32)");
  body.addColorStop(0.22, rgbCss(fill, 0.05 + bloom * 0.03));
  body.addColorStop(0.7, rgbCss(glow, 0.08));
  body.addColorStop(0.88, rgbCss(fill, 0.34 + bloom * 0.14));
  body.addColorStop(0.96, "rgba(255,255,255,0.58)");
  body.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `rgba(255,255,255,${0.34 + bloom * 0.18})`;
  ctx.lineWidth = Math.max(1, r * 0.04);
  ctx.stroke();
  if (!reduced) {
    ctx.fillStyle = `rgba(255,255,255,${0.46 + bloom * 0.22})`;
    ctx.beginPath();
    ctx.ellipse(-r * 0.28, -r * 0.34, r * 0.18, r * 0.1, -0.45, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
