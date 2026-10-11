import mossCavePixel from '../../../assets/combat/battle-moss-cave-pixel-v2.png';
import minePixel from '../../../assets/combat/battle-abandoned-mine-pixel-v2.png';
import forestPixel from '../../../assets/combat/battle-mist-forest-pixel-v2.png';
import ruinsPixel from '../../../assets/combat/battle-sunken-ruins-pixel-v2.png';
import fortressPixel from '../../../assets/combat/battle-ember-fortress-pixel-v2.png';
import riftPixel from '../../../assets/combat/battle-star-rift-pixel-v2.png';

/** Battle background review assets are independent of approved atlas habitats. */
export const battleBackgroundArt={
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
} as const;
export type BattleBackgroundId=keyof typeof battleBackgroundArt;
export type BattleBackdrop=BattleBackgroundId|'plain';
export type BattleBackgroundArt=typeof battleBackgroundArt[keyof typeof battleBackgroundArt];
