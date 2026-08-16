import {
  BACKGROUND_MODES,
  EFFECT_MODES,
  PALETTE_IDS,
  ROTATIONS,
  type BackgroundMode,
  type EffectMode,
  type PaletteId,
  type Rotation,
  type Settings,
} from "./types";
import { clamp } from "./math";

const STORAGE_KEY = "morph-mirror-settings-v1";

export const DEFAULT_SETTINGS: Settings = {
  deviceId: "",
  mirror: true,
  rotation: 0,
  mode: "liquid",
  palette: "aurora",
  customPrimary: "#4099FF",
  customSecondary: "#E633BF",
  customBackground: "#070A18",
  useCustomColors: false,
  particleCount: 4200,
  particleSize: 1.6,
  particleLife: 1.8,
  particleSpeed: 1,
  gravity: 0,
  turbulence: 0.45,
  trailFade: 0.22,
  attract: 0.7,
  bloom: 0.7,
  colorCycle: 0,
  cameraMix: 1,
  background: "solid",
  showSkeleton: false,
  showHud: true,
  modelQuality: "lite",
  numPoses: 2,
  frozen: false,
  gestures: true,
  audioReactive: false,
  depthColor: true,
};

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
  "customBackground",
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
  const next: Settings = { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) Object.assign(next, JSON.parse(raw) as Partial<Settings>);
  } catch {
    /* ignore */
  }
  applyUrlParams(next);
  sanitize(next);
  return next;
}

export function saveSettings(settings: Settings): void {
  try {
    const { frozen, ...rest } = settings;
    void frozen;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
  } catch {
    /* ignore */
  }
}

export function applyUrlParams(settings: Settings): void {
  const p = new URLSearchParams(location.search);
  const mode = p.get("mode");
  if (mode && isEffect(mode)) settings.mode = mode;
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
  settings.useCustomColors = false;
  switch (name) {
    case "portrait":
      settings.mode = "liquid";
      settings.palette = "ice";
      settings.cameraMix = 0.55;
      settings.bloom = 0.8;
      settings.background = "camera";
      settings.particleCount = 2800;
      break;
    case "rave":
      settings.mode = "particles";
      settings.palette = "plasma";
      settings.cameraMix = 1;
      settings.bloom = 1;
      settings.colorCycle = 1.4;
      settings.particleCount = 7000;
      settings.trailFade = 0.12;
      settings.background = "solid";
      break;
    case "installation":
      settings.mode = "aura";
      settings.palette = "aurora";
      settings.cameraMix = 1;
      settings.bloom = 0.85;
      settings.showHud = false;
      settings.background = "motion";
      settings.particleCount = 5200;
      break;
    case "ghostly":
      settings.mode = "ghost";
      settings.palette = "ghost";
      settings.cameraMix = 1;
      settings.trailFade = 0.08;
      settings.bloom = 0.5;
      settings.background = "solid";
      break;
    default:
      break;
  }
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

function sanitize(s: Settings): void {
  migrateBackground(s);
  if (!isEffect(s.mode)) s.mode = DEFAULT_SETTINGS.mode;
  if (!isPalette(s.palette)) s.palette = DEFAULT_SETTINGS.palette;
  if (!isRotation(s.rotation)) s.rotation = 0;
  s.particleCount = clamp(s.particleCount, 400, 12000);
  s.particleSize = clamp(s.particleSize, 0.4, 6);
  s.particleLife = clamp(s.particleLife, 0.3, 6);
  s.particleSpeed = clamp(s.particleSpeed, 0.1, 3);
  s.gravity = clamp(s.gravity, -2, 2);
  s.turbulence = clamp(s.turbulence, 0, 2);
  s.trailFade = clamp(s.trailFade, 0.02, 0.6);
  s.attract = clamp(s.attract, 0, 2);
  s.bloom = clamp(s.bloom, 0, 1.5);
  s.colorCycle = clamp(s.colorCycle, 0, 3);
  s.cameraMix = clamp(s.cameraMix, 0, 1);
  s.numPoses = s.numPoses === 1 ? 1 : 2;
}

export { LOOK_KEYS };
