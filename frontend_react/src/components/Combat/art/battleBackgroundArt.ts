import sproutMeadowPixel from '../../../assets/combat/battle-sprout-meadow-pixel-v1.png';
import mossCavePixel from '../../../assets/combat/battle-moss-cave-pixel-v2.png';
import minePixel from '../../../assets/combat/battle-abandoned-mine-pixel-v2.png';
import forestPixel from '../../../assets/combat/battle-mist-forest-pixel-v2.png';
import ruinsPixel from '../../../assets/combat/battle-sunken-ruins-pixel-v2.png';
import fortressPixel from '../../../assets/combat/battle-ember-fortress-pixel-v2.png';
import riftPixel from '../../../assets/combat/battle-star-rift-pixel-v2.png';

export interface BattleBackgroundArt {
    id:string;
    name:string;
    src:string;
    status:'approved'|'review';
    logicalWidth:number;
    logicalHeight:number;
    feetRatio:number;
}

/** Shared habitat assets for observation and the atlas; only approved art is shown in the atlas. */
export const battleBackgroundArt={
    'dungeon.sprout_meadow':{id:'dungeon.sprout_meadow',name:'新芽草甸',src:sproutMeadowPixel,
        status:'approved',logicalWidth:160,logicalHeight:94,feetRatio:.79},
    'dungeon.moss_cave':{id:'dungeon.moss_cave',name:'苔石洞窟',src:mossCavePixel,
        status:'approved',logicalWidth:160,logicalHeight:94,feetRatio:.79},
    'dungeon.abandoned_mine':{id:'dungeon.abandoned_mine',name:'废弃矿坑',src:minePixel,
        status:'approved',logicalWidth:160,logicalHeight:94,feetRatio:.79},
    'dungeon.mist_forest':{id:'dungeon.mist_forest',name:'迷雾林地',src:forestPixel,
        status:'approved',logicalWidth:160,logicalHeight:94,feetRatio:.79},
    'dungeon.sunken_ruins':{id:'dungeon.sunken_ruins',name:'沉没遗迹',src:ruinsPixel,
        status:'approved',logicalWidth:160,logicalHeight:94,feetRatio:.79},
    'dungeon.ember_fortress':{id:'dungeon.ember_fortress',name:'灰烬堡垒',src:fortressPixel,
        status:'approved',logicalWidth:160,logicalHeight:94,feetRatio:.79},
    // This floating platform has a visible underside; feet stay on its top surface.
    'dungeon.star_rift':{id:'dungeon.star_rift',name:'星蚀裂隙',src:riftPixel,
        status:'approved',logicalWidth:160,logicalHeight:94,feetRatio:.69},
} as const satisfies Record<string,BattleBackgroundArt>;
export type BattleBackgroundId=keyof typeof battleBackgroundArt;
export type BattleBackdrop=BattleBackgroundId|'plain';
