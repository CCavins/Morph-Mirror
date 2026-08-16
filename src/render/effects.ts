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
  const bloom = d.settings.bloom;
  for (const pose of d.frame.poses) {
    for (const [a, b] of POSE_CONNECTIONS) {
      const la = pose.landmarks[a];
      const lb = pose.landmarks[b];
      if (!visible(la, VIS_MIN) || !visible(lb, VIS_MIN)) continue;
      const pa = toScreen(la, d);
      const pb = toScreen(lb, d);
      const grd = ctx.createLinearGradient(pa.x, pa.y, pb.x, pb.y);
      grd.addColorStop(0, rgbCss(jointColor(la, colors.glowA, d), 0.5 + bloom * 0.2));
      grd.addColorStop(1, rgbCss(jointColor(lb, colors.glowB, d), 0.5 + bloom * 0.2));
      ctx.strokeStyle = grd;
      ctx.lineWidth = 1.1 + bloom * 0.8;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }
    for (const lm of pose.landmarks) {
      if (!visible(lm, 0.4)) continue;
      const p = toScreen(lm, d);
      const pulse = 2.1 + Math.sin(d.time * 1.55 + lm.x * 10) * 0.85 + d.audio * 3;
      const col = jointColor(lm, colors.primary, d);
      ctx.fillStyle = rgbCss(col, 0.18);
      ctx.beginPath();
      ctx.arc(p.x, p.y, pulse * (2.8 + bloom), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgbCss(col, 0.95);
      ctx.beginPath();
      ctx.arc(p.x, p.y, pulse * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

export function drawNeon(d: DrawCtx): void {
  const { ctx } = d;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const bloom = d.settings.bloom;
  ctx.shadowBlur = 16 + bloom * 26;
  for (let pass = 0; pass < 3; pass++) {
    ctx.globalAlpha = 0.3 + pass * 0.24;
    ctx.lineWidth = (13 - pass * 4) * (0.8 + bloom * 0.28);
    ctx.shadowColor = pass === 0 ? rgbCss(d.colors.glowB, 1) : rgbCss(d.colors.glowA, 1);
    ctx.strokeStyle = pass === 2 ? rgbCss(d.colors.primary, 1) : rgbCss(d.colors.glowA, 1);
    ctx.beginPath();
    for (const pose of d.frame.poses) {
      for (const [a, b] of POSE_CONNECTIONS) {
        const la = pose.landmarks[a];
        const lb = pose.landmarks[b];
        if (!visible(la, VIS_MIN) || !visible(lb, VIS_MIN)) continue;
        const pa = toScreen(la, d);
        const pb = toScreen(lb, d);
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
      }
    }
    ctx.stroke();
  }
  ctx.shadowBlur = 10 + bloom * 12;
  ctx.globalAlpha = 0.95;
  ctx.fillStyle = rgbCss(d.colors.primary, 1);
  for (const pose of d.frame.poses) {
    for (const lm of pose.landmarks) {
      if (!visible(lm, VIS_MIN)) continue;
      const p = toScreen(lm, d);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.4 + bloom * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

const ribbons = new Map<string, Array<{ x: number; y: number }>>();

export function drawRibbons(d: DrawCtx): void {
  const { ctx, colors } = d;
  const max = 28;
  const live = new Set<string>();
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalCompositeOperation = "lighter";
  const bloom = d.settings.bloom;
  d.frame.poses.forEach((pose, pi) => {
    for (const idx of RIBBON_JOINTS) {
      const lm = pose.landmarks[idx];
      const key = `${pi}-${idx}`;
      live.add(key);
      let trail = ribbons.get(key);
      if (!trail) {
        trail = [];
        ribbons.set(key, trail);
      }
      if (visible(lm, VIS_MIN)) {
        const p = toScreen(lm, d);
        const last = trail[trail.length - 1];
        if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 1.4) {
          trail.push(p);
          if (trail.length > max) trail.shift();
        }
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
      ctx.strokeStyle = rgbCss(col, 0.52);
      ctx.shadowColor = rgbCss(col, 0.7);
      ctx.shadowBlur = 6 + bloom * 10;
      ctx.lineWidth = 2.4 + d.settings.particleSize;
      ctx.stroke();
    }
  });
  for (const key of ribbons.keys()) {
    if (!live.has(key)) ribbons.delete(key);
  }
  ctx.restore();
}

export function drawPixels(d: DrawCtx): void {
  const { ctx, frame, colors } = d;
  ctx.save();
  if (frame.mask && frame.maskWidth > 1) {
    const cols = 48;
    const rows = Math.max(8, Math.round((cols * frame.maskHeight) / frame.maskWidth));
    const cell = Math.min(
      d.srcW * d.cover.scale / cols,
      d.srcH * d.cover.scale / rows,
    );
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        const mx = Math.min(frame.maskWidth - 1, ((gx + 0.5) / cols) * frame.maskWidth | 0);
        const my = Math.min(frame.maskHeight - 1, ((gy + 0.5) / rows) * frame.maskHeight | 0);
        const v = frame.mask[my * frame.maskWidth + mx];
        if (v < 0.4) continue;
        const wobble = Math.sin(d.time * 1.15 + gx * 0.35 + gy * 0.28) * 3 * d.settings.turbulence;
        const t = gx / cols + Math.sin(d.time * 0.45 + gy * 0.12) * 0.12;
        const col = mixRgb(colors.primary, colors.secondary, t);
        ctx.fillStyle = rgbCss(col, 0.32 + v * 0.58);
        const p = mapCover((gx + 0.5) / cols, (gy + 0.5) / rows, d.srcW, d.srcH, d.cover);
        const s = cell * 0.78 * (0.7 + v);
        ctx.fillRect(p.x - s / 2 + wobble, p.y - s / 2, s, s);
      }
    }
  } else {
    for (const pose of frame.poses) {
      for (const lm of pose.landmarks) {
        if (!visible(lm, VIS_MIN)) continue;
        const p = toScreen(lm, d);
        const s = 10 + d.settings.particleSize * 4;
        ctx.fillStyle = rgbCss(jointColor(lm, colors.primary, d), 0.8);
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      }
    }
  }
  ctx.restore();
}

const blobCanvas = document.createElement("canvas");
const blobCtx = blobCanvas.getContext("2d");
const blobSmooth: Array<{ x: number; y: number; r: number; id: number }> = [];

const BLOB_JOINTS = [
  LM.nose,
  LM.leftShoulder, LM.rightShoulder,
  LM.leftElbow, LM.rightElbow,
  LM.leftWrist, LM.rightWrist,
  LM.leftHip, LM.rightHip,
  LM.leftKnee, LM.rightKnee,
  LM.leftAnkle, LM.rightAnkle,
] as const;

export function drawMetaballs(d: DrawCtx): void {
  if (!blobCtx) return;
  const scale = 0.32;
  const bw = Math.max(2, (d.w * scale) | 0);
  const bh = Math.max(2, (d.h * scale) | 0);
  if (blobCanvas.width !== bw) blobCanvas.width = bw;
  if (blobCanvas.height !== bh) blobCanvas.height = bh;
  blobCtx.clearRect(0, 0, bw, bh);
  blobCtx.globalCompositeOperation = "source-over";
  blobCtx.filter = "blur(4px)";

  const targets: Array<{ x: number; y: number; r: number; id: number }> = [];
  d.frame.poses.forEach((pose, pi) => {
    let sx = 0;
    let sy = 0;
    let sn = 0;
    for (const idx of BLOB_JOINTS) {
      const lm = pose.landmarks[idx];
      if (!visible(lm, VIS_MIN)) continue;
      const p = toScreen(lm, d);
      const torso = idx === LM.leftHip || idx === LM.rightHip || idx === LM.leftShoulder || idx === LM.rightShoulder;
      const r = (torso ? 26 : 16) + (1 - Math.min(1, Math.abs(lm.z))) * 10 + d.settings.particleSize * 7;
      targets.push({ x: p.x, y: p.y, r, id: pi * 64 + idx });
      if (torso) {
        sx += p.x;
        sy += p.y;
        sn += 1;
      }
    }
    if (sn >= 3) {
      targets.push({ x: sx / sn, y: sy / sn, r: 34 + d.settings.particleSize * 8, id: pi * 64 + 50 });
    }
  });

  if (!targets.length) {
    blobSmooth.length = 0;
    return;
  }

  if (blobSmooth.length !== targets.length) {
    blobSmooth.length = 0;
    for (const t of targets) blobSmooth.push({ ...t });
  } else {
    for (let i = 0; i < targets.length; i++) {
      const s = blobSmooth[i];
      const t = targets[i];
      if (s.id !== t.id) {
        blobSmooth[i] = { ...t };
        continue;
      }
      s.x += (t.x - s.x) * 0.22;
      s.y += (t.y - s.y) * 0.22;
      s.r += (t.r - s.r) * 0.16;
    }
  }

  for (const b of blobSmooth) {
    const x = b.x * scale;
    const y = b.y * scale;
    const r = b.r * scale * 1.15;
    const grd = blobCtx.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, rgbCss(d.colors.primary, 0.92));
    grd.addColorStop(0.5, rgbCss(d.colors.secondary, 0.42));
    grd.addColorStop(1, "rgba(0,0,0,0)");
    blobCtx.fillStyle = grd;
    blobCtx.beginPath();
    blobCtx.arc(x, y, r, 0, Math.PI * 2);
    blobCtx.fill();
  }
  blobCtx.filter = "none";
  d.ctx.save();
  d.ctx.filter = "blur(12px) contrast(7)";
  d.ctx.drawImage(blobCanvas, 0, 0, d.w, d.h);
  d.ctx.filter = "none";
  d.ctx.restore();
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
  for (const idx of [LM.leftWrist, LM.rightWrist]) {
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

export function landmarkAttractors(d: DrawCtx, out: Array<{ x: number; y: number; w: number }> = []): Array<{ x: number; y: number; w: number }> {
  let n = 0;
  for (const pose of d.frame.poses) {
    for (const lm of pose.landmarks) {
      if (!visible(lm, VIS_MIN)) continue;
      const p = toScreen(lm, d);
      const a = out[n];
      if (a) {
        a.x = p.x;
        a.y = p.y;
        a.w = lm.vis;
      } else {
        out[n] = { x: p.x, y: p.y, w: lm.vis };
      }
      n += 1;
    }
  }
  out.length = n;
  return out;
}

