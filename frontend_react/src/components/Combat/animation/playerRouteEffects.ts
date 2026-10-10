import type {Graphics} from 'pixi.js';
import {arcanePalette, magicPearl, magicComet, magicImpact, stampPixels} from './playerSkillPixels';

export const playerDemoSkills = ['skill.player.004', 'skill.player.005', 'skill.player.017', 'skill.player.037'] as const;
export type PlayerDemoSkill = typeof playerDemoSkills[number];
export const playerSkillNames: Record<PlayerDemoSkill, string> = {
    'skill.player.004': '魔力弹', 'skill.player.005': '魔法屏障',
    'skill.player.017': '灼烧术', 'skill.player.037': '炎爆',
};
export const playerSkillTimings: Record<PlayerDemoSkill, {release: number; impact: number; duration: number}> = {
    'skill.player.004': {release: .5, impact: .95, duration: 1.7},
    'skill.player.005': {release: .6, impact: Infinity, duration: 3},
    'skill.player.017': {release: .55, impact: .8, duration: 3.75},
    'skill.player.037': {release: 1.05, impact: 1.35, duration: 3},
};
export interface PlayerSkillAnchors {
    sourceX: number; targetX: number; emitterX: number; emitterY: number; facing: -1 | 1;
}
const clamp = (n: number) => Math.max(0, Math.min(1, n));

/** Retain the accepted bolt art. Its charge and trajectory now originate at the item tip. */
export function drawPlayerMagicBolt(g: Graphics, time: number, a: PlayerSkillAnchors) {
    g.clear();
    if (time < .5) {
        stampPixels(g, magicPearl, arcanePalette, a.emitterX, a.emitterY, time < .22 ? 2 : 3.5);
        return;
    }
    if (time < .95) {
        const p = clamp((time - .5) / .45);
        const x = a.emitterX + (a.targetX - a.emitterX) * p;
        stampPixels(g, magicComet, arcanePalette, x - a.facing * 20,
            a.emitterY + (-61 - a.emitterY) * p, 4, 1, a.facing);
        return;
    }
    const p = clamp((time - .95) / .6);
    if (p < .65) stampPixels(g, magicImpact, arcanePalette, a.targetX, -61, p < .25 ? 3 : 4, 1 - p);
    for (let i = 0; i < 6; i++) {
        const angle = i / 6 * Math.PI * 2 + .35;
        const distance = 16 + p * 53;
        g.rect(Math.round((a.targetX + Math.cos(angle) * distance) / 4) * 4,
            Math.round((-61 + Math.sin(angle) * distance - p * 9) / 4) * 4, i % 2 ? 4 : 6, 4)
            .fill({color: 0x8ccfdf, alpha: 1 - p});
    }
}

export function sampleSkillHitTime(skill: PlayerDemoSkill, time: number): number | undefined {
    const hitTime = time - playerSkillTimings[skill].impact;
    if (hitTime < 0) return;
    if (hitTime < .45) return hitTime;
    if (skill === 'skill.player.017') {
        const pulse = hitTime % .8;
        if (hitTime < 2.4 && pulse < .16) return pulse;
    }
}

/** Local visual emphasis; does not advance combat facts, rounds, or damage. */
export function samplePlayerSkillFeedback(skill: PlayerDemoSkill, time: number) {
    if (skill !== 'skill.player.037') return {shade: 0, shakeX: 0, shakeY: 0};
    const t = time - playerSkillTimings[skill].impact;
    const shade = time < 1.05 ? clamp(time / .8) * .13
        : time < 1.35 ? .13 : Math.max(0, .13 * (1 - t / .5));
    const shake = t >= 0 && t < .28 ? (1 - t / .28) : 0;
    return {shade, shakeX: Math.sin(t * 82) * shake * 3.5, shakeY: Math.cos(t * 67) * shake * 2};
}
