export const professionAuraProfiles = [
    {id:'novice',name:'新手 · 启程星光',shape:'compass',color:'#d7b472',light:'#fff3c9',tier:0},
    {id:'warrior',name:'战士 · 赤金战意',shape:'blades',color:'#c67558',light:'#ffd5a0',tier:1},
    {id:'swordsman',name:'剑士 · 流银剑弧',shape:'crescent',color:'#80aecd',light:'#e5f7ff',tier:2},
    {id:'guardian',name:'守卫 · 岩纹守护',shape:'rampart',color:'#91a6aa',light:'#e1ece5',tier:2},
    {id:'swordmaster',name:'剑圣 · 三重剑意',shape:'swords',color:'#c4b777',light:'#fff7d7',tier:3},
    {id:'spellblade',name:'魔剑士 · 魔刃符印',shape:'runeblade',color:'#8877c0',light:'#b8e4ec',tier:3},
    {id:'cross',name:'圣骑士 · 十字光环',shape:'cross',color:'#d7ad58',light:'#fff9db',tier:3},
    {id:'berserker',name:'狂战士 · 狂怒锋芒',shape:'rage',color:'#b95251',light:'#ffc58b',tier:3},
    {id:'mage',name:'法师 · 奥术星环',shape:'arcane',color:'#79b5d2',light:'#dbf8ff',tier:1},
    {id:'elementalist',name:'元素师 · 四象环流',shape:'elements',color:'#6eafa6',light:'#d7f5c2',tier:2},
    {id:'occultist',name:'秘术师 · 秘法三角',shape:'triangle',color:'#a595d0',light:'#e8dcff',tier:2},
    {id:'flame',name:'炎术师 · 浮焰余辉',shape:'flame',color:'#e99445',light:'#fff2bc',tier:3},
    {id:'cryomancer',name:'冰术师 · 霜雪轻落',shape:'ice',color:'#83c7dc',light:'#e2fbff',tier:3},
    {id:'warlock',name:'咒术师 · 衰败之眼',shape:'eye',color:'#9c719d',light:'#dfbae0',tier:3},
    {id:'summoner',name:'召唤师 · 契约灵灯',shape:'spirits',color:'#8a95c3',light:'#dcf3d7',tier:3},
    {id:'ranger',name:'游侠 · 流风羽迹',shape:'feathers',color:'#8aad7c',light:'#e4f2ce',tier:1},
    {id:'archer',name:'弓手 · 翎羽蓄势',shape:'arrows',color:'#7c9d73',light:'#ecdda8',tier:2},
    {id:'assassin',name:'刺客 · 暗月锋痕',shape:'moon',color:'#9081b2',light:'#d7c9ee',tier:2},
    {id:'sharpshooter',name:'神射手 · 鹰羽准星',shape:'reticle',color:'#79adbd',light:'#dbf4f5',tier:3},
    {id:'hunter',name:'猎人 · 荒野爪印',shape:'paw',color:'#aaa26f',light:'#efe4bf',tier:3},
    {id:'shadowdancer',name:'影舞者 · 三相影月',shape:'shadowmoons',color:'#837aa6',light:'#d9d3f0',tier:3},
    {id:'trickster',name:'诡术师 · 幻牌毒雾',shape:'cards',color:'#a581ad',light:'#d7eab2',tier:3},
    {id:'holy',name:'牧师 · 温暖圣光',shape:'holy',color:'#e0c28b',light:'#fff8d7',tier:1},
    {id:'cleric',name:'祭司 · 双环祷光',shape:'prayer',color:'#d4c28f',light:'#fff5d8',tier:2},
    {id:'naturalist',name:'自然使 · 萌芽绿意',shape:'vines',color:'#8bb689',light:'#e2f3bc',tier:2},
    {id:'highpriest',name:'神官 · 金羽恩典',shape:'wings',color:'#d8c388',light:'#fff4d5',tier:3},
    {id:'inquisitor',name:'审判者 · 裁决天平',shape:'judgment',color:'#d4ac85',light:'#ffe9c7',tier:3},
    {id:'druid',name:'德鲁伊 · 林冠繁生',shape:'canopy',color:'#8daf74',light:'#e5efb2',tier:3},
    {id:'warden',name:'守望者 · 森林六芒',shape:'grove',color:'#6fae93',light:'#d4f0c3',tier:3},
] as const;
export type ProfessionAuraProfile = typeof professionAuraProfiles[number];
export type ProfessionAuraId = 'none' | ProfessionAuraProfile['id'];
export const auraNames = Object.fromEntries(professionAuraProfiles.map(p=>[p.id,p.name])) as Record<ProfessionAuraId,string>;
auraNames.none = '无职业效果';
const aliases: Record<string,ProfessionAuraId> = {pyromancer:'flame',priest:'holy',paladin:'cross'};
export function getProfessionAura(jobId:string): ProfessionAuraId {
    const id=jobId.replace(/^job\./,'');
    return aliases[id] ?? professionAuraProfiles.find(p=>p.id===id)?.id ?? 'none';
}
export function hasProfessionArt(jobId:string) {return getProfessionAura(jobId)!=='none';}
