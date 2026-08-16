import type { PoseFrame, Settings } from "../types";
import { clamp, coverFit, mapCover, rgbCss } from "../math";
import { resolveColors, type ActiveColors } from "./palettes";
import { LiquidRenderer } from "./liquid";
import { ParticleEngine, sampleEdgePoints, sampleMaskPoints, type Attractor } from "./particles";
import {
  drawConnector,
  drawConstellation,
  drawFramingGhost,
  drawGhost,
  drawMetaballs,
  drawNeon,
  drawPixels,
  drawRibbons,
  drawSkeleton,
  drawStars,
  landmarkAttractors,
  wristEmitters,
  type DrawCtx,
} from "./effects";

export class Compositor {
  readonly view: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly liquid = new LiquidRenderer();
  readonly particles = new ParticleEngine();
  private attractors: Attractor[] = [];
  private frameCount = 0;
  private trail = 0;
  ghostAlpha = 1;
  fps = 60;

  constructor(view: HTMLCanvasElement) {
    this.view = view;
    const ctx = view.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Could not create display canvas.");
    this.ctx = ctx;
  }

  resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    const pw = Math.round(w * dpr);
    const ph = Math.round(h * dpr);
    if (this.view.width !== pw) this.view.width = pw;
    if (this.view.height !== ph) this.view.height = ph;
    this.view.style.width = `${w}px`;
    this.view.style.height = `${h}px`;
  }

  burst(): void {
    this.particles.burst(this.view.width / 2, this.view.height / 2, Math.min(800, this.particles.count || 800));
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
    const fade = clamp(settings.trailFade, 0.04, 0.6);
    const traily = settings.mode === "ribbons" || settings.mode === "ghost" || settings.mode === "embers" || settings.mode === "aurora";
    if (traily) {
      ctx.fillStyle = rgbCss(colors.background, fade);
      ctx.fillRect(0, 0, w, h);
      this.trail = 1;
    } else {
      ctx.fillStyle = rgbCss(colors.background, 1);
      ctx.fillRect(0, 0, w, h);
      this.trail = 0;
    }

    if (settings.background === "stars") {
      drawStars(ctx, w, h, time, rgbCss(colors.glowA, 0.8));
    }

    if (settings.cameraMix > 0.01 && process.width > 1) {
      ctx.save();
      ctx.globalAlpha = settings.cameraMix;
      ctx.drawImage(process, cover.x, cover.y, process.width * cover.scale, process.height * cover.scale);
      ctx.restore();
    }

    const targetCount = reduced ? Math.min(900, settings.particleCount * 0.25) : settings.particleCount;
    this.particles.setCount(targetCount, w, h, settings);

    const toDisplay = (x: number, y: number) => mapCover(x, y, process.width, process.height, cover);
    if (this.frameCount % 4 === 0 && frame.mask) {
      if (settings.mode === "aura") {
        sampleEdgePoints(frame.mask, frame.maskWidth, frame.maskHeight, 220, toDisplay, this.attractors);
      } else {
        sampleMaskPoints(frame.mask, frame.maskWidth, frame.maskHeight, 260, toDisplay, this.attractors);
      }
    }
    if (!frame.mask || this.attractors.length < 8) {
      this.attractors = landmarkAttractors(d);
    }

    const particleModes = new Set(["particles", "embers", "aurora", "aura", "kaleido"]);
    if (particleModes.has(settings.mode)) {
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
            const n = spd > 12 ? 10 : 3;
            this.particles.emitFrom(e.x, e.y, e.vx * 0.4, e.vy * 0.4 - 40, settings, n);
          }
        }
      }
      this.particles.step(dt, w, h, settings, this.attractors, kind, audio);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      this.particles.draw(
        ctx,
        rgbCss(colors.primary, 0.9),
        rgbCss(colors.secondary, 0.9),
        settings.mode === "kaleido",
        w,
        h,
      );
      ctx.restore();
    }

    if (settings.mode === "liquid") {
      if (this.liquid.ok) {
        this.liquid.resize(Math.max(2, process.width), Math.max(2, process.height));
        this.liquid.render({
          mask: frame.mask,
          maskW: frame.maskWidth,
          maskH: frame.maskHeight,
          time,
          primary: n3(colors.primary),
          secondary: n3(colors.secondary),
          glowA: n3(colors.glowA),
          glowB: n3(colors.glowB),
          bg: n3(colors.background),
          speed: 0.45 + settings.particleSpeed * 0.35 + audio * 0.6,
          scale: 1.8 + settings.turbulence * 1.4,
          bright: 0.9 + settings.bloom * 0.4,
          filament: 1.1 + settings.attract,
          core: 0.28 + audio * 0.4,
          glow: 0.7 + settings.bloom * 0.5,
          audio,
          bloom: settings.bloom,
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
    } else if (settings.mode === "ghost") {
      drawGhost(d, process);
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
}

function n3(c: { r: number; g: number; b: number }): [number, number, number] {
  return [c.r / 255, c.g / 255, c.b / 255];
}

function lerpToward(a: number, b: number, t: number): number {
  return a + (b - a) * Math.min(1, Math.max(0, t));
}
