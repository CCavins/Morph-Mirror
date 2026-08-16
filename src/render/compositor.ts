import type { PoseFrame, Settings } from "../types";
import { LM, VIS_MIN } from "../types";
import { clamp, coverFit, mapCover, rgbCss } from "../math";
import { resolveColors, type ActiveColors } from "./palettes";
import { LiquidRenderer } from "./liquid";
import { ParticleEngine, sampleEdgeGrid, sampleMaskGrid, type Attractor } from "./particles";
import {
  drawConnector,
  drawConstellation,
  drawFramingGhost,
  drawMetaballs,
  drawMotionBg,
  drawNeon,
  drawPixels,
  drawRibbons,
  drawSkeleton,
  landmarkAttractors,
  wristEmitters,
  type DrawCtx,
} from "./effects";
import { BubbleEngine } from "./bubbles";
import { visible } from "../pose";

const PARTICLE_MODES = new Set(["particles", "embers", "aurora", "aura", "kaleido"]);

export class Compositor {
  readonly view: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly liquid = new LiquidRenderer();
  readonly particles = new ParticleEngine();
  readonly bubbles = new BubbleEngine();
  private attractors: Attractor[] = [];
  private frameCount = 0;
  private trail = 0;
  ghostAlpha = 1;
  fps = 60;
  private flow: [number, number] = [0, 0];
  private center: [number, number] = [0.5, 0.5];
  private handL: [number, number] = [0.35, 0.45];
  private handR: [number, number] = [0.65, 0.45];
  private handLv: [number, number] = [0, 0];
  private handRv: [number, number] = [0, 0];

  constructor(view: HTMLCanvasElement) {
    this.view = view;
    const ctx = view.getContext("2d", { alpha: false, desynchronized: true });
    if (!ctx) throw new Error("Could not create display canvas.");
    this.ctx = ctx;
  }

  resize(reduced = false): void {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    const dpr = Math.min(reduced ? 1 : 1.5, window.devicePixelRatio || 1);
    const maxSide = reduced ? 1280 : 1600;
    const scale = Math.min(dpr, maxSide / Math.max(w, h));
    const pw = Math.max(1, Math.round(w * scale));
    const ph = Math.max(1, Math.round(h * scale));
    if (this.view.width !== pw) this.view.width = pw;
    if (this.view.height !== ph) this.view.height = ph;
    const cssW = `${w}px`;
    const cssH = `${h}px`;
    if (this.view.style.width !== cssW) this.view.style.width = cssW;
    if (this.view.style.height !== cssH) this.view.style.height = cssH;
  }

  burst(): void {
    this.particles.burst(this.view.width / 2, this.view.height / 2, Math.min(800, this.particles.count || 800));
    this.bubbles.burst(this.view.width / 2, this.view.height / 2);
  }

  render(opts: {
    process: HTMLCanvasElement;
    frame: PoseFrame;
    settings: Settings;
    dt: number;
    time: number;
    audio: number;
    reduced: boolean;
  }): ActiveColors {
    const { process, frame, settings, dt, time, audio, reduced } = opts;
    const ctx = this.ctx;
    const w = this.view.width;
    const h = this.view.height;
    const colors = resolveColors(settings, time);
    const cover = coverFit(process.width, process.height, w, h);
    const d: DrawCtx = {
      ctx,
      w,
      h,
      cover,
      srcW: process.width,
      srcH: process.height,
      colors,
      settings,
      time,
      audio,
      frame,
    };

    this.frameCount++;
    this.updateMotion(frame);
    const fade = clamp(settings.trailFade, 0.04, 0.6);
    const traily = settings.mode === "ribbons" || settings.mode === "embers" || settings.mode === "aurora";
    const showCamera = settings.background === "camera";
    if (traily && !showCamera) {
      ctx.fillStyle = rgbCss(colors.background, fade);
      ctx.fillRect(0, 0, w, h);
      this.trail = 1;
    } else {
      ctx.fillStyle = rgbCss(colors.background, 1);
      ctx.fillRect(0, 0, w, h);
      this.trail = 0;
    }

    if (settings.background === "motion") {
      drawMotionBg(ctx, w, h, time, colors);
    }

    if (showCamera && process.width > 1) {
      ctx.save();
      ctx.globalAlpha = clamp(settings.cameraMix, 0, 1);
      ctx.drawImage(process, cover.x, cover.y, process.width * cover.scale, process.height * cover.scale);
      ctx.restore();
    }

    if (PARTICLE_MODES.has(settings.mode)) {
      const rawCount = reduced ? Math.min(900, settings.particleCount * 0.25) : settings.particleCount;
      const targetCount = settings.mode === "kaleido"
        ? Math.min(reduced ? 480 : 1400, rawCount)
        : rawCount;
      this.particles.setCount(targetCount, w, h, settings);
      const toDisplay = (x: number, y: number) => mapCover(x, y, process.width, process.height, cover);
      if (frame.mask) {
        if (settings.mode === "aura") {
          sampleEdgeGrid(frame.mask, frame.maskWidth, frame.maskHeight, toDisplay, this.attractors);
        } else {
          sampleMaskGrid(frame.mask, frame.maskWidth, frame.maskHeight, reduced ? 14 : 18, reduced ? 18 : 24, toDisplay, this.attractors);
        }
      }
      if (!frame.mask || this.attractors.length < 8) {
        landmarkAttractors(d, this.attractors);
      }
      const kind = settings.mode === "embers"
        ? "ember"
        : settings.mode === "aurora"
          ? "flow"
          : settings.mode === "aura"
            ? "aura"
            : settings.mode === "kaleido"
              ? "kaleido"
              : "body";
      if (settings.mode === "embers") {
        for (const pose of frame.poses) {
          for (const e of wristEmitters(pose, d)) {
            const spd = Math.hypot(e.vx, e.vy);
            if (spd < 16) {
              if (this.frameCount % 4 === 0) this.particles.emitFrom(e.x, e.y, e.vx * 0.2, e.vy * 0.2 - 28, settings, 1);
            } else {
              const n = spd > 48 ? 9 : 4;
              this.particles.emitFrom(e.x, e.y, e.vx * 0.35, e.vy * 0.35 - 36, settings, n);
            }
          }
        }
      }
      this.particles.step(dt, w, h, settings, this.attractors, kind, audio, time);
      const kaleido = settings.mode === "kaleido";
      const kc = kaleido
        ? mapCover(this.center[0], 1 - this.center[1], process.width, process.height, cover)
        : { x: w / 2, y: h / 2 };
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      this.particles.draw(
        ctx,
        rgbCss(colors.primary, 0.9),
        rgbCss(colors.secondary, 0.9),
        kaleido,
        w,
        h,
        kc.x,
        kc.y,
      );
      ctx.restore();
    }

    if (settings.mode === "liquid") {
      if (this.liquid.ok) {
        this.liquid.resize(process.width, process.height, reduced ? 480 : 640);
        this.liquid.render({
          mask: frame.mask,
          maskW: frame.maskWidth,
          maskH: frame.maskHeight,
          time,
          primary: n3(colors.primary),
          secondary: n3(colors.secondary),
          glowA: n3(colors.glowA),
          glowB: n3(colors.glowB),
          speed: 0.22 + settings.particleSpeed * 0.18 + audio * 0.25,
          scale: 1.05 + settings.turbulence * 0.7,
          bright: 0.95 + settings.bloom * 0.25,
          filament: 0.85 + settings.attract * 0.4,
          core: 0.22 + audio * 0.25,
          glow: 0.9 + settings.bloom * 0.45,
          audio,
          bloom: settings.bloom,
          warp: settings.turbulence,
          flow: this.flow,
          center: this.center,
          handL: this.handL,
          handR: this.handR,
          handLv: this.handLv,
          handRv: this.handRv,
          light: [
            0.42 - this.flow[0] * 6,
            0.22 - this.flow[1] * 6,
            0.82,
          ],
        });
        ctx.drawImage(
          this.liquid.canvas,
          cover.x,
          cover.y,
          process.width * cover.scale,
          process.height * cover.scale,
        );
      } else {
        drawMetaballs(d);
      }
    } else if (settings.mode === "constellation") {
      drawConstellation(d);
    } else if (settings.mode === "neon") {
      drawNeon(d);
    } else if (settings.mode === "ribbons") {
      drawRibbons(d);
    } else if (settings.mode === "pixels") {
      drawPixels(d);
    } else if (settings.mode === "bubbles") {
      this.bubbles.step(d, dt, reduced);
      this.bubbles.draw(d, reduced);
    } else if (settings.mode === "metaballs") {
      drawMetaballs(d);
    }

    drawConnector(d);

    if (settings.showSkeleton && settings.mode !== "neon" && settings.mode !== "constellation") {
      drawSkeleton(d, 0.7);
    }

    this.ghostAlpha = lerpToward(this.ghostAlpha, frame.hasPerson ? 0 : 1, dt * 2.2);
    drawFramingGhost(d, this.ghostAlpha);

    return colors;
  }

  private updateMotion(frame: PoseFrame): void {
    const pose = frame.poses[0];
    if (!pose?.landmarks.length) {
      this.flow[0] *= 0.88;
      this.flow[1] *= 0.88;
      this.handLv[0] *= 0.85;
      this.handLv[1] *= 0.85;
      this.handRv[0] *= 0.85;
      this.handRv[1] *= 0.85;
      return;
    }
    let vx = 0;
    let vy = 0;
    let cx = 0;
    let cy = 0;
    let n = 0;
    for (let i = 0; i < pose.landmarks.length; i++) {
      const lm = pose.landmarks[i];
      if (!visible(lm, VIS_MIN)) continue;
      cx += lm.x;
      cy += lm.y;
      n += 1;
      const prev = pose.prev[i];
      if (prev) {
        vx += lm.x - prev.x;
        vy += lm.y - prev.y;
      }
    }
    if (n > 0) {
      cx /= n;
      cy /= n;
      vx /= n;
      vy /= n;
      const cdx = cx - this.center[0];
      const cdy = 1 - cy - this.center[1];
      const cDist = Math.hypot(cdx, cdy);
      const cK = cDist < 0.004 ? 0.035 : cDist < 0.014 ? 0.12 : 0.26;
      this.center[0] += cdx * cK;
      this.center[1] += cdy * cK;
      const spd = Math.hypot(vx, vy);
      const gate = spd < 0.0015 ? 0 : Math.min(1, (spd - 0.0015) / 0.0035);
      vx *= gate;
      vy *= gate;
      this.flow[0] = clamp(this.flow[0] * 0.88 + vx * 0.12, -0.12, 0.12);
      this.flow[1] = clamp(this.flow[1] * 0.88 + -vy * 0.12, -0.12, 0.12);
      if (gate === 0) {
        this.flow[0] *= 0.8;
        this.flow[1] *= 0.8;
      }
    } else {
      this.flow[0] *= 0.88;
      this.flow[1] *= 0.88;
    }

    const lw = pose.landmarks[LM.leftWrist];
    const rw = pose.landmarks[LM.rightWrist];
    const lp = pose.prev[LM.leftWrist];
    const rp = pose.prev[LM.rightWrist];
    if (visible(lw, VIS_MIN)) {
      this.handL[0] = lerpToward(this.handL[0], lw.x, 0.16);
      this.handL[1] = lerpToward(this.handL[1], 1 - lw.y, 0.16);
      if (lp) {
        const hvx = lw.x - lp.x;
        const hvy = -(lw.y - lp.y);
        const hsp = Math.hypot(hvx, hvy);
        const hg = hsp < 0.0022 ? 0 : Math.min(1, (hsp - 0.0022) / 0.004);
        this.handLv[0] = this.handLv[0] * 0.78 + hvx * hg * 0.22;
        this.handLv[1] = this.handLv[1] * 0.78 + hvy * hg * 0.22;
      }
    } else {
      this.handLv[0] *= 0.85;
      this.handLv[1] *= 0.85;
    }
    if (visible(rw, VIS_MIN)) {
      this.handR[0] = lerpToward(this.handR[0], rw.x, 0.16);
      this.handR[1] = lerpToward(this.handR[1], 1 - rw.y, 0.16);
      if (rp) {
        const hvx = rw.x - rp.x;
        const hvy = -(rw.y - rp.y);
        const hsp = Math.hypot(hvx, hvy);
        const hg = hsp < 0.0022 ? 0 : Math.min(1, (hsp - 0.0022) / 0.004);
        this.handRv[0] = this.handRv[0] * 0.78 + hvx * hg * 0.22;
        this.handRv[1] = this.handRv[1] * 0.78 + hvy * hg * 0.22;
      }
    } else {
      this.handRv[0] *= 0.85;
      this.handRv[1] *= 0.85;
    }
  }
}

function n3(c: { r: number; g: number; b: number }): [number, number, number] {
  return [c.r / 255, c.g / 255, c.b / 255];
}

function lerpToward(a: number, b: number, t: number): number {
  return a + (b - a) * Math.min(1, Math.max(0, t));
}
