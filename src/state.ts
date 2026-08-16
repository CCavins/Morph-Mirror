import {
  BACKGROUND_MODES,
  EFFECT_LOOK_KEYS,
  EFFECT_MODES,
  PALETTE_IDS,
  ROTATIONS,
  type BackgroundMode,
  type EffectLook,
  type EffectMode,
  type PaletteId,
  type Rotation,
  type Settings,
} from "./types";
import { clamp } from "./math";

const STORAGE_KEY = "morph-mirror-settings-v1";

export const BASE_EFFECT_LOOK: EffectLook = {
  palette: "aurora",
  customPrimary: "#4099FF",
  customSecondary: "#E633BF",
  customGlowA: "#33B5FF",
  customGlowB: "#E24DD0",
  customBackground: "#070A18",
  customStops: [],
  customColorFlow: false,
  useCustomColors: false,
  particleCount: 2800,
  particleSize: 1.6,
  particleLife: 1.8,
  particleSpeed: 1,
  gravity: 0,
  turbulence: 0.45,
  trailFade: 0.22,
  attract: 0.7,
  bloom: 0.7,
  colorCycle: 0,
  showSkeleton: false,
  depthColor: true,
};

export function emptyLooks(): Record<EffectMode, EffectLook> {
  const looks = Object.fromEntries(
    EFFECT_MODES.map((m) => [m, { ...BASE_EFFECT_LOOK, customStops: [] as string[] }]),
  ) as Record<EffectMode, EffectLook>;
  Object.assign(looks.liquid, { palette: "aurora", bloom: 0.85, turbulence: 0.4, particleSpeed: 1 });
  Object.assign(looks.particles, { palette: "aurora", particleCount: 3400, attract: 0.9 });
  Object.assign(looks.constellation, { palette: "gold", bloom: 0.9, depthColor: true });
  Object.assign(looks.neon, { palette: "plasma", bloom: 1.15, depthColor: true });
  Object.assign(looks.ribbons, { palette: "ocean", particleSize: 2.2, trailFade: 0.18, depthColor: true });
  Object.assign(looks.embers, {
    palette: "ember",
    particleCount: 2200,
    particleLife: 1.15,
    gravity: -0.25,
    particleSpeed: 1.15,
    trailFade: 0.14,
  });
  Object.assign(looks.aurora, {
    palette: "aurora",
    particleCount: 3000,
    turbulence: 0.9,
    trailFade: 0.16,
    attract: 0.55,
    particleSpeed: 0.8,
  });
  Object.assign(looks.aura, { palette: "ghost", particleCount: 4000, attract: 1.15, particleSize: 1.3, turbulence: 0.25 });
  Object.assign(looks.pixels, { palette: "toxic", turbulence: 0.35 });
  Object.assign(looks.bubbles, {
    palette: "ice",
    particleSize: 2.4,
    bloom: 0.8,
    attract: 1.25,
    turbulence: 0.12,
    particleSpeed: 0.55,
  });
  Object.assign(looks.metaballs, { palette: "ocean", particleSize: 2.2, bloom: 0.7, depthColor: true });
  return looks;
}

export function captureLook(settings: Settings): EffectLook {
  const look = { ...BASE_EFFECT_LOOK };
  for (const key of EFFECT_LOOK_KEYS) look[key] = settings[key] as never;
  look.customStops = [...(settings.customStops ?? [])];
  return look;
}

export function applyLook(settings: Settings, look: EffectLook): void {
  Object.assign(settings, look);
}

export function setMode(settings: Settings, mode: EffectMode): boolean {
  if (!isEffect(mode) || mode === settings.mode) return false;
  settings.effectLooks[settings.mode] = captureLook(settings);
  settings.mode = mode;
  applyLook(settings, settings.effectLooks[mode] ?? BASE_EFFECT_LOOK);
  return true;
}

export function defaultSettings(): Settings {
  const effectLooks = emptyLooks();
  return {
    deviceId: "",
    mirror: true,
    rotation: 0,
    mode: "liquid",
    ...effectLooks.liquid,
    cameraMix: 1,
    background: "solid",
    showHud: true,
    modelQuality: "lite",
    numPoses: 2,
    frozen: false,
    gestures: true,
    audioReactive: false,
    autoRotate: false,
    autoRotateSeconds: 12,
    effectLooks,
  };
}

export const DEFAULT_SETTINGS: Settings = defaultSettings();

const LOOK_KEYS: Array<keyof Settings> = [
  "mode",
  "palette",
  "mirror",
  "rotation",
  "particleCount",
  "particleSize",
  "particleLife",
  "particleSpeed",
  "gravity",
  "turbulence",
  "trailFade",
  "attract",
  "bloom",
  "colorCycle",
  "cameraMix",
  "background",
  "showSkeleton",
  "modelQuality",
  "numPoses",
  "useCustomColors",
  "customPrimary",
  "customSecondary",
  "customGlowA",
  "customGlowB",
  "customBackground",
  "customColorFlow",
  "depthColor",
  "gestures",
];

function isEffect(v: string): v is EffectMode {
  return (EFFECT_MODES as readonly string[]).includes(v);
}

function isPalette(v: string): v is PaletteId {
  return (PALETTE_IDS as readonly string[]).includes(v);
}

function isRotation(v: number): v is Rotation {
  return (ROTATIONS as readonly number[]).includes(v);
}

function parseBool(v: string | null, fallback: boolean): boolean {
  if (v === null) return fallback;
  return v === "1" || v === "true";
}

export function loadSettings(): Settings {
  const next = defaultSettings();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) Object.assign(next, JSON.parse(raw) as Partial<Settings>);
  } catch {
    /* ignore */
  }
  next.effectLooks = mergeLooks(next.effectLooks);
  if ((next.mode as string) === "ghost") next.mode = "bubbles";
  if (isEffect(next.mode)) {
    next.effectLooks[next.mode] = { ...next.effectLooks[next.mode], ...captureLook(next) };
  }
  applyUrlParams(next);
  sanitize(next);
  next.effectLooks[next.mode] = captureLook(next);
  return next;
}

export function saveSettings(settings: Settings): void {
  try {
    settings.effectLooks[settings.mode] = captureLook(settings);
    const { frozen, ...rest } = settings;
    void frozen;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
  } catch {
    /* ignore */
  }
}

export function applyUrlParams(settings: Settings): void {
  const p = new URLSearchParams(location.search);
  const mode = p.get("mode") === "ghost" ? "bubbles" : p.get("mode");
  if (mode && isEffect(mode)) setMode(settings, mode);
  const palette = p.get("palette");
  if (palette && isPalette(palette)) settings.palette = palette;
  if (p.has("mirror")) settings.mirror = parseBool(p.get("mirror"), settings.mirror);
  const rot = Number(p.get("rotation"));
  if (Number.isFinite(rot) && isRotation(rot)) settings.rotation = rot;
  const count = Number(p.get("particles"));
  if (Number.isFinite(count)) settings.particleCount = count;
  const mix = Number(p.get("mix"));
  if (Number.isFinite(mix)) settings.cameraMix = mix;
  const bg = p.get("bg");
  if (bg && isBackground(bg)) settings.background = bg;
  const quality = p.get("quality");
  if (quality === "lite" || quality === "full") settings.modelQuality = quality;
  const poses = Number(p.get("poses"));
  if (poses === 1 || poses === 2) settings.numPoses = poses;
  const look = p.get("look");
  if (look) applyLookPreset(settings, look);
}

export function lookUrl(settings: Settings): string {
  const p = new URLSearchParams();
  p.set("mode", settings.mode);
  p.set("palette", settings.palette);
  p.set("mirror", settings.mirror ? "1" : "0");
  p.set("rotation", String(settings.rotation));
  p.set("particles", String(Math.round(settings.particleCount)));
  p.set("mix", String(settings.cameraMix));
  p.set("bg", settings.background);
  p.set("quality", settings.modelQuality);
  p.set("poses", String(settings.numPoses));
  const url = new URL(location.href);
  url.search = p.toString();
  url.hash = "";
  return url.toString();
}

export function applyLookPreset(settings: Settings, name: string): void {
  switch (name) {
    case "portrait":
      setMode(settings, "liquid");
      settings.useCustomColors = false;
      settings.palette = "ice";
      settings.cameraMix = 0.55;
      settings.bloom = 0.8;
      settings.background = "camera";
      settings.particleCount = 2800;
      break;
    case "rave":
      setMode(settings, "particles");
      settings.useCustomColors = false;
      settings.palette = "plasma";
      settings.cameraMix = 1;
      settings.bloom = 1;
      settings.colorCycle = 1.4;
      settings.particleCount = 7000;
      settings.trailFade = 0.12;
      settings.background = "solid";
      break;
    case "installation":
      setMode(settings, "aura");
      settings.useCustomColors = false;
      settings.palette = "aurora";
      settings.cameraMix = 1;
      settings.bloom = 0.85;
      settings.showHud = false;
      settings.background = "motion";
      settings.particleCount = 5200;
      break;
    case "ghostly":
      setMode(settings, "bubbles");
      settings.useCustomColors = false;
      settings.palette = "ice";
      settings.cameraMix = 1;
      settings.trailFade = 0.08;
      settings.bloom = 0.8;
      settings.particleSize = 2.4;
      settings.attract = 1.25;
      settings.turbulence = 0.12;
      settings.background = "solid";
      break;
    default:
      return;
  }
  settings.effectLooks[settings.mode] = captureLook(settings);
}

export function nextMode(current: EffectMode, dir: 1 | -1): EffectMode {
  const i = EFFECT_MODES.indexOf(current);
  return EFFECT_MODES[(i + dir + EFFECT_MODES.length) % EFFECT_MODES.length];
}

export function nextPalette(current: PaletteId, dir: 1 | -1): PaletteId {
  const i = PALETTE_IDS.indexOf(current);
  return PALETTE_IDS[(i + dir + PALETTE_IDS.length) % PALETTE_IDS.length];
}

export function nextRotation(current: Rotation): Rotation {
  const i = ROTATIONS.indexOf(current);
  return ROTATIONS[(i + 1) % ROTATIONS.length];
}

export function nextBackground(current: BackgroundMode, dir: 1 | -1 = 1): BackgroundMode {
  const i = BACKGROUND_MODES.indexOf(current);
  return BACKGROUND_MODES[(i + dir + BACKGROUND_MODES.length) % BACKGROUND_MODES.length];
}

function isBackground(v: string): v is BackgroundMode {
  return (BACKGROUND_MODES as readonly string[]).includes(v);
}

function migrateBackground(s: Settings): void {
  const bg = s.background as string;
  if (bg === "void") s.background = "solid";
  else if (bg === "dim") {
    s.background = "camera";
    if (s.cameraMix < 0.25) s.cameraMix = 0.5;
  } else if (bg === "stars") s.background = "motion";
  else if (!isBackground(bg)) s.background = DEFAULT_SETTINGS.background;
}

function mergeLooks(raw: unknown): Record<EffectMode, EffectLook> {
  const out = emptyLooks();
  if (!raw || typeof raw !== "object") return out;
  const src = raw as Record<string, Partial<EffectLook>>;
  if (src.ghost && !src.bubbles) src.bubbles = src.ghost;
  for (const mode of EFFECT_MODES) {
    const look = src[mode];
    if (look && typeof look === "object") Object.assign(out[mode], look);
    sanitizeLook(out[mode]);
  }
  return out;
}

function sanitizeLook(look: EffectLook): void {
  if (!isPalette(look.palette)) look.palette = BASE_EFFECT_LOOK.palette;
  look.particleCount = clamp(look.particleCount, 400, 8000);
  look.particleSize = clamp(look.particleSize, 0.4, 6);
  look.particleLife = clamp(look.particleLife, 0.3, 6);
  look.particleSpeed = clamp(look.particleSpeed, 0.1, 3);
  look.gravity = clamp(look.gravity, -2, 2);
  look.turbulence = clamp(look.turbulence, 0, 2);
  look.trailFade = clamp(look.trailFade, 0.02, 0.6);
  look.attract = clamp(look.attract, 0, 2);
  look.bloom = clamp(look.bloom, 0, 1.5);
  look.colorCycle = clamp(look.colorCycle, 0, 3);
  look.useCustomColors = !!look.useCustomColors;
  look.customColorFlow = !!look.customColorFlow;
  look.showSkeleton = !!look.showSkeleton;
  look.depthColor = !!look.depthColor;
  look.customPrimary = sanitizeHex(look.customPrimary, BASE_EFFECT_LOOK.customPrimary);
  look.customSecondary = sanitizeHex(look.customSecondary, BASE_EFFECT_LOOK.customSecondary);
  look.customGlowA = sanitizeHex(look.customGlowA, BASE_EFFECT_LOOK.customGlowA);
  look.customGlowB = sanitizeHex(look.customGlowB, BASE_EFFECT_LOOK.customGlowB);
  look.customBackground = sanitizeHex(look.customBackground, BASE_EFFECT_LOOK.customBackground);
  look.customStops = sanitizeStops(look.customStops);
}

function sanitizeHex(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const m = value.trim().match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!m) return fallback;
  const h = m[1];
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return `#${full.toLowerCase()}`;
}

function sanitizeStops(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const hex = sanitizeHex(item, "");
    if (hex) out.push(hex);
    if (out.length >= 6) break;
  }
  return out;
}

function sanitize(s: Settings): void {
  migrateBackground(s);
  if ((s.mode as string) === "ghost") s.mode = "bubbles";
  if ((s.mode as string) === "kaleido") s.mode = "liquid";
  if (!isEffect(s.mode)) s.mode = "liquid";
  if (!isPalette(s.palette)) s.palette = BASE_EFFECT_LOOK.palette;
  if (!isRotation(s.rotation)) s.rotation = 0;
  s.effectLooks = mergeLooks(s.effectLooks);
  sanitizeLook(s);
  s.cameraMix = clamp(s.cameraMix, 0, 1);
  s.numPoses = s.numPoses === 1 ? 1 : 2;
  s.autoRotate = !!s.autoRotate;
  s.autoRotateSeconds = clamp(s.autoRotateSeconds || 12, 3, 120);
}

export { LOOK_KEYS };
