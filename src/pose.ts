import { FilesetResolver, HandLandmarker, PoseLandmarker, type PoseLandmarkerResult } from "@mediapipe/tasks-vision";
import { LM, type BodyPose, type Landmark, type ModelQuality, type PoseFrame } from "./types";
import { LandmarkSmoother } from "./smooth";

const MP_VERSION = "0.10.32";
const WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const MODELS: Record<ModelQuality, string> = {
  lite: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
  full: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
};
const HAND_MODEL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const HAND_BONES: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
];

function toLandmarks(list: Array<{ x: number; y: number; z: number; visibility?: number; presence?: number }>): Landmark[] {
  return list.map((p) => ({
    x: p.x,
    y: p.y,
    z: p.z,
    vis: p.visibility ?? p.presence ?? 1,
  }));
}

export class PoseTracker {
  private landmarker: PoseLandmarker | null = null;
  private hands: HandLandmarker | null = null;
  private vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>> | null = null;
  private smoother = new LandmarkSmoother();
  private handSmoother = new LandmarkSmoother();
  private last: PoseFrame = {
    poses: [],
    mask: null,
    maskWidth: 0,
    maskHeight: 0,
    hasPerson: false,
  };
  private prevPoses: Landmark[][] = [];
  private lastHands: Landmark[][] = [];
  private maskScratch: Float32Array | null = null;
  private lastTs = -1;
  private lastDetectAt = 0;
  private lastHandAt = 0;
  private lastHandTs = 0;
  private handMiss = 0;
  private handsLoading = false;
  quality: ModelQuality = "lite";
  numPoses: 1 | 2 = 2;
  loading = false;

  async init(quality: ModelQuality, numPoses: 1 | 2): Promise<void> {
    this.loading = true;
    this.quality = quality;
    this.numPoses = numPoses;
    try {
      if (!this.vision) {
        this.vision = await FilesetResolver.forVisionTasks(WASM);
      }
      this.landmarker?.close();
      this.landmarker = await PoseLandmarker.createFromOptions(this.vision, {
        baseOptions: {
          modelAssetPath: MODELS[quality],
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numPoses,
        minPoseDetectionConfidence: 0.45,
        minPosePresenceConfidence: 0.45,
        minTrackingConfidence: 0.45,
        outputSegmentationMasks: true,
      });
      this.smoother.reset();
    } catch {
      if (!this.vision) throw new Error("Could not load MediaPipe.");
      this.landmarker?.close();
      this.landmarker = await PoseLandmarker.createFromOptions(this.vision, {
        baseOptions: {
          modelAssetPath: MODELS[quality],
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        numPoses,
        outputSegmentationMasks: true,
      });
    } finally {
      this.loading = false;
    }
    void this.initHands();
  }

  async configure(quality: ModelQuality, numPoses: 1 | 2): Promise<void> {
    if (quality === this.quality && numPoses === this.numPoses && this.landmarker) return;
    await this.init(quality, numPoses);
  }

  private async initHands(): Promise<void> {
    if (this.hands || this.handsLoading || !this.vision) return;
    this.handsLoading = true;
    try {
      this.hands = await HandLandmarker.createFromOptions(this.vision, {
        baseOptions: {
          modelAssetPath: HAND_MODEL,
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.42,
        minHandPresenceConfidence: 0.42,
        minTrackingConfidence: 0.42,
      });
    } catch {
      try {
        this.hands = await HandLandmarker.createFromOptions(this.vision, {
          baseOptions: {
            modelAssetPath: HAND_MODEL,
            delegate: "CPU",
          },
          runningMode: "VIDEO",
          numHands: 2,
        });
      } catch {
        this.hands = null;
      }
    } finally {
      this.handsLoading = false;
    }
  }

  detect(
    source: HTMLCanvasElement,
    timestampMs: number,
    minInterval = 33,
    copyMask = true,
    refineHands = false,
  ): PoseFrame {
    if (this.loading || !this.landmarker || source.width < 2) return this.last;
    if (this.lastDetectAt > 0 && timestampMs - this.lastDetectAt < minInterval) {
      return this.last;
    }
    if (timestampMs <= this.lastTs) timestampMs = this.lastTs + 1;
    this.lastTs = timestampMs;
    this.lastDetectAt = timestampMs;

    let result: PoseLandmarkerResult;
    try {
      result = this.landmarker.detectForVideo(source, timestampMs);
    } catch {
      return this.last;
    }

    const masks = result.segmentationMasks ?? [];
    try {
      const raw = (result.landmarks ?? []).map(toLandmarks);
      const smoothed = this.smoother.apply(raw);
      const poses: BodyPose[] = smoothed
        .filter(isBodyPose)
        .map((landmarks, i) => {
          const prev = this.prevPoses[i] ?? landmarks.map((l) => ({ ...l }));
          return { landmarks, prev };
        });
      this.prevPoses = poses.map((p) => p.landmarks.map((l) => ({ ...l })));

      let mask: Float32Array | null = copyMask ? null : this.last.mask;
      let maskWidth = copyMask ? 0 : this.last.maskWidth;
      let maskHeight = copyMask ? 0 : this.last.maskHeight;
      const seg = masks[0];
      if (seg && copyMask && poses.length > 0) {
        maskWidth = seg.width;
        maskHeight = seg.height;
        const data = seg.getAsFloat32Array();
        if (!this.maskScratch || this.maskScratch.length !== data.length) {
          this.maskScratch = new Float32Array(data.length);
        }
        this.maskScratch.set(data);
        mask = this.maskScratch;
        stampPoseLimbs(mask, maskWidth, maskHeight, poses);
      }

      if (refineHands && copyMask && mask && maskWidth > 8 && poses.length > 0) {
        this.updateHands(source, timestampMs, poses);
        stampHands(mask, maskWidth, maskHeight, this.lastHands, poses);
      } else if (!poses.length) {
        this.lastHands = [];
        this.handMiss = 0;
      }

      this.last = {
        poses,
        mask,
        maskWidth,
        maskHeight,
        hasPerson: personPresent(poses, mask, maskWidth, maskHeight),
      };
      return this.last;
    } finally {
      for (const m of masks) m.close();
    }
  }

  private updateHands(source: HTMLCanvasElement, timestampMs: number, poses: BodyPose[]): void {
    const wristsOn = poses.some((p) => {
      const lw = p.landmarks[LM.leftWrist];
      const rw = p.landmarks[LM.rightWrist];
      return visible(lw, 0.4) || visible(rw, 0.4);
    });
    if (!wristsOn) {
      this.handMiss += 1;
      if (this.handMiss > 5) {
        this.lastHands = [];
        this.handSmoother.reset();
      }
      return;
    }
    if (!this.hands) return;
    if (this.lastHandAt > 0 && timestampMs - this.lastHandAt < 55) return;

    let ts = timestampMs + 1;
    if (ts <= this.lastHandTs) ts = this.lastHandTs + 1;
    this.lastHandTs = ts;
    this.lastHandAt = timestampMs;

    try {
      const result = this.hands.detectForVideo(source, ts);
      const raw = (result.landmarks ?? []).map(toLandmarks);
      if (!raw.length) {
        this.handMiss += 1;
        if (this.handMiss > 5) {
          this.lastHands = [];
          this.handSmoother.reset();
        }
        return;
      }
      this.handMiss = 0;
      this.lastHands = this.handSmoother.apply(raw, 0.4);
    } catch {
      /* keep last hands */
    }
  }

  get frame(): PoseFrame {
    return this.last;
  }
}

export function visible(lm: Landmark | undefined, min = 0.45): lm is Landmark {
  return !!lm && lm.vis >= min;
}

function personPresent(
  poses: BodyPose[],
  mask: Float32Array | null,
  mw: number,
  mh: number,
): boolean {
  if (poses.length > 0) return true;
  if (!mask || mw < 8 || mh < 8) return false;
  let hits = 0;
  const step = Math.max(2, (Math.min(mw, mh) / 24) | 0);
  for (let y = 0; y < mh; y += step) {
    const row = y * mw;
    for (let x = 0; x < mw; x += step) {
      if (mask[row + x] > 0.4) {
        hits += 1;
        if (hits >= 8) return true;
      }
    }
  }
  return false;
}

function isBodyPose(landmarks: Landmark[]): boolean {
  if (landmarks.length < 25) return false;
  const ls = landmarks[LM.leftShoulder];
  const rs = landmarks[LM.rightShoulder];
  const lh = landmarks[LM.leftHip];
  const rh = landmarks[LM.rightHip];
  const shoulders = visible(ls, 0.4) && visible(rs, 0.4) && Math.hypot(ls.x - rs.x, ls.y - rs.y) > 0.06;
  const hips = visible(lh, 0.3) && visible(rh, 0.3);
  return shoulders || (hips && (visible(ls, 0.35) || visible(rs, 0.35)));
}

const ARM_CHAINS: Array<[number, number, number]> = [
  [LM.leftShoulder, LM.leftElbow, LM.leftWrist],
  [LM.rightShoulder, LM.rightElbow, LM.rightWrist],
];

function stampPoseLimbs(
  mask: Float32Array,
  mw: number,
  mh: number,
  poses: BodyPose[],
): void {
  for (const pose of poses) {
    const ls = pose.landmarks[LM.leftShoulder];
    const rs = pose.landmarks[LM.rightShoulder];
    const shoulder = visible(ls, 0.35) && visible(rs, 0.35)
      ? Math.hypot((ls.x - rs.x) * mw, (ls.y - rs.y) * mh)
      : Math.min(mw, mh) * 0.12;
    const thick = Math.max(3.5, Math.min(14, shoulder * 0.22));
    for (const [a, b, c] of ARM_CHAINS) {
      const la = pose.landmarks[a];
      const lb = pose.landmarks[b];
      const lc = pose.landmarks[c];
      if (visible(la, 0.35) && visible(lb, 0.35)) {
        stampCapsule(mask, mw, mh, la.x * mw, la.y * mh, lb.x * mw, lb.y * mh, thick);
      }
      if (visible(lb, 0.35) && visible(lc, 0.35)) {
        stampCapsule(mask, mw, mh, lb.x * mw, lb.y * mh, lc.x * mw, lc.y * mh, thick * 0.85);
        stampDisc(mask, mw, mh, lc.x * mw, lc.y * mh, thick * 0.9);
      }
    }
  }
}

function stampHands(
  mask: Float32Array,
  mw: number,
  mh: number,
  hands: Landmark[][],
  poses: BodyPose[],
): void {
  const wrists: Array<{ x: number; y: number }> = [];
  for (const pose of poses) {
    for (const idx of [LM.leftWrist, LM.rightWrist]) {
      const lm = pose.landmarks[idx];
      if (visible(lm, 0.35)) wrists.push({ x: lm.x * mw, y: lm.y * mh });
    }
  }
  if (!wrists.length) return;

  for (const hand of hands) {
    if (hand.length < 21) continue;
    const wx = hand[0].x * mw;
    const wy = hand[0].y * mh;
    let near = false;
    for (const w of wrists) {
      if (Math.hypot(wx - w.x, wy - w.y) < Math.min(mw, mh) * 0.22) {
        near = true;
        break;
      }
    }
    if (!near) continue;
    const mx = hand[9].x * mw;
    const my = hand[9].y * mh;
    const palm = Math.hypot(mx - wx, my - wy);
    if (palm < 2) continue;
    const pr = Math.max(3.2, Math.min(16, palm * 0.36));
    const fr = Math.max(1.8, Math.min(7.5, palm * 0.15));
    let px = 0;
    let py = 0;
    for (const i of [0, 5, 9, 13, 17]) {
      px += hand[i].x * mw;
      py += hand[i].y * mh;
    }
    stampDisc(mask, mw, mh, px / 5, py / 5, pr * 1.35);
    for (const [a, b] of HAND_BONES) {
      const thick = a === 0 || b === 0 || a >= 5 && a <= 17 && b >= 5 && b <= 17;
      stampCapsule(
        mask, mw, mh,
        hand[a].x * mw, hand[a].y * mh,
        hand[b].x * mw, hand[b].y * mh,
        thick ? pr * 0.72 : fr,
      );
    }
    for (const tip of [4, 8, 12, 16, 20]) {
      stampDisc(mask, mw, mh, hand[tip].x * mw, hand[tip].y * mh, fr * 1.15);
    }
  }
}

function stampDisc(mask: Float32Array, mw: number, mh: number, cx: number, cy: number, r: number): void {
  const minX = Math.max(0, (cx - r) | 0);
  const maxX = Math.min(mw - 1, (cx + r + 1) | 0);
  const minY = Math.max(0, (cy - r) | 0);
  const maxY = Math.min(mh - 1, (cy + r + 1) | 0);
  const r2 = r * r;
  for (let y = minY; y <= maxY; y++) {
    const row = y * mw;
    const dy = y + 0.5 - cy;
    for (let x = minX; x <= maxX; x++) {
      const dx = x + 0.5 - cx;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r2) continue;
      const a = 1 - d2 / r2;
      const v = a * a;
      const i = row + x;
      if (v > mask[i]) mask[i] = v;
    }
  }
}

function stampCapsule(
  mask: Float32Array,
  mw: number,
  mh: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: number,
): void {
  const minX = Math.max(0, (Math.min(x0, x1) - r) | 0);
  const maxX = Math.min(mw - 1, (Math.max(x0, x1) + r + 1) | 0);
  const minY = Math.max(0, (Math.min(y0, y1) - r) | 0);
  const maxY = Math.min(mh - 1, (Math.max(y0, y1) + r + 1) | 0);
  const sx = x1 - x0;
  const sy = y1 - y0;
  const len2 = sx * sx + sy * sy || 1;
  const r2 = r * r;
  for (let y = minY; y <= maxY; y++) {
    const row = y * mw;
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5 - x0;
      const py = y + 0.5 - y0;
      let t = (px * sx + py * sy) / len2;
      if (t < 0) t = 0;
      else if (t > 1) t = 1;
      const dx = px - sx * t;
      const dy = py - sy * t;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r2) continue;
      const a = 1 - d2 / r2;
      const v = a * a;
      const i = row + x;
      if (v > mask[i]) mask[i] = v;
    }
  }
}
