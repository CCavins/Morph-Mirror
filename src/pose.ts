import { FilesetResolver, PoseLandmarker, type PoseLandmarkerResult } from "@mediapipe/tasks-vision";
import type { BodyPose, Landmark, ModelQuality, PoseFrame } from "./types";
import { LandmarkSmoother } from "./smooth";

const MP_VERSION = "0.10.32";
const WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const MODELS: Record<ModelQuality, string> = {
  lite: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
  full: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
};

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
  private vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>> | null = null;
  private smoother = new LandmarkSmoother();
  private last: PoseFrame = {
    poses: [],
    mask: null,
    maskWidth: 0,
    maskHeight: 0,
    hasPerson: false,
  };
  private prevPoses: Landmark[][] = [];
  private maskScratch: Float32Array | null = null;
  private lastTs = -1;
  private lastDetectAt = 0;
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
  }

  async configure(quality: ModelQuality, numPoses: 1 | 2): Promise<void> {
    if (quality === this.quality && numPoses === this.numPoses && this.landmarker) return;
    await this.init(quality, numPoses);
  }

  detect(source: HTMLCanvasElement, timestampMs: number, minInterval = 33, copyMask = true): PoseFrame {
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
      const poses: BodyPose[] = smoothed.map((landmarks, i) => {
        const prev = this.prevPoses[i] ?? landmarks.map((l) => ({ ...l }));
        return { landmarks, prev };
      });
      this.prevPoses = smoothed.map((p) => p.map((l) => ({ ...l })));

      let mask: Float32Array | null = copyMask ? null : this.last.mask;
      let maskWidth = copyMask ? 0 : this.last.maskWidth;
      let maskHeight = copyMask ? 0 : this.last.maskHeight;
      const seg = masks[0];
      if (seg && copyMask) {
        maskWidth = seg.width;
        maskHeight = seg.height;
        const data = seg.getAsFloat32Array();
        if (!this.maskScratch || this.maskScratch.length !== data.length) {
          this.maskScratch = new Float32Array(data.length);
        }
        this.maskScratch.set(data);
        mask = this.maskScratch;
      }

      this.last = {
        poses,
        mask,
        maskWidth,
        maskHeight,
        hasPerson: poses.some((p) => p.landmarks.some((l) => l.vis > 0.5)),
      };
      return this.last;
    } finally {
      for (const m of masks) m.close();
    }
  }

  get frame(): PoseFrame {
    return this.last;
  }
}

export function visible(lm: Landmark | undefined, min = 0.45): lm is Landmark {
  return !!lm && lm.vis >= min;
}
