import slime from '../../assets/combat/slime.svg';
import {getMonsterPixelArt} from '../../components/Combat/art/monsterPixelArt';
export const defeatPreviewMonsters=[
    {id:'monster.ore_golem',name:'矿石傀儡',rank:'普通',boss:false,sourceFacing:1,src:getMonsterPixelArt('monster.ore_golem')!},
    {id:'monster.mine_rat',name:'矿洞鼠',rank:'普通',boss:false,sourceFacing:1,src:getMonsterPixelArt('monster.mine_rat')!},
    {id:'monster.iron_guard',name:'铁甲矿卫',rank:'精英',boss:false,sourceFacing:1,src:getMonsterPixelArt('monster.iron_guard')!},
    {id:'monster.star_overlord',name:'星蚀主宰',rank:'Boss',boss:true,sourceFacing:1,src:getMonsterPixelArt('monster.star_overlord')!},
    {id:'monster.slime',name:'软泥怪',rank:'普通',boss:false,sourceFacing:0,src:slime},
];
export type DefeatPreviewMonster=typeof defeatPreviewMonsters[number];

/** A neutral pixel rehearsal stage, independent of the dungeon artwork registry. */
export function createDefeatPreviewBackdrop() {
    const canvas=document.createElement('canvas');canvas.width=160;canvas.height=94;
    const g=canvas.getContext('2d')!;
    g.fillStyle='#e8efed';g.fillRect(0,0,160,94);
    g.fillStyle='#d5e4df';g.fillRect(0,8,160,48);
    g.fillStyle='#c6dad4';
    for(const [x,y,w,h] of [[0,17,14,40],[14,8,14,47],[28,0,16,50],[118,0,18,50],[136,9,12,48],[148,20,12,40]])g.fillRect(x,y,w,h);
    g.fillStyle='#dfe8e1';g.fillRect(0,58,160,36);
    g.fillStyle='#c9d9c7';g.fillRect(7,78,146,5);g.fillRect(14,83,132,2);
    g.fillStyle='#f1f1e7';g.fillRect(10,65,140,13);g.fillRect(20,62,120,3);
    g.fillStyle='#b5c9b6';
    for(const [x,y] of [[4,67],[151,61],[14,86],[144,87]]){g.fillRect(x,y,5,3);g.fillRect(x+2,y-3,2,3);}
    g.fillStyle='#c2d1c9';for(const [x,y] of [[35,77],[97,80],[129,74],[48,67]])g.fillRect(x,y,3,1);
    return canvas;
}
