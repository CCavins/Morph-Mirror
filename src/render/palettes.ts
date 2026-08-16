import type { PaletteId, Settings } from "../types";
import { hexToRgb, hueShift, mixRgb, type RGB } from "../math";

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
  const base = PALETTES[settings.palette];
  let primary = hexToRgb(settings.useCustomColors ? settings.customPrimary : base.primary);
  let secondary = hexToRgb(settings.useCustomColors ? settings.customSecondary : base.secondary);
  let glowA = hexToRgb(base.glowA);
  let glowB = hexToRgb(base.glowB);
  let background = hexToRgb(settings.useCustomColors ? settings.customBackground : base.background);

  if (settings.colorCycle > 0) {
    const deg = (timeSec * settings.colorCycle * 28) % 360;
    primary = hueShift(primary, deg);
    secondary = hueShift(secondary, deg + 40);
    glowA = hueShift(glowA, deg);
    glowB = hueShift(glowB, deg + 40);
  }

  return {
    primary,
    secondary,
    glowA,
    glowB,
    background,
    primaryHex: settings.useCustomColors ? settings.customPrimary : base.primary,
    secondaryHex: settings.useCustomColors ? settings.customSecondary : base.secondary,
    backgroundHex: settings.useCustomColors ? settings.customBackground : base.background,
  };
}

export function depthTint(base: RGB, z: number, enabled: boolean): RGB {
  if (!enabled) return base;
  const t = Math.max(-1, Math.min(1, -z * 3));
  const warm = { r: 255, g: 170, b: 90 };
  const cool = { r: 80, g: 140, b: 255 };
  return mixRgb(mixRgb(base, cool, Math.max(0, -t) * 0.45), warm, Math.max(0, t) * 0.45);
}
