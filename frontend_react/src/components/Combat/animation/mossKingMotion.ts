export const mossKingActions = ['idle', 'move', 'attack', 'hit', 'defeat'] as const;
export type MossKingAction = typeof mossKingActions[number] | 'strike' | 'guard';
export type MossKingFacing = -1 | 1;
export interface MossKingPose {
    x: number; lift: number; rotation: number; breath: number; headY: number;
    leftStep: number; rightStep: number; hoofLift: number; headRetreat: number; legFold: number;
    blink: number; expression: 'stern' | 'attack' | 'hurt' | 'dizzy'; flash: number;
    crownPower: number; guard: number; impact: number; dust: number; heavy: boolean;
}
export const mossKingDurations: Record<MossKingAction, number> = {
    idle: Infinity, move: Infinity, attack: 2, hit: 1.1, defeat: 2.1, strike: 2.7, guard: 3.4,
};
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const ease = (n: number) => { const t = clamp(n); return t * t * (3 - 2 * t); };

/** Local presentation only. Strike and guard do not invent damage or status durations. */
export function sampleMossKingPose(action: MossKingAction, time: number, facing: MossKingFacing): MossKingPose {
    const cycle = time % 6.1;
    const pose: MossKingPose = {
        x: 0, lift: 0, rotation: 0, breath: Math.sin(time * 1.4) * .005, headY: Math.sin(time * 1.4),
        leftStep: 0, rightStep: 0, hoofLift: 0, headRetreat: 0, legFold: 1,
        blink: cycle > 5.4 && cycle < 5.6 ? .1 : 1, expression: 'stern', flash: 0,
        crownPower: .15 + Math.sin(time * 1.4) * .04, guard: 0, impact: 0, dust: 0, heavy: action === 'strike',
    };
    if (action === 'move') {
        const gait = Math.sin(time * 3.1);
        pose.x = Math.sin(time * .9) * 25;
        pose.leftStep = Math.max(0, gait) * 10; pose.rightStep = Math.max(0, -gait) * 10;
        pose.rotation = gait * .01; pose.headY = -Math.abs(gait);
        pose.dust = Math.pow(1 - Math.abs(gait), 8) * .6;
    } else if (action === 'attack' || action === 'strike') {
        const windup = action === 'strike' ? 1 : .55;
        const contact = windup + .28;
        pose.expression = 'attack';
        if (time < windup) {
            const p = ease(time / windup);
            pose.hoofLift = (pose.heavy ? 25 : 19) * p;
            pose.lift = p * 3; pose.headY = -p * 3;
            pose.rotation = -facing * p * .025;
            pose.crownPower = pose.heavy ? .15 + p * .75 : .2;
        } else if (time < contact) {
            const p = ease((time - windup) / .28);
            pose.hoofLift = (pose.heavy ? 25 : 19) * (1 - p);
            pose.lift = 3 - p * (pose.heavy ? 12 : 8);
            pose.x = facing * (pose.heavy ? 12 : 28) * p;
            pose.headY = p * 5; pose.crownPower = pose.heavy ? .9 : .2;
        } else {
            const p = ease((time - contact) / (mossKingDurations[action] - contact));
            pose.x = facing * (pose.heavy ? 12 : 28) * (1 - p);
            pose.lift = -(pose.heavy ? 10 : 5) * (1 - p); pose.headY = 5 * (1 - p);
            pose.impact = clamp((time - contact) / (pose.heavy ? 1.35 : .65));
            pose.dust = Math.sin(pose.impact * Math.PI);
            pose.crownPower = pose.heavy ? .9 - p * .75 : .2;
            if (p > .45) pose.expression = 'stern';
        }
    } else if (action === 'hit') {
        const p = clamp(time / 1.1), recoil = Math.sin(p * Math.PI) * (1 - p);
        pose.x = -facing * recoil * 9; pose.rotation = -facing * recoil * .035;
        pose.headY = recoil * 6; pose.expression = 'hurt';
        pose.flash = p < .17 ? Math.sin(p / .17 * Math.PI) * .4 : 0;
    } else if (action === 'defeat') {
        const p = ease(time / 1.8);
        pose.breath = 0; pose.lift = -30 * p; pose.headY = 22 * p;
        pose.legFold = 1 - p * .5; pose.rotation = facing * .035 * p;
        pose.expression = 'dizzy'; pose.crownPower = .15 * (1 - p); pose.blink = 1;
    } else if (action === 'guard') {
        pose.guard = ease(time / .6) * (1 - ease((time - 2.6) / .8));
        pose.headRetreat = 3 * pose.guard; pose.headY = 5 * pose.guard;
        pose.lift = -3 * pose.guard; pose.crownPower = .15 + pose.guard * .75;
    }
    return pose;
}
