export const EFFECT_MODES = [
  "liquid",
  "particles",
  "constellation",
  "neon",
  "ribbons",
  "embers",
  "aurora",
  "aura",
  "kaleido",
  "pixels",
  "bubbles",
  "metaballs",
] as const;

export type EffectMode = (typeof EFFECT_MODES)[number];

export const PALETTE_IDS = [
  "aurora",
  "ember",
  "toxic",
  "ice",
  "plasma",
  "ghost",
  "gold",
  "ocean",
] as const;

export type PaletteId = (typeof PALETTE_IDS)[number];

export const LOOK_PRESETS = ["portrait", "rave", "installation", "ghostly"] as const;
export type LookPreset = (typeof LOOK_PRESETS)[number];

export const BACKGROUND_MODES = ["solid", "motion", "camera"] as const;
export type BackgroundMode = (typeof BACKGROUND_MODES)[number];

export const BACKGROUND_LABELS: Record<BackgroundMode, string> = {
  solid: "Solid color",
  motion: "Motion graphic",
  camera: "Camera feed",
};

export const MODEL_QUALITIES = ["lite", "full"] as const;
export type ModelQuality = (typeof MODEL_QUALITIES)[number];

export const ROTATIONS = [0, 90, 180, 270] as const;
export type Rotation = (typeof ROTATIONS)[number];

export interface Landmark {
  x: number;
  y: number;
  z: number;
  vis: number;
}

export interface BodyPose {
  landmarks: Landmark[];
  prev: Landmark[];
}

export interface PoseFrame {
  poses: BodyPose[];
  mask: Float32Array | null;
  maskWidth: number;
  maskHeight: number;
  hasPerson: boolean;
}

export interface EffectLook {
  palette: PaletteId;
  customPrimary: string;
  customSecondary: string;
  customBackground: string;
  useCustomColors: boolean;
  particleCount: number;
  particleSize: number;
  particleLife: number;
  particleSpeed: number;
  gravity: number;
  turbulence: number;
  trailFade: number;
  attract: number;
  bloom: number;
  colorCycle: number;
  showSkeleton: boolean;
  depthColor: boolean;
}

export const EFFECT_LOOK_KEYS = [
  "palette",
  "customPrimary",
  "customSecondary",
  "customBackground",
  "useCustomColors",
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
  "showSkeleton",
  "depthColor",
] as const satisfies ReadonlyArray<keyof EffectLook>;

export interface Settings extends EffectLook {
  deviceId: string;
  mirror: boolean;
  rotation: Rotation;
  mode: EffectMode;
  cameraMix: number;
  background: BackgroundMode;
  showHud: boolean;
  modelQuality: ModelQuality;
  numPoses: 1 | 2;
  frozen: boolean;
  gestures: boolean;
  audioReactive: boolean;
  autoRotate: boolean;
  autoRotateSeconds: number;
  effectLooks: Record<EffectMode, EffectLook>;
}

export const EFFECT_LABELS: Record<EffectMode, string> = {
  liquid: "Liquid Body",
  particles: "Particle Body",
  constellation: "Constellation",
  neon: "Neon Bones",
  ribbons: "Ribbon Trails",
  embers: "Ember Hands",
  aurora: "Aurora Flow",
  aura: "Aura Edge",
  kaleido: "Kaleido",
  pixels: "Pixel Morph",
  bubbles: "Bubbles",
  metaballs: "Metaballs",
};

export const POSE_CONNECTIONS: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 7],
  [0, 4], [4, 5], [5, 6], [6, 8],
  [9, 10],
  [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [27, 29], [27, 31], [29, 31],
  [24, 26], [26, 28], [28, 30], [28, 32], [30, 32],
];

export const LM = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftIndex: 19,
  rightIndex: 20,
} as const;

export const RIBBON_JOINTS = [0, 13, 14, 15, 16, 27, 28] as const;

export const VIS_MIN = 0.45;
