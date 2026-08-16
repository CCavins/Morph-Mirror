import type { PaletteId, Settings } from "../types";
import { hexToRgb, hslToRgb, hueShift, mixRgb, rgbToHex, type RGB } from "../math";

export interface Palette {
  id: PaletteId;
  name: string;
  primary: string;
  secondary: string;
  glowA: string;
  glowB: string;
  background: string;
}

export const PALETTES: Record<PaletteId, Palette> = {
  aurora: {
    id: "aurora",
    name: "Aurora",
    primary: "#4099FF",
    secondary: "#E633BF",
    glowA: "#33B5FF",
    glowB: "#E24DD0",
    background: "#070A18",
  },
  ember: {
    id: "ember",
    name: "Ember",
    primary: "#FFC24D",
    secondary: "#FF3B2F",
    glowA: "#FF7A18",
    glowB: "#FF2D55",
    background: "#160806",
  },
  toxic: {
    id: "toxic",
    name: "Toxic",
    primary: "#9CFF4D",
    secondary: "#00E5A0",
    glowA: "#57FF3C",
    glowB: "#00FFC8",
    background: "#04120C",
  },
  ice: {
    id: "ice",
    name: "Ice",
    primary: "#9CE3FF",
    secondary: "#E6F7FF",
    glowA: "#6FD2FF",
    glowB: "#BFEFFF",
    background: "#0A1424",
  },
  plasma: {
    id: "plasma",
    name: "Plasma",
    primary: "#B14DFF",
    secondary: "#FF2DA0",
    glowA: "#9B5CFF",
    glowB: "#FF3DBE",
    background: "#10061C",
  },
  ghost: {
    id: "ghost",
    name: "Ghost",
    primary: "#C2CBE6",
    secondary: "#8893B5",
    glowA: "#AEB8D8",
    glowB: "#6E7799",
    background: "#070709",
  },
  gold: {
    id: "gold",
    name: "Gold",
    primary: "#FFD36A",
    secondary: "#F0A202",
    glowA: "#FFE29A",
    glowB: "#E07A3D",
    background: "#120D04",
  },
  ocean: {
    id: "ocean",
    name: "Ocean",
    primary: "#2EE6D6",
    secondary: "#2D6CFF",
    glowA: "#7AF0E6",
    glowB: "#4D8DFF",
    background: "#031018",
  },
  rainbow: {
    id: "rainbow",
    name: "Rainbow",
    primary: "#FF4D6D",
    secondary: "#4D9FFF",
    glowA: "#FFE14D",
    glowB: "#B14DFF",
    background: "#08060F",
  },
};

export interface ActiveColors {
  primary: RGB;
  secondary: RGB;
  glowA: RGB;
  glowB: RGB;
  background: RGB;
  primaryHex: string;
  secondaryHex: string;
  backgroundHex: string;
}

export function resolveColors(settings: Settings, timeSec: number): ActiveColors {
  const base = PALETTES[settings.palette] ?? PALETTES.aurora;
  const custom = settings.useCustomColors;
  let primary = hexToRgb(custom ? settings.customPrimary : base.primary);
  let secondary = hexToRgb(custom ? settings.customSecondary : base.secondary);
  let glowA = hexToRgb(custom ? settings.customGlowA : base.glowA);
  let glowB = hexToRgb(custom ? settings.customGlowB : base.glowB);
  let background = hexToRgb(custom ? settings.customBackground : base.background);

  const flowStops = custom ? customFlowStops(settings) : [];
  const rainbow = settings.palette === "rainbow" && !custom;
  const flowing = rainbow || (custom && settings.customColorFlow && flowStops.length >= 2);

  if (flowing) {
    const speed = 0.012 + settings.colorCycle * 0.038;
    const t = timeSec * speed;
    if (rainbow) {
      primary = rainbowHue(t * 360);
      secondary = rainbowHue(t * 360 + 72);
      glowA = rainbowHue(t * 360 + 28, 0.9, 0.64);
      glowB = rainbowHue(t * 360 + 118, 0.88, 0.6);
      background = mixRgb(hexToRgb(base.background), rainbowHue(t * 360 + 200, 0.35, 0.08), 0.55);
    } else {
      primary = sampleStops(flowStops, t);
      secondary = sampleStops(flowStops, t + 0.25);
      glowA = sampleStops(flowStops, t + 0.08);
      glowB = sampleStops(flowStops, t + 0.42);
    }
  } else if (settings.colorCycle > 0) {
    const deg = (timeSec * settings.colorCycle * 28) % 360;
    primary = hueShift(primary, deg);
    secondary = hueShift(secondary, deg + 40);
    glowA = hueShift(glowA, deg + 12);
    glowB = hueShift(glowB, deg + 52);
  }

  return {
    primary,
    secondary,
    glowA,
    glowB,
    background,
    primaryHex: rgbToHex(primary),
    secondaryHex: rgbToHex(secondary),
    backgroundHex: rgbToHex(background),
  };
}

function rainbowHue(deg: number, s = 0.86, l = 0.58): RGB {
  return hslToRgb({ h: ((deg % 360) + 360) % 360, s, l });
}

function customFlowStops(settings: Settings): RGB[] {
  const hexes = [
    settings.customPrimary,
    settings.customSecondary,
    settings.customGlowA,
    settings.customGlowB,
    ...(settings.customStops ?? []),
  ];
  const out: RGB[] = [];
  const seen = new Set<string>();
  for (const hex of hexes) {
    const key = hex.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hexToRgb(hex));
  }
  return out;
}

function sampleStops(stops: RGB[], t: number): RGB {
  if (stops.length === 0) return { r: 255, g: 255, b: 255 };
  if (stops.length === 1) return stops[0];
  const u = ((t % 1) + 1) % 1;
  const scaled = u * stops.length;
  const i = Math.floor(scaled);
  const f = scaled - i;
  const a = stops[i % stops.length];
  const b = stops[(i + 1) % stops.length];
  const ease = f * f * (3 - 2 * f);
  return mixRgb(a, b, ease);
}

export function depthTint(base: RGB, z: number, enabled: boolean): RGB {
  if (!enabled) return base;
  const t = Math.max(-1, Math.min(1, -z * 3));
  const warm = { r: 255, g: 170, b: 90 };
  const cool = { r: 80, g: 140, b: 255 };
  return mixRgb(mixRgb(base, cool, Math.max(0, -t) * 0.45), warm, Math.max(0, t) * 0.45);
}
