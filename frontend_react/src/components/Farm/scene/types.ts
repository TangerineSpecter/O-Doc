import type {BuildingKind} from './buildingParts';
import type {BuildingLevel} from './buildings';
import type {CropSprite, PlotStage} from './cropSprites';
import type {ResidentLook} from './residentSprite';

/** 画面使用的农场状态：只含绘制和点选需要的字段，由 sceneModel 从接口数据转换而来。 */
export type SceneTint = 'none' | 'dawn' | 'dusk';
export interface ScenePlot {
    /** 地块槽位 0–15，对应接口里的地块 ID（字符串形式的槽位号）。 */
    slot: number;
    id: string;
    /** 已拥有；未拥有的地块显示为尚未开垦的地界，不可点选。 */
    owned: boolean;
    stage: PlotStage;
    crop: CropSprite;
    wet: boolean;
}
export type AnimalSpecies = 'chicken' | 'cow' | 'sheep';
export interface SceneAnimal {id: string; kind: AnimalSpecies; building: BuildingKind}
export interface SceneState {
    coop: BuildingLevel;
    barn: BuildingLevel;
    rain: boolean;
    night: boolean;
    tint: SceneTint;
    plots: ScenePlot[];
    animals: SceneAnimal[];
    /** 装饰用幼崽数量（不对应任何农场数据，不可点选）。 */
    chicks: number;
    lambs: number;
    look: ResidentLook;
}
export type SceneSelection = {kind: 'plot' | 'animal' | 'building'; id: string};
