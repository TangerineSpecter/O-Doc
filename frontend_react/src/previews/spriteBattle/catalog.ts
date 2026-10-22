import type {OutfitDefinition,ProfessionDefinition,WeaponDefinition} from './types';

export const WIDTH=1280,HEIGHT=560,GROUND=440,HERO_X=350,DUMMY_X=970;
export const weapons:WeaponDefinition[]=[
    {id:'moon',name:'奥术星芒月轮杖',shortName:'月轮杖',kind:'staff',grip:{x:5,y:32},tip:{x:23,y:6},scale:2.3,angle:.35,color:'#91d5f0',description:'金色月轮包住蔚蓝晶核，独立挂接至手部。'},
    {id:'inferno',name:'红莲灭世双头炎魔杖',shortName:'炎魔杖',kind:'staff',grip:{x:12,y:35},tip:{x:12,y:7},scale:2.25,angle:.48,color:'#ffb077',description:'更长的双头杖，沿用同一套角色动作与发射规则。'},
    {id:'katana',name:'天丛云·绯金剑圣名刀',shortName:'天丛云',kind:'sword',grip:{x:7,y:37},tip:{x:25,y:3},scale:2.6,angle:.65,color:'#e8d390',description:'独立刀剑精灵，普通攻击切换为突进斩击。'},
];
export const outfits:OutfitDefinition[]=[
    {id:'spark',name:'花火骑士套',row:0,color:'#dd795c',description:'红衣、四叶草和熟悉的小背包。'},
    {id:'scholar',name:'星芒学者套',row:1,color:'#7596c4',description:'蓝白短披风与金色星纹，四个专用动作姿态。'},
    {id:'blade',name:'绯金剑圣甲',row:2,color:'#ad8279',description:'绯黑羽织叠银色胸甲，保留可莉的外观身份。'},
];
export const professions:ProfessionDefinition[]=[
    {id:'pyromancer',name:'炎法师',english:'PYROMANCER',color:'#f6a265',skill:'四叶焰·星陨花火',passive:'三叶余烬',description:'三枚余烬环绕守候，每三次普通攻击命中，追加一次小型花火。',phases:['聚焰','星陨','花火绽放','余烬']},
    {id:'blademaster',name:'剑圣',english:'BLADE MASTER',color:'#76c7ce',skill:'天元剑匣·神裁天剑',passive:'藏锋·五曜剑阵',description:'五柄灵剑环绕剑匣。施放奥义时，二十四柄飞剑分批追击，神裁天剑终结。',phases:['开匣','万剑追击','天剑降临','收势']},
];
export const getWeapon=(id:WeaponDefinition['id'])=>weapons.find(w=>w.id===id)!;
export const getOutfit=(id:OutfitDefinition['id'])=>outfits.find(o=>o.id===id)!;
export const getProfession=(id:ProfessionDefinition['id'])=>professions.find(p=>p.id===id)!;
