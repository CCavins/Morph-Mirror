import type { Landmark } from "./types";
import { lerp } from "./math";

export class LandmarkSmoother {
  private prev: Landmark[][] = [];

  reset(): void {
    this.prev = [];
  }

  apply(poses: Landmark[][], amount = 0.32): Landmark[][] {
    while (this.prev.length < poses.length) this.prev.push([]);
    this.prev.length = poses.length;
    return poses.map((pose, pi) => {
      const last = this.prev[pi];
      const out: Landmark[] = pose.map((lm, i) => {
        const p = last[i];
        if (!p || lm.vis < 0.35) {
          return { ...lm };
        }
        const idle = Math.hypot(lm.x - p.x, lm.y - p.y) < 0.0034;
        const a = amount * (idle ? 0.1 : 1) * (0.45 + lm.vis * 0.55);
        return {
          x: lerp(p.x, lm.x, a),
          y: lerp(p.y, lm.y, a),
          z: lerp(p.z, lm.z, idle ? a * 0.5 : a),
          vis: lerp(p.vis, lm.vis, 0.35),
        };
      });
      this.prev[pi] = out;
      return out;
    });
  }
}
