import { LM, VIS_MIN, type BodyPose, type EffectMode, type PaletteId } from "./types";
import { dist } from "./math";
import { visible } from "./pose";
import { nextPalette } from "./state";

export type GestureName = "handsTogether" | "tpose";

export interface GestureEvent {
  name: GestureName;
}

const COOLDOWN = 2000;
const HOLD_MS = 500;
const STRONG_VIS = 0.62;

export class GestureDetector {
  private lastFire = 0;
  private hold = new Map<GestureName, number>();

  reset(): void {
    this.lastFire = 0;
    this.hold.clear();
  }

  update(poses: BodyPose[], now: number, enabled: boolean): GestureEvent | null {
    if (!enabled) {
      this.hold.clear();
      return null;
    }
    if (now - this.lastFire < COOLDOWN) return null;
    const pose = poses[0];
    if (!pose) {
      this.hold.clear();
      return null;
    }

    const ls = pose.landmarks[LM.leftShoulder];
    const rs = pose.landmarks[LM.rightShoulder];
    const lw = pose.landmarks[LM.leftWrist];
    const rw = pose.landmarks[LM.rightWrist];
    const le = pose.landmarks[LM.leftElbow];
    const re = pose.landmarks[LM.rightElbow];
    const nose = pose.landmarks[LM.nose];
    if (
      !visible(ls, STRONG_VIS) || !visible(rs, STRONG_VIS) ||
      !visible(lw, STRONG_VIS) || !visible(rw, STRONG_VIS) ||
      !visible(le, VIS_MIN) || !visible(re, VIS_MIN)
    ) {
      this.hold.clear();
      return null;
    }

    const shoulderSpan = Math.max(0.08, dist(ls.x, ls.y, rs.x, rs.y));
    const headY = visible(nose, VIS_MIN) ? nose.y : Math.min(ls.y, rs.y) - 0.14;
    const together =
      dist(lw.x, lw.y, rw.x, rw.y) < shoulderSpan * 0.4 &&
      lw.y > headY && rw.y > headY;
    const wristsLevel = Math.abs(lw.y - ls.y) < 0.09 && Math.abs(rw.y - rs.y) < 0.09;
    const armsOut = lw.x < ls.x - shoulderSpan * 0.7 && rw.x > rs.x + shoulderSpan * 0.7;
    const tpose = wristsLevel && armsOut;

    const candidate: GestureName | null = together ? "handsTogether" : tpose ? "tpose" : null;
    if (!candidate) {
      this.hold.clear();
      return null;
    }
    if (this.hold.size && !this.hold.has(candidate)) this.hold.clear();
    const started = this.hold.get(candidate) ?? now;
    this.hold.set(candidate, started);
    if (now - started < HOLD_MS) return null;

    this.lastFire = now;
    this.hold.clear();
    return { name: candidate };
  }
}

export function applyGesture(
  name: GestureName,
  mode: EffectMode,
  palette: PaletteId,
): { mode: EffectMode; palette: PaletteId; burst: boolean } {
  if (name === "tpose") return { mode, palette: nextPalette(palette, 1), burst: false };
  return { mode, palette, burst: true };
}
