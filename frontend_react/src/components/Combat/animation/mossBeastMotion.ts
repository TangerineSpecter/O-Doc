export const mossBeastActions = ['idle', 'move', 'attack', 'hit', 'defeat'] as const;
export type MossBeastAction = typeof mossBeastActions[number] | 'guard';
export type MossBeastFacing = -1 | 1;
export interface MossBeastPose {
    x: number; lift: number; rotation: number; breath: number;
    leftStep: number; rightStep: number; legFold: number; headY: number; armorClose: number;
    blink: number; expression: 'stern' | 'attack' | 'hurt' | 'dizzy'; flash: number;
    guard: number; impact: number; dust: number;
}
export const mossBeastDurations: Record<MossBeastAction, number> = {
    idle: Infinity, move: Infinity, attack: 1.8, hit: .9, defeat: 1.6, guard: 3.2,
};
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const ease = (n: number) => { const t = clamp(n); return t * t * (3 - 2 * t); };

/** Display poses only; guard never computes damage reduction or its combat duration. */
export function sampleMossBeastPose(action: MossBeastAction, time: number, facing: MossBeastFacing): MossBeastPose {
    const cycle = time % 5.2;
    const pose: MossBeastPose = {
        x: 0, lift: 0, rotation: 0, breath: Math.sin(time * 1.8) * .007,
        leftStep: 0, rightStep: 0, legFold: 1, headY: Math.sin(time * 1.8) * 1.2, armorClose: 0,
        blink: cycle > 4.6 && cycle < 4.76 ? .12 : 1,
        expression: 'stern', flash: 0, guard: 0, impact: 0, dust: 0,
    };
    if (action === 'move') {
        const gait = Math.sin(time * 6.6);
        pose.x = Math.sin(time * 1.2) * 58;
        pose.leftStep = Math.max(0, gait) * 13;
        pose.rightStep = Math.max(0, -gait) * 13;
        pose.lift = Math.abs(gait) * 2;
        pose.rotation = gait * .015;
        pose.headY = -Math.abs(gait) * 2;
        pose.dust = Math.pow(1 - Math.abs(gait), 6) * .5;
    } else if (action === 'attack') {
        pose.expression = 'attack';
        if (time < .48) {
            const p = ease(time / .48);
            pose.x = -18 * p * facing;
            pose.headY = 7 * p;
            pose.armorClose = 4 * p;
            pose.lift = -4 * p;
        } else if (time < .82) {
            const p = ease((time - .48) / .34);
            pose.x = (-18 + 128 * p) * facing;
            pose.lift = Math.sin(p * Math.PI) * 14;
            pose.headY = 7;
            pose.rotation = .07 * Math.sin(p * Math.PI) * facing;
            pose.leftStep = Math.sin(p * Math.PI) * 9;
            pose.rightStep = pose.leftStep;
        } else {
            const p = ease((time - .82) / .98);
            pose.x = 110 * (1 - p) * facing;
            pose.headY = 7 * (1 - p);
            pose.lift = -Math.sin(clamp((time - .82) / .24) * Math.PI) * 5;
            pose.impact = clamp((time - .82) / .65);
            pose.dust = Math.sin(pose.impact * Math.PI);
            pose.expression = p > .5 ? 'stern' : 'attack';
        }
    } else if (action === 'hit') {
        const p = clamp(time / .9), recoil = Math.sin(p * Math.PI) * (1 - p);
        pose.x = -facing * recoil * 22;
        pose.rotation = -facing * recoil * .09;
        pose.headY = recoil * 9;
        pose.expression = 'hurt';
        pose.flash = p < .2 ? Math.sin(p / .2 * Math.PI) * .5 : 0;
    } else if (action === 'defeat') {
        const p = ease(time / 1.3);
        pose.breath = 0;
        pose.lift = -16 * p;
        pose.rotation = facing * .07 * p;
        pose.legFold = 1 - p * .55;
        pose.headY = 14 * p;
        pose.armorClose = 5 * p;
        pose.expression = 'dizzy';
        pose.blink = 1;
    } else if (action === 'guard') {
        const enter = ease(time / .55), leave = 1 - ease((time - 2.45) / .75);
        pose.guard = enter * leave;
        pose.armorClose = pose.guard * 9;
        pose.headY = pose.guard * 8;
        pose.lift = -pose.guard * 4;
        pose.breath *= .3;
    }
    return pose;
}
