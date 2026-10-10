import playerSheet from '../../../assets/combat/player-mage-route.png';

export const playerSheetUrl = playerSheet;
export const playerSheetSize = {width: 1774, height: 887};
export const playerJobs = ['job.novice', 'job.mage', 'job.elementalist', 'job.pyromancer'] as const;
export type PlayerJob = typeof playerJobs[number];
export const playerJobDetails: Record<PlayerJob, {name: string; level: string; index: number}> = {
    'job.novice': {name: '新手', level: 'Lv.1', index: 0},
    'job.mage': {name: '法师', level: 'Lv.10', index: 1},
    'job.elementalist': {name: '元素师', level: 'Lv.30', index: 2},
    'job.pyromancer': {name: '炎术师', level: 'Lv.70', index: 3},
};
export const playerSheetColumns = [27, 471, 910, 1358];
export interface PlayerArtRegion {x: number; y: number; width: number; height: number}
export const crystalStaffRegion: PlayerArtRegion = {x: 817, y: 614, width: 179, height: 260};
export function isPlayerJob(id: string): id is PlayerJob {
    return playerJobs.some(job => job === id);
}
export function playerPortraitRegion(job: PlayerJob): PlayerArtRegion {
    return {x: playerSheetColumns[playerJobDetails[job].index], y: 95, width: 374, height: 528};
}
