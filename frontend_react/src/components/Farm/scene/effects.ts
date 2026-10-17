import {getBuilding} from './buildings';
import {CFG, PROPS, SCENE_H, SCENE_W, pondField, type SceneLayout} from './layout';
import {cx, hash, mk, type Canvas, type Ctx} from './pixel';
import type {SceneSimulation} from './simulation';
import type {SceneState, SceneTint} from './types';

interface Light {x: number; y: number; r: number}

const NIGHT_GLOW = '#ffb24a';
const TINT_COLOR: Record<Exclude<SceneTint, 'none'>, string> = {dawn: '#fff0e0', dusk: '#ffe0c0'};

/**
 * 以 (x, y) 为中心画一团暖色像素光晕：外圈抖动 + 三层由淡到浓的圆盘。
 * 目标画布为纯黑底，用 screen 叠加；整层再以 screen 贴到场景上，等价于逐个光晕直接 screen 到场景。
 */
function glow(g: Ctx, x: number, y: number, r: number, col: string, a: number) {
    g.save();
    g.globalCompositeOperation = 'screen';
    g.fillStyle = col;
    const ring = (rr: number, al: number) => {
        g.globalAlpha = al;
        for (let j = -rr; j <= rr; j++) { const w = Math.floor(Math.sqrt(rr * rr - j * j + .25)); g.fillRect(x - w, y + j, w * 2 + 1, 1); }
    };
    g.globalAlpha = a * .5;
    for (let j = -r - 2; j <= r + 2; j++) for (let i = -r - 2; i <= r + 2; i++) { const d = Math.hypot(i, j); if (d > r && d < r + 2.2 && ((i + j) & 1) === 0) g.fillRect(x + i, y + j, 1, 1); }
    ring(r, a * .5); ring(Math.round(r * .68), a * .6); ring(Math.round(r * .38), a * .9); ring(Math.max(1, Math.round(r * .14)), a * 1.5 > 1 ? 1 : a * 1.5);
    g.restore();
}

function lightSources(state: SceneState, layout: SceneLayout): Light[] {
    const list: Light[] = [];
    for (const [kind, anchor] of [['coop', CFG.coop], ['barn', CFG.barn]] as const) {
        const s = getBuilding(kind, kind === 'coop' ? state.coop : state.barn, true);
        for (const l of s.lights) if (l.r > 0) list.push({x: anchor.x - s.ax + l.x, y: anchor.y - s.ay + l.y, r: l.r});
    }
    const lamps = layout === 'pond' ? [...PROPS.lamps, ...PROPS.pond.lamps] : PROPS.lamps;
    for (const [x, y] of lamps) list.push({x, y: y - 18, r: 24});
    if (layout === 'pond') list.push({x: CFG.pier.x + 5, y: CFG.pier.y + 21, r: 20});
    return list;
}

/**
 * 天气与光照：夜色、雨幕色调、清晨/傍晚色调这类静态着色烘焙到两层离屏画布（状态变化时才重建），
 * 逐帧只绘制雨滴、水花、池塘月光和萤火虫。
 */
export class WeatherOverlay {
    private shade: Canvas = mk(SCENE_W, SCENE_H);
    private glowLayer: Canvas = mk(SCENE_W, SCENE_H);
    private key = '';
    private hasShade = false;
    private hasGlow = false;

    /** 状态或布局变化时重建烘焙层。 */
    update(state: SceneState, layout: SceneLayout) {
        const key = [state.coop, state.barn, state.rain, state.night, state.tint, layout].join();
        if (key === this.key) return;
        this.key = key;
        const g = cx(this.shade), gl = cx(this.glowLayer);
        g.clearRect(0, 0, SCENE_W, SCENE_H);
        gl.globalCompositeOperation = 'source-over'; gl.globalAlpha = 1; gl.fillStyle = '#000000'; gl.fillRect(0, 0, SCENE_W, SCENE_H);
        g.globalCompositeOperation = 'source-over';
        g.fillStyle = '#ffffff'; g.fillRect(0, 0, SCENE_W, SCENE_H);
        g.globalCompositeOperation = 'multiply';
        this.hasShade = state.rain || state.night || state.tint !== 'none';
        this.hasGlow = state.night;
        if (state.tint !== 'none') { g.fillStyle = TINT_COLOR[state.tint]; g.fillRect(0, 0, SCENE_W, SCENE_H); }
        if (state.rain) { g.fillStyle = state.night ? '#bcc6dc' : '#a3b4cc'; g.fillRect(0, 0, SCENE_W, SCENE_H); }
        if (!state.night) return;
        g.fillStyle = '#4f5f9c'; g.fillRect(0, 0, SCENE_W, SCENE_H);
        // 边角压暗（棋盘抖动）
        g.fillStyle = '#9aa4d0';
        for (let y = 0; y < SCENE_H; y++) for (let x = 0; x < SCENE_W; x++) {
            const d = Math.max(Math.abs(x - SCENE_W / 2) / (SCENE_W / 2), Math.abs(y - SCENE_H / 2) / (SCENE_H / 2));
            if (d > .86 && ((x + y) & 1) === 0 || d > .95) g.fillRect(x, y, 1, 1);
        }
        for (const l of lightSources(state, layout)) glow(gl, Math.round(l.x), Math.round(l.y), l.r, NIGHT_GLOW, state.rain ? .16 : .2);
    }

    /** 画在所有对象之上的着色与光晕。 */
    drawShade(g: Ctx) {
        if (this.hasShade) { g.save(); g.globalCompositeOperation = 'multiply'; g.drawImage(this.shade, 0, 0); g.restore(); }
        if (this.hasGlow) { g.save(); g.globalCompositeOperation = 'screen'; g.drawImage(this.glowLayer, 0, 0); g.restore(); }
    }

    /** 雨、池塘月光与萤火虫等逐帧变化的效果。 */
    drawDynamic(g: Ctx, state: SceneState, sim: SceneSimulation, layout: SceneLayout) {
        if (state.night) {
            if (layout === 'pond') for (let i = 0; i < 10; i++) {
                const x = 26 + Math.floor(hash(i, 3, 71) * 88), y = 136 + Math.floor(hash(i, 4, 71) * 54);
                if (pondField(x, y) < .7 && ((sim.tickN + i * 5) % 20) < 4) { g.save(); g.globalCompositeOperation = 'screen'; g.fillStyle = '#d8e6ff'; g.fillRect(x, y, 2, 1); g.restore(); }
            }
            if (!state.rain) for (const f of sim.flies) {
                if (Math.sin(f.ph * 3.1) <= -.2) continue;
                const x = Math.round(f.x), y = Math.round(f.y);
                g.save(); g.globalCompositeOperation = 'screen'; g.fillStyle = '#e8ff7a'; g.globalAlpha = .22; g.fillRect(x - 1, y, 3, 1); g.fillRect(x, y - 1, 1, 3); g.globalAlpha = 1; g.fillStyle = '#fbffc4'; g.fillRect(x, y, 1, 1); g.restore();
            }
        }
        if (!state.rain) return;
        for (const d of sim.drops) {
            const x = Math.round(d.x), y = Math.round(d.y), far = d.vy < 4.5;
            g.globalAlpha = far ? .55 : .9; g.fillStyle = far ? '#a9cbe8' : '#e8f6ff';
            g.fillRect(x, y, 1, 2); g.fillRect(x - 1, y + 2, 1, 1);
            if (!far) g.fillRect(x, y - 1, 1, 1);
        }
        g.globalAlpha = .85; g.fillStyle = '#e8f6ff';
        for (const s of sim.splashes) {
            if (s.t === 3) { g.fillRect(s.x, s.y, 1, 1); } else { g.fillRect(s.x - 1, s.y - 1, 1, 1); g.fillRect(s.x + 1, s.y - 1, 1, 1); if (s.t === 2) g.fillRect(s.x, s.y, 1, 1); }
        }
        g.globalAlpha = 1;
    }
}
