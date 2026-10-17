import type {AnimalType, HenType} from './animalSprites';
import type {BuildingKind} from './buildingParts';
import {getBuilding} from './buildings';
import {Critter, type Obstacle, type Zone} from './critters';
import {CFG, ROUTE, ROUTE_SOUTH, ROUTE_SOUTH_AFTER, SCENE_H, SCENE_W, inPond, type RoutePoint, type SceneLayout} from './layout';
import {rng} from './pixel';
import type {ResidentDirection} from './residentSprite';
import type {SceneAnimal, SceneState} from './types';

interface Resident {i: number; x: number; y: number; wait: number; dir: ResidentDirection; leg: number; ph: number}
interface Drop {x: number; y: number; vy: number; land: number}
interface Splash {x: number; y: number; t: number}
interface Ripple {x: number; y: number; t: number}
interface Firefly {x: number; y: number; ph: number; sp: number}
interface Group {level: number; r: () => number; list: Critter[]}

/** 装饰幼崽的 key 前缀，用于与真实动物 ID 区分（幼崽不可点选）。 */
export const YOUNG_PREFIX = 'young:';
const HENS: HenType[] = ['hen', 'henB', 'henY'];
const ZONES: Record<BuildingKind, Zone> = {coop: CFG.coopZone, barn: CFG.barnZone};
// 食槽、草垛等摆件占的位置（与 drawScene 里的摆件坐标对应）。
const PROP_OBSTACLES: Record<BuildingKind, Obstacle[]> = {
    coop: [[198, 16, 218, 35], [222, 28, 246, 42], [198, 60, 220, 71]],
    barn: [[198, 118, 216, 136], [206, 186, 232, 199], [296, 186, 313, 199]],
};

/** 稳定地由动物 ID 决定母鸡的羽色，轮询刷新时不会变。 */
const henType = (id: string): HenType => {
    let h = 0;
    for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return HENS[h % HENS.length];
};
const animalType = (a: SceneAnimal): AnimalType => a.kind === 'chicken' ? henType(a.id) : a.kind;

export const routeFor = (layout: SceneLayout): RoutePoint[] =>
    layout === 'southField' ? [...ROUTE.slice(0, ROUTE_SOUTH_AFTER + 1), ...ROUTE_SOUTH, ...ROUTE.slice(ROUTE_SOUTH_AFTER + 1)] : ROUTE;

/**
 * 场景里所有会动的东西：动物、居民、雨滴、涟漪和萤火虫。
 * sync 只增删有变化的动物，轮询刷新数据时已有动物的位置保持不变，不会跳动。
 */
export class SceneSimulation {
    critters: Critter[] = [];
    resident: Resident;
    drops: Drop[] = [];
    splashes: Splash[] = [];
    ripples: Ripple[] = [];
    flies: Firefly[] = [];
    tickN = 0;
    private groups = new Map<BuildingKind, Group>();
    private route: RoutePoint[] = ROUTE;
    private layout: SceneLayout = 'pond';

    constructor() {
        this.resident = this.newResident();
        const r = rng(99);
        for (let i = 0; i < 130; i++) this.drops.push({x: r() * SCENE_W, y: r() * SCENE_H, vy: 3 + r() * 3, land: 30 + r() * (SCENE_H - 32)});
        for (let i = 0; i < 18; i++) this.flies.push({x: r() * SCENE_W, y: 20 + r() * (SCENE_H - 40), ph: r() * 6.28, sp: .02 + r() * .03});
    }

    private newResident(): Resident {
        const first = this.route[0];
        return {i: 1, x: first.x, y: first.y, wait: 0, dir: 'down', leg: 0, ph: 0};
    }

    /** 让动物、巡逻路线与最新状态一致。 */
    sync(state: SceneState, layout: SceneLayout) {
        if (layout !== this.layout) {
            this.layout = layout;
            this.route = routeFor(layout);
            this.resident = this.newResident();
        }
        for (const kind of ['coop', 'barn'] as const) this.syncGroup(kind, state);
        this.critters = [...this.groups.values()].flatMap(g => g.list);
    }

    private obstacles(kind: BuildingKind, level: number): Obstacle[] {
        const sprite = getBuilding(kind, level as 0, false), a = CFG[kind], hw = (sprite.c.width >> 1) - 2;
        return [[a.x - hw, 0, a.x + hw, a.y + 1], ...PROP_OBSTACLES[kind]];
    }

    private syncGroup(kind: BuildingKind, state: SceneState) {
        const level = kind === 'coop' ? state.coop : state.barn;
        let group = this.groups.get(kind);
        // 建筑等级变化后占地不同，整组重新安置。
        if (!group || group.level !== level) {
            group = {level, r: rng(kind === 'coop' ? 7 : 11), list: []};
            this.groups.set(kind, group);
        }
        const wanted = new Map<string, AnimalType>();
        for (const a of state.animals) if (a.building === kind) wanted.set(a.id, animalType(a));
        const young: AnimalType = kind === 'coop' ? 'chick' : 'lamb';
        const youngCount = kind === 'coop' ? state.chicks : state.lambs;
        for (let i = 0; i < youngCount; i++) wanted.set(`${YOUNG_PREFIX}${young}:${i}`, young);
        // 原地删除：新建的动物以同一数组作为「同伴」避让对象。
        for (let i = group.list.length - 1; i >= 0; i--) {
            const c = group.list[i];
            if (c.id === null || wanted.get(c.id) !== c.type) group.list.splice(i, 1);
        }
        const have = new Set(group.list.map(c => c.id));
        const obstacles = this.obstacles(kind, level);
        for (const [id, type] of wanted) {
            if (have.has(id)) continue;
            const c = new Critter(type, ZONES[kind], obstacles, group.r, group.list, id);
            group.list.push(c);
            for (let i = 0; i < 60; i++) c.tick();
        }
    }

    private tickResident() {
        const r = this.resident, R = this.route, target = R[r.i];
        r.ph++;
        if (r.wait > 0) { r.wait--; r.leg = 0; return; }
        const dx = target.x - r.x, dy = target.y - r.y, d = Math.hypot(dx, dy), sp = 0.8;
        if (d < sp + .1) { r.x = target.x; r.y = target.y; r.wait = target.wait ?? 0; r.i = (r.i + 1) % R.length; return; }
        r.x += dx / d * sp; r.y += dy / d * sp;
        r.dir = Math.abs(dy) > Math.abs(dx) ? (dy > 0 ? 'down' : 'up') : (dx > 0 ? 'side' : 'left');
        if (r.ph % 4 === 0) r.leg ^= 1;
    }

    /** 推进一个 tick（0.1 秒）。 */
    tick(state: SceneState) {
        this.tickN++;
        this.critters.forEach(c => c.tick());
        this.tickResident();
        if (state.rain) {
            for (const d of this.drops) {
                d.y += d.vy; d.x -= .5;
                if (d.y < d.land) continue;
                this.splashes.push({x: Math.round(d.x), y: Math.round(d.land), t: 3});
                if (inPond(Math.round(d.x), Math.round(d.land)) && this.layout === 'pond' && Math.random() < .15) this.ripples.push({x: d.x, y: d.land, t: 0});
                d.y = -4; d.x = Math.random() * (SCENE_W + 20); d.land = 30 + Math.random() * (SCENE_H - 32);
            }
            this.splashes = this.splashes.filter(s => --s.t > 0);
        }
        this.ripples = this.ripples.filter(r => ++r.t < 9);
        if (state.night) for (const f of this.flies) {
            f.ph += f.sp; f.x += Math.sin(f.ph * 1.7) * .35; f.y += Math.cos(f.ph) * .25;
            if (f.x < 0) f.x = SCENE_W;
            if (f.x > SCENE_W) f.x = 0;
        }
    }
}
