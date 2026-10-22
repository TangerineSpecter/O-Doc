import {ell, rc, type Ctx} from '../../Farm/scene/pixel';
import {drawResident} from '../../Farm/scene/residentSprite';
import {pixelLine, stamp} from './sceneArt';
import type {FishingSceneCue, SceneMode} from './sceneModel';

export const CAST_SECONDS = 2.2;
export const RESULT_SECONDS = 6;
const angler = {x: 276, y: 195};
const float = {x: 369, y: 224};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (n: number) => Math.min(1, Math.max(0, n));
export function ripple(g: Ctx, x: number, y: number, t: number, force = 1) {
    const w = 5 + (t % 1) * 13 * force;
    g.globalAlpha = (1 - t % 1) * 0.7;
    pixelLine(g, x - w, y - 2, x + w, y - 2, '#d4eddf');
    pixelLine(g, x - w - 3, y, x - w, y + 2, '#d4eddf');
    pixelLine(g, x - w, y + 3, x + w, y + 3, '#d4eddf');
    pixelLine(g, x + w, y + 2, x + w + 3, y, '#d4eddf');
    g.globalAlpha = 1;
}
function splash(g: Ctx, x: number, y: number, t: number) {
    for (let i = 0; i < 7; i++) {
        const a = i * Math.PI / 6;
        rc(g, x + Math.cos(a) * t * 25, y - Math.sin(a) * Math.sin(t * Math.PI) * 21, 2, 3, '#e1f1dc');
    }
    ripple(g, x, y, t, 1.4);
}
export interface AnimationFrame {mode: SceneMode; seconds: number; castAge: number; cue?: FishingSceneCue; cueAge: number; fish?: HTMLCanvasElement; actorId: string}
/** 分离动作与业务：这里只接收已确认结果，永不抽取鱼种或改写收获。 */
export function drawFishingActor(g: Ctx, frame: AnimationFrame) {
    const {mode, seconds, cue, cueAge, castAge} = frame;
    if (mode === 'idle' && !cue) return;
    const resting = mode === 'preparing' || mode === 'returned' || mode === 'paused';
    const result = cue && cueAge < RESULT_SECONDS;
    const cast = !resting && !result && castAge < CAST_SECONDS;
    const pull = result ? clamp((cueAge - 0.8) / 1.4) : 0;
    const x = resting && !result ? 155 : angler.x;
    const y = resting && !result ? 202 : angler.y;
    let angle = -0.56 + Math.sin(seconds * 1.5) * 0.015;
    if (cast) angle = castAge < 0.7 ? lerp(-0.56, -2.4, castAge / 0.7) : lerp(-2.4, -0.56, clamp((castAge - 0.7) / 0.5));
    if (mode === 'duel') angle = -0.95 + Math.sin(seconds * 8) * 0.05;
    if (result) angle = lerp(-0.56, -1.9, pull);
    if (resting && !result) angle = -1.4;
    const bodyShift = cast && castAge < 0.7 ? -2 : result && pull > 0.2 ? -2 : 0;
    ell(g, x, y + 1, 13, 3, '#8f704c');
    const identity = Array.from(frame.actorId).reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
    stamp(g, drawResident('side', {leg: 0}, {style: 0, palette: identity % 4}), x + bodyShift, y, 2);
    // 上臂、前臂随着钓竿转动，和农场人物共用草帽、脸与背带裤。
    const handX = x + 7 + Math.cos(angle) * 6, handY = y - 14 + Math.sin(angle) * 6;
    pixelLine(g, x + 2, y - 15, handX, handY, '#8f5a2e', 4);
    pixelLine(g, x + 2, y - 15, handX, handY, '#f6cfa6', 3);
    const tipX = handX + Math.cos(angle) * 49, tipY = handY + Math.sin(angle) * 49;
    const bend = mode === 'duel' || result && cueAge < 1.5 ? 7 : 0;
    pixelLine(g, handX, handY, (handX + tipX) / 2, (handY + tipY) / 2 - bend, '#715039', 2);
    pixelLine(g, (handX + tipX) / 2, (handY + tipY) / 2 - bend, tipX, tipY, '#bb9760');
    rc(g, handX - 2, handY + 3, 4, 4, '#536b67'); rc(g, handX - 1, handY + 3, 2, 2, '#c7d5ca');
    if (resting && !result) return;
    let bx = float.x, by = float.y + Math.sin(seconds * 2.4) * 1.5;
    if (cast) {
        const progress = clamp((castAge - 0.7) / 1.2);
        bx = lerp(tipX, float.x, progress); by = lerp(tipY + 9, float.y, progress) - Math.sin(progress * Math.PI) * 45;
        if (castAge > 1.9) splash(g, float.x, float.y, (castAge - 1.9) / 0.3);
    }
    if (mode === 'duel') {bx += Math.sin(seconds * 6) * 6; by += Math.sin(seconds * 9) * 3;}
    if (result) {
        const flight = clamp((cueAge - 1) / 1.4);
        bx = lerp(float.x, x + 27, flight); by = lerp(float.y, y - 44, flight) - Math.sin(flight * Math.PI) * 49;
        if (cueAge < 1) by += Math.sin(cueAge * 22) * 4;
        if (cueAge > 1 && cueAge < 1.7) splash(g, float.x, float.y, (cueAge - 1) / 0.7);
        if (flight >= 1) {bx += Math.sin(seconds * 5) * 2; by += Math.sin(seconds * 3) * 2;}
    }
    pixelLine(g, tipX, tipY, (tipX + bx) / 2, (tipY + by) / 2 + (cast ? 5 : 9), '#f2e8cd');
    pixelLine(g, (tipX + bx) / 2, (tipY + by) / 2 + (cast ? 5 : 9), bx, by, '#f2e8cd');
    if (!result || cueAge < 1) {
        if (!cast) ripple(g, bx, float.y + 2, seconds * (mode === 'duel' ? 1.8 : 0.65));
        rc(g, bx - 1, by - 7, 3, 6, '#b95348'); rc(g, bx - 1, by - 1, 3, 4, '#fff3d8');
    } else if (cue?.kind === 'catch' && frame.fish) {
        // 图鉴原始 32 px 精灵裁掉标本底部阴影，用于悬挂的鱼。
        g.drawImage(frame.fish, 0, 0, 32, 27, Math.round(bx - 24), Math.round(by - 12), 48, 41);
        if (cueAge > 2.4) {rc(g, bx - 29, by - 8, 2, 6, '#fff1b8'); rc(g, bx - 31, by - 6, 6, 2, '#fff1b8');}
    } else if (cue?.kind === 'junk') {
        rc(g, bx - 5, by, 8, 9, '#826c55'); rc(g, bx - 2, by + 6, 10, 4, '#66584a');
    } else {rc(g, bx, by, 2, 5, '#e8e2d1');}
}
