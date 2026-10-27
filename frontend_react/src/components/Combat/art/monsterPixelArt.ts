import mineRat from '../../../assets/combat/monster-mine-rat-v1.png';
import oreGolem from '../../../assets/combat/monster-ore-golem-v1.png';
import ironGuard from '../../../assets/combat/monster-iron-guard-v1.png';
import mineGiant from '../../../assets/combat/monster-mine-giant-v1.png';
import toxicMushroom from '../../../assets/combat/monster-toxic-mushroom-v1.png';
import mistWolf from '../../../assets/combat/monster-mist-wolf-v1.png';
import ancientGuard from '../../../assets/combat/monster-ancient-guard-v1.png';
import mistTreant from '../../../assets/combat/monster-mist-treant-v1.png';
import ruinSkeleton from '../../../assets/combat/monster-ruin-skeleton-v1.png';
import waterSpirit from '../../../assets/combat/monster-water-spirit-v1.png';
import ruinKnight from '../../../assets/combat/monster-ruin-knight-v1.png';
import tidePriest from '../../../assets/combat/monster-tide-priest-v1.png';
import ashDemon from '../../../assets/combat/monster-ash-demon-v1.png';
import lavaBeast from '../../../assets/combat/monster-lava-beast-v1.png';
import furnaceGuard from '../../../assets/combat/monster-furnace-guard-v1.png';
import ashLord from '../../../assets/combat/monster-ash-lord-v1.png';
import riftWalker from '../../../assets/combat/monster-rift-walker-v1.png';
import starGolem from '../../../assets/combat/monster-star-golem-v1.png';
import riftLord from '../../../assets/combat/monster-rift-lord-v1.png';
import starOverlord from '../../../assets/combat/monster-star-overlord-v1.png';
import fuzzyEarRabbit from '../../../assets/combat/monster-fuzzy-ear-rabbit-v1.png';
import leafshellBeetle from '../../../assets/combat/monster-leafshell-beetle-v1.png';
import dawnfireGlowbug from '../../../assets/combat/monster-dawnfire-glowbug-v1.png';
import caveCrystalLizard from '../../../assets/combat/monster-cave-crystal-lizard-v1.png';
import caveBat from '../../../assets/combat/monster-cave-bat-v1.png';
import mossBeast from '../../../assets/combat/monster-moss-beast-v2.png';
import mossKing from '../../../assets/combat/monster-moss-king-v1.png';
import {elementMonsterArt} from './elementMonsterArt';

interface MonsterPixelArt {
    src: string;
    status: 'draft' | 'approved';
}

/** Approved static artwork is shared by atlas thumbnails and details; future drafts remain opt-in. */
export const monsterPixelArt: Readonly<Record<string, MonsterPixelArt>> = {
    ...elementMonsterArt,
    'monster.mine_rat': {src: mineRat, status: 'approved'},
    'monster.ore_golem': {src: oreGolem, status: 'approved'},
    'monster.iron_guard': {src: ironGuard, status: 'approved'},
    'monster.mine_giant': {src: mineGiant, status: 'approved'},
    'monster.toxic_mushroom': {src: toxicMushroom, status: 'approved'},
    'monster.mist_wolf': {src: mistWolf, status: 'approved'},
    'monster.ancient_guard': {src: ancientGuard, status: 'approved'},
    'monster.mist_treant': {src: mistTreant, status: 'approved'},
    'monster.ruin_skeleton': {src: ruinSkeleton, status: 'approved'},
    'monster.water_spirit': {src: waterSpirit, status: 'approved'},
    'monster.ruin_knight': {src: ruinKnight, status: 'approved'},
    'monster.tide_priest': {src: tidePriest, status: 'approved'},
    'monster.ash_demon': {src: ashDemon, status: 'approved'},
    'monster.lava_beast': {src: lavaBeast, status: 'approved'},
    'monster.furnace_guard': {src: furnaceGuard, status: 'approved'},
    'monster.ash_lord': {src: ashLord, status: 'approved'},
    'monster.rift_walker': {src: riftWalker, status: 'approved'},
    'monster.star_golem': {src: starGolem, status: 'approved'},
    'monster.rift_lord': {src: riftLord, status: 'approved'},
    'monster.star_overlord': {src: starOverlord, status: 'approved'},
    'monster.fuzzy_ear_rabbit': {src: fuzzyEarRabbit, status: 'approved'},
    'monster.leafshell_beetle': {src: leafshellBeetle, status: 'approved'},
    'monster.dawnfire_glowbug': {src: dawnfireGlowbug, status: 'approved'},
    'monster.cave_crystal_lizard': {src: caveCrystalLizard, status: 'approved'},
    'monster.cave_bat': {src: caveBat, status: 'approved'},
    'monster.moss_beast': {src: mossBeast, status: 'approved'},
    'monster.moss_king': {src: mossKing, status: 'approved'},
};

export function getMonsterPixelArt(monsterId: string, includeDrafts = false): string | undefined {
    const art = monsterPixelArt[monsterId];
    return art && (includeDrafts || art.status === 'approved') ? art.src : undefined;
}
