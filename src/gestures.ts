import { LM, VIS_MIN, type BodyPose, type EffectMode, type PaletteId } from "./types";
import { dist } from "./math";
import { visible } from "./pose";
import { nextMode, nextPalette } from "./state";

export type GestureName = "handsUp" | "handsTogether" | "tpose";

export interface GestureEvent {
  name: GestureName;
}

const COOLDOWN = 1400;

export class GestureDetector {
  private lastFire = 0;
  private hold = new Map<GestureName, number>();

  reset(): void {
    this.lastFire = 0;
    this.hold.clear();
  }

  update(poses: BodyPose[], now: number, enabled: boolean): GestureEvent | null {
    if (!enabled || now - this.lastFire < COOLDOWN) return null;
    const pose = poses[0];
    if (!pose) return null;

    const ls = pose.landmarks[LM.leftShoulder];
    const rs = pose.landmarks[LM.rightShoulder];
    const lw = pose.landmarks[LM.leftWrist];
    const rw = pose.landmarks[LM.rightWrist];
    const le = pose.landmarks[LM.leftElbow];
    const re = pose.landmarks[LM.rightElbow];
    if (!visible(ls, VIS_MIN) || !visible(rs, VIS_MIN) || !visible(lw, VIS_MIN) || !visible(rw, VIS_MIN)) {
      this.hold.clear();
      return null;
    }

    const shoulderSpan = Math.max(0.08, dist(ls.x, ls.y, rs.x, rs.y));
    const handsUp = lw.y < ls.y - 0.12 && rw.y < rs.y - 0.12;
    const together = dist(lw.x, lw.y, rw.x, rw.y) < shoulderSpan * 0.55;
    const wristsLevel = Math.abs(lw.y - ls.y) < 0.12 && Math.abs(rw.y - rs.y) < 0.12;
    const armsOut = lw.x < ls.x - shoulderSpan * 0.55 && rw.x > rs.x + shoulderSpan * 0.55;
    const elbowsOk = !le || !re || (visible(le) && visible(re));
    const tpose = wristsLevel && armsOut && elbowsOk && !handsUp;

    const candidate: GestureName | null = together ? "handsTogether" : handsUp ? "handsUp" : tpose ? "tpose" : null;
    if (!candidate) {
      this.hold.clear();
      return null;
    }
    const started = this.hold.get(candidate) ?? now;
    this.hold.set(candidate, started);
    if (now - started < 180) return null;

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
  if (name === "handsUp") return { mode: nextMode(mode, 1), palette, burst: false };
  if (name === "tpose") return { mode, palette: nextPalette(palette, 1), burst: false };
  return { mode, palette, burst: true };
}
