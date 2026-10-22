import type {CavePose} from './caveTypes';
const clamp = (n:number) => Math.max(0,Math.min(1,n));
export function kingSourcePoint(x: number,y: number,pose: Partial<CavePose>,time: number) {
        const legWeight = clamp((y - 78) / 40);
        const frontWeight = 1 - clamp((x - 60) / 20);
        const lift = (pose.foreLift || 0) * frontWeight * legWeight;
        const step = Math.sin((pose.elapsed || 0) * 8 + x * .16) * (pose.walk || 0);
        const sx = x - step * legWeight * 1.4;
        let sy = y + lift + Math.max(0, step) * legWeight * 1.5;
        if (x > 34 && x < 60 && y < 29) sy -= Math.sin(time * 2.4) * 1;
    return [sx,sy];
  }
