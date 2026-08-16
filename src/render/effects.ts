import {
  LM,
  POSE_CONNECTIONS,
  RIBBON_JOINTS,
  VIS_MIN,
  type BodyPose,
  type Landmark,
  type PoseFrame,
  type Settings,
} from "../types";
import { coverFit, mapCover, mixRgb, rgbCss, type CoverTransform, type RGB } from "../math";
import { depthTint, type ActiveColors } from "./palettes";
import { visible } from "../pose";

export interface DrawCtx {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  cover: CoverTransform;
  srcW: number;
  srcH: number;
  colors: ActiveColors;
  settings: Settings;
  time: number;
  audio: number;
  frame: PoseFrame;
}

export function toScreen(lm: Landmark, d: DrawCtx): { x: number; y: number } {
  return mapCover(lm.x, lm.y, d.srcW, d.srcH, d.cover);
}

export function jointColor(lm: Landmark, base: RGB, d: DrawCtx): RGB {
  return depthTint(base, lm.z, d.settings.depthColor);
}

export function drawSkeleton(d: DrawCtx, alpha = 0.85): void {
  const { ctx, colors } = d;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const pose of d.frame.poses) {
    for (const [a, b] of POSE_CONNECTIONS) {
      const la = pose.landmarks[a];
      const lb = pose.landmarks[b];
      if (!visible(la, VIS_MIN) || !visible(lb, VIS_MIN)) continue;
      const pa = toScreen(la, d);
      const pb = toScreen(lb, d);
      const col = jointColor(la, colors.glowA, d);
      ctx.strokeStyle = rgbCss(col, alpha);
      ctx.lineWidth = 2.4 + d.settings.bloom * 2;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }
    for (const lm of pose.landmarks) {
      if (!visible(lm, VIS_MIN)) continue;
      const p = toScreen(lm, d);
      ctx.fillStyle = rgbCss(jointColor(lm, colors.primary, d), alpha);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

export function drawConstellation(d: DrawCtx): void {
  const { ctx, colors } = d;
  ctx.save();
  ctx.lineCap = "round";
  for (const pose of d.frame.poses) {
    for (const [a, b] of POSE_CONNECTIONS) {
      const la = pose.landmarks[a];
      const lb = pose.landmarks[b];
      if (!visible(la, VIS_MIN) || !visible(lb, VIS_MIN)) continue;
      const pa = toScreen(la, d);
      const pb = toScreen(lb, d);
      const grd = ctx.createLinearGradient(pa.x, pa.y, pb.x, pb.y);
      grd.addColorStop(0, rgbCss(jointColor(la, colors.glowA, d), 0.55));
      grd.addColorStop(1, rgbCss(jointColor(lb, colors.glowB, d), 0.55));
      ctx.strokeStyle = grd;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }
    for (const lm of pose.landmarks) {
      if (!visible(lm, 0.4)) continue;
      const p = toScreen(lm, d);
      const pulse = 2.2 + Math.sin(d.time * 4 + lm.x * 12) * 1.4 + d.audio * 4;
      const col = jointColor(lm, colors.primary, d);
      ctx.fillStyle = rgbCss(col, 0.2);
      ctx.beginPath();
      ctx.arc(p.x, p.y, pulse * 3.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgbCss(col, 0.95);
      ctx.beginPath();
      ctx.arc(p.x, p.y, pulse * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

export function drawNeon(d: DrawCtx): void {
  const { ctx } = d;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.shadowBlur = 18 + d.settings.bloom * 28;
  for (let pass = 0; pass < 3; pass++) {
    ctx.globalAlpha = 0.28 + pass * 0.22;
    ctx.lineWidth = 10 - pass * 3;
    ctx.shadowColor = pass === 0 ? rgbCss(d.colors.glowB, 1) : rgbCss(d.colors.glowA, 1);
    drawSkeleton(d, 1);
  }
  ctx.restore();
}

const ribbons = new Map<string, Array<{ x: number; y: number }>>();

export function drawRibbons(d: DrawCtx): void {
  const { ctx, colors } = d;
  const max = 28;
  ctx.save();
  ctx.lineCap = "round";
  ctx.globalCompositeOperation = "lighter";
  d.frame.poses.forEach((pose, pi) => {
    for (const idx of RIBBON_JOINTS) {
      const lm = pose.landmarks[idx];
      const key = `${pi}-${idx}`;
      let trail = ribbons.get(key);
      if (!trail) {
        trail = [];
        ribbons.set(key, trail);
      }
      if (visible(lm, VIS_MIN)) {
        const p = toScreen(lm, d);
        trail.push(p);
        if (trail.length > max) trail.shift();
      } else if (trail.length) {
        trail.shift();
      }
      if (trail.length < 3) continue;
      ctx.beginPath();
      ctx.moveTo(trail[0].x, trail[0].y);
      for (let i = 1; i < trail.length - 1; i++) {
        const nx = (trail[i].x + trail[i + 1].x) / 2;
        const ny = (trail[i].y + trail[i + 1].y) / 2;
        ctx.quadraticCurveTo(trail[i].x, trail[i].y, nx, ny);
      }
      const col = mixRgb(colors.primary, colors.secondary, idx / 28);
      ctx.strokeStyle = rgbCss(col, 0.55);
      ctx.lineWidth = 2.5 + d.settings.particleSize;
      ctx.stroke();
    }
  });
  ctx.restore();
}

export function drawPixels(d: DrawCtx): void {
  const { ctx, frame, colors } = d;
  if (!frame.mask || frame.maskWidth < 2) return;
  const cols = 48;
  const rows = Math.max(8, Math.round((cols * frame.maskHeight) / frame.maskWidth));
  const cw = d.w / cols;
  const ch = d.h / rows;
  ctx.save();
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const mx = Math.min(frame.maskWidth - 1, ((gx + 0.5) / cols) * frame.maskWidth | 0);
      const my = Math.min(frame.maskHeight - 1, ((gy + 0.5) / rows) * frame.maskHeight | 0);
      const v = frame.mask[my * frame.maskWidth + mx];
      if (v < 0.4) continue;
      const wobble = Math.sin(d.time * 3 + gx * 0.4 + gy * 0.3) * 4 * d.settings.turbulence;
      const t = (gx / cols + Math.sin(d.time + gy) * 0.1);
      const col = mixRgb(colors.primary, colors.secondary, t);
      ctx.fillStyle = rgbCss(col, 0.35 + v * 0.55);
      const p = mapCover((gx + 0.5) / cols, (gy + 0.5) / rows, d.srcW, d.srcH, d.cover);
      const s = Math.min(cw, ch) * 0.72 * (0.7 + v);
      ctx.fillRect(p.x - s / 2 + wobble, p.y - s / 2, s, s);
    }
  }
  ctx.restore();
}

const ghosts: ImageData[] = [];

export function drawGhost(d: DrawCtx, process: HTMLCanvasElement): void {
  const { ctx } = d;
  if (ghosts.length > 8) ghosts.shift();
  try {
    const small = document.createElement("canvas");
    small.width = 160;
    small.height = Math.max(2, Math.round(160 * (process.height / process.width)));
    const sctx = small.getContext("2d");
    if (sctx) {
      sctx.drawImage(process, 0, 0, small.width, small.height);
      ghosts.push(sctx.getImageData(0, 0, small.width, small.height));
    }
  } catch {
    /* tainted or busy */
  }
  ctx.save();
  ghosts.forEach((img, i) => {
    const t = (i + 1) / ghosts.length;
    ctx.globalAlpha = t * 0.18;
    const scale = 0.92 + t * 0.08;
    const tw = d.w * scale;
    const th = d.h * scale;
    const tmp = ghostCanvas(img);
    ctx.drawImage(tmp, (d.w - tw) / 2, (d.h - th) / 2, tw, th);
  });
  ctx.globalAlpha = 0.35;
  ctx.globalCompositeOperation = "screen";
  ctx.drawImage(process, d.cover.x, d.cover.y, d.srcW * d.cover.scale, d.srcH * d.cover.scale);
  ctx.restore();
  drawSkeleton(d, 0.35);
}

const ghostHold = document.createElement("canvas");
function ghostCanvas(img: ImageData): HTMLCanvasElement {
  if (ghostHold.width !== img.width) ghostHold.width = img.width;
  if (ghostHold.height !== img.height) ghostHold.height = img.height;
  ghostHold.getContext("2d")?.putImageData(img, 0, 0);
  return ghostHold;
}

const blobCanvas = document.createElement("canvas");
const blobCtx = blobCanvas.getContext("2d");

export function drawMetaballs(d: DrawCtx): void {
  if (!blobCtx) return;
  const scale = 0.35;
  const bw = Math.max(2, (d.w * scale) | 0);
  const bh = Math.max(2, (d.h * scale) | 0);
  if (blobCanvas.width !== bw) blobCanvas.width = bw;
  if (blobCanvas.height !== bh) blobCanvas.height = bh;
  blobCtx.clearRect(0, 0, bw, bh);
  blobCtx.globalCompositeOperation = "lighter";
  for (const pose of d.frame.poses) {
    for (const lm of pose.landmarks) {
      if (!visible(lm, VIS_MIN)) continue;
      const p = toScreen(lm, d);
      const r = (18 + (1 - Math.min(1, Math.abs(lm.z))) * 14 + d.settings.particleSize * 6) * scale;
      const grd = blobCtx.createRadialGradient(p.x * scale, p.y * scale, 0, p.x * scale, p.y * scale, r);
      grd.addColorStop(0, rgbCss(jointColor(lm, d.colors.primary, d), 0.95));
      grd.addColorStop(0.45, rgbCss(d.colors.secondary, 0.55));
      grd.addColorStop(1, "rgba(0,0,0,0)");
      blobCtx.fillStyle = grd;
      blobCtx.beginPath();
      blobCtx.arc(p.x * scale, p.y * scale, r, 0, Math.PI * 2);
      blobCtx.fill();
    }
  }
  d.ctx.save();
  d.ctx.filter = "blur(10px) contrast(18)";
  d.ctx.drawImage(blobCanvas, 0, 0, d.w, d.h);
  d.ctx.filter = "none";
  d.ctx.restore();
}

export function drawConnector(d: DrawCtx): void {
  if (d.frame.poses.length < 2) return;
  const a = midHip(d.frame.poses[0], d);
  const b = midHip(d.frame.poses[1], d);
  if (!a || !b) return;
  const { ctx, colors } = d;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2 + Math.sin(d.time * 3) * 18;
  ctx.strokeStyle = rgbCss(colors.glowA, 0.55);
  ctx.lineWidth = 2.5;
  ctx.shadowBlur = 16;
  ctx.shadowColor = rgbCss(colors.glowB, 1);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.quadraticCurveTo(mx, my, b.x, b.y);
  ctx.stroke();
  ctx.restore();
}

function midHip(pose: BodyPose, d: DrawCtx): { x: number; y: number } | null {
  const l = pose.landmarks[LM.leftHip];
  const r = pose.landmarks[LM.rightHip];
  const ls = pose.landmarks[LM.leftShoulder];
  const rs = pose.landmarks[LM.rightShoulder];
  if (visible(l, 0.35) && visible(r, 0.35)) {
    const a = toScreen(l, d);
    const b = toScreen(r, d);
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
  if (visible(ls, 0.35) && visible(rs, 0.35)) {
    const a = toScreen(ls, d);
    const b = toScreen(rs, d);
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
  return null;
}

export function drawFramingGhost(d: DrawCtx, alpha: number): void {
  if (alpha < 0.02) return;
  const { ctx, w, h, colors } = d;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = rgbCss(colors.glowA, 0.55);
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 10]);
  const cx = w / 2;
  const cy = h * 0.48;
  const s = Math.min(w, h) * 0.28;
  ctx.beginPath();
  ctx.ellipse(cx, cy - s * 0.72, s * 0.18, s * 0.22, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, cy - s * 0.5);
  ctx.quadraticCurveTo(cx, cy + s * 0.1, cx, cy + s * 0.35);
  ctx.moveTo(cx, cy - s * 0.28);
  ctx.lineTo(cx - s * 0.55, cy + s * 0.05);
  ctx.moveTo(cx, cy - s * 0.28);
  ctx.lineTo(cx + s * 0.55, cy + s * 0.05);
  ctx.moveTo(cx, cy + s * 0.35);
  ctx.lineTo(cx - s * 0.22, cy + s * 0.95);
  ctx.moveTo(cx, cy + s * 0.35);
  ctx.lineTo(cx + s * 0.22, cy + s * 0.95);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

export function drawMotionBg(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: number,
  colors: ActiveColors,
): void {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const orbs = 6;
  for (let i = 0; i < orbs; i++) {
    const x = w * (0.22 + 0.56 * (0.5 + 0.5 * Math.sin(time * (0.11 + i * 0.03) + i * 1.7)));
    const y = h * (0.2 + 0.6 * (0.5 + 0.5 * Math.cos(time * (0.09 + i * 0.025) + i * 2.1)));
    const r = Math.min(w, h) * (0.28 + 0.16 * Math.sin(time * 0.17 + i));
    const grd = ctx.createRadialGradient(x, y, r * 0.05, x, y, r);
    const col = i % 2 === 0 ? colors.primary : colors.secondary;
    const glow = i % 2 === 0 ? colors.glowA : colors.glowB;
    grd.addColorStop(0, rgbCss(glow, 0.22));
    grd.addColorStop(0.45, rgbCss(col, 0.1));
    grd.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  drawStars(ctx, w, h, time, rgbCss(colors.glowA, 0.55));
}

export function drawStars(ctx: CanvasRenderingContext2D, w: number, h: number, time: number, color: string): void {
  ctx.save();
  ctx.fillStyle = color;
  for (let i = 0; i < 80; i++) {
    const x = (hash(i * 19.1) * w);
    const y = (hash(i * 47.3) * h);
    const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * 1.4 + i));
    ctx.globalAlpha = tw * 0.7;
    ctx.beginPath();
    ctx.arc(x, y, 0.8 + hash(i * 3) * 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function hash(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

export function makeCover(srcW: number, srcH: number, dstW: number, dstH: number): CoverTransform {
  return coverFit(srcW, srcH, dstW, dstH);
}

export function wristEmitters(pose: BodyPose, d: DrawCtx): Array<{ x: number; y: number; vx: number; vy: number }> {
  const out: Array<{ x: number; y: number; vx: number; vy: number }> = [];
  for (const idx of [LM.leftWrist, LM.rightWrist, LM.leftIndex, LM.rightIndex]) {
    const lm = pose.landmarks[idx];
    const prev = pose.prev[idx];
    if (!visible(lm, VIS_MIN)) continue;
    const p = toScreen(lm, d);
    let vx = 0;
    let vy = 0;
    if (prev) {
      const q = toScreen(prev, d);
      vx = (p.x - q.x) * 18;
      vy = (p.y - q.y) * 18;
    }
    out.push({ x: p.x, y: p.y, vx, vy });
  }
  return out;
}

export function landmarkAttractors(d: DrawCtx): Array<{ x: number; y: number; w: number }> {
  const pts: Array<{ x: number; y: number; w: number }> = [];
  for (const pose of d.frame.poses) {
    for (const lm of pose.landmarks) {
      if (!visible(lm, VIS_MIN)) continue;
      const p = toScreen(lm, d);
      pts.push({ x: p.x, y: p.y, w: lm.vis });
    }
  }
  return pts;
}

