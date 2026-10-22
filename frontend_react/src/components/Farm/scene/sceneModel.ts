import type {FarmPlot, FarmState} from '../../../types/api/farm';
import type {BuildingLevel} from './buildings';
import type {CropSprite, PlotStage} from './cropSprites';
import {CFG, PLOT_SLOTS} from './layout';
import type {SceneAnimal, SceneState, SceneTint} from './types';

/** 成长阶段沿用旧场景的阈值：满周期为可收获，达到 35% 为生长中，其余为幼苗。 */
export function plotStage(plot: FarmPlot | undefined): PlotStage {
    const crop = plot?.crop;
    if (!crop) return 'empty';
    const total = crop.rules.growthSeconds;
    if (crop.grown >= total) return 'ripe';
    return crop.grown >= total * .35 ? 'growing' : 'seedling';
}

const clampLevel = (level: number | undefined): BuildingLevel => Math.max(0, Math.min(3, Math.floor(level ?? 0))) as BuildingLevel;

/** 夜晚：20 点到次日 5 点；清晨 5–7 点、傍晚 17–20 点只加色调。 */
export function dayPeriod(hour: number): {night: boolean; tint: SceneTint} {
    if (hour < 5 || hour >= 20) return {night: true, tint: 'none'};
    if (hour >= 17) return {night: false, tint: 'dusk'};
    if (hour >= 5 && hour < 7) return {night: false, tint: 'dawn'};
    return {night: false, tint: 'none'};
}

/** 把接口返回的农场数据转换为画面状态；未拥有的地块和未建造的建筑分别表现为地界和空地。 */
export function toSceneState(farm: FarmState): SceneState {
    const now = Date.parse(farm.serverTime) / 1000, raining = farm.weather === 'rain';
    const plots = Array.from({length: PLOT_SLOTS}, (_, slot) => {
        const id = String(slot), plot = farm.state.plots.find(p => p.id === id);
        return {
            slot, id, owned: !!plot,
            stage: plotStage(plot),
            crop: plot?.crop ? plot.crop.kind : 'wheat' as CropSprite,
            wet: !!plot && (plot.wet ?? (plot.wateredUntil > now || raining)),
        };
    });
    const animals: SceneAnimal[] = farm.state.animals.map(a => ({id: a.id, kind: a.kind, building: a.building}));
    const coop = clampLevel(farm.state.buildings.coop?.level), barn = clampLevel(farm.state.buildings.barn?.level);
    const count = (kind: SceneAnimal['kind']) => animals.filter(a => a.kind === kind).length;
    // 幼崽只是点缀：有两只以上成年动物且建筑达到设计稿给出的等级才出现。
    return {
        coop, barn, rain: raining, ...dayPeriod(farm.hour), plots, animals,
        chicks: count('chicken') >= 2 ? CFG.coopYoung[coop] : 0,
        lambs: count('sheep') >= 2 ? CFG.barnYoung[barn] : 0,
        look: {style: farm.appearance.style, palette: farm.appearance.palette},
    };
}
