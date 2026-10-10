export const playerActions = ['idle', 'move', 'cast', 'hit', 'defeat'] as const;
export type PlayerAction = typeof playerActions[number];
export const playerActionDurations: Record<PlayerAction, number> = {
    idle: Infinity, move: Infinity, cast: 1.65, hit: .75, defeat: 1.1,
};
export interface PlayerPose {
    x: number; lift: number; bob: number; lean: number;
    step: number; arm: number; flash: number; fall: number;
}
const clamp = (n: number) => Math.max(0, Math.min(1, n));

/** Preview seconds drive visual motion only; they never advance combat facts. */
export function samplePlayerPose(action: PlayerAction, time: number, castRelease = 1.05): PlayerPose {
    const pose: PlayerPose = {x: 0, lift: 0, bob: Math.round(Math.sin(time * 2.5)) * 1.5,
        lean: 0, step: 0, arm: 0, flash: 0, fall: 0};
    if (action === 'move') {
        pose.step = Math.sin(time * 12);
        pose.x = Math.sin(time * 1.7) * 42;
        pose.bob = -Math.abs(pose.step) * 3;
        pose.arm = pose.step * .09;
    } else if (action === 'cast') {
        const charge = Math.sin(clamp(time / .5) * Math.PI / 2);
        const release = clamp((time - castRelease) / .45);
        pose.arm = -.45 * charge * (1 - release);
        pose.lean = time < castRelease ? -.025 * charge : .045 * (1 - release);
        pose.bob = -charge * 2 * (1 - release);
    } else if (action === 'hit') {
        const p = clamp(time / .75);
        pose.x = -Math.sin(p * Math.PI) * 20;
        pose.lean = -Math.sin(p * Math.PI * 4) * .07 * (1 - p);
        pose.flash = p < .4 ? Math.max(0, Math.sin(p * Math.PI * 12)) : 0;
    } else if (action === 'defeat') {
        pose.fall = clamp(time / .85);
        pose.bob = 0;
    }
    return pose;
}
