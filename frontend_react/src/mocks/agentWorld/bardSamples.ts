import type {CombatProfile,CombatSnapshot,AdventurePartySnapshot,CombatEquipment} from '../../types/api/combat';
import {combatCatalog,localPartyExploration} from './adventure';

export const bardJobs=['bard','musician','cursesinger','battleconductor','requiemsinger','virtuoso','sonomancer'] as const;
function profile(job:string):CombatProfile {
    const tables=combatCatalog.tables,ids=new Set<string>();let cursor=`job.${job}`;
    while(cursor){ids.add(cursor);cursor=tables.professions.find(row=>row.id===cursor)?.parentId||'';}
    const learned=tables.skills.filter(row=>ids.has(row.professionId||''));
    const skills=learned.map(row=>{
        const level=tables.skillLevels.filter(rank=>rank.skillId===row.id&&Number(rank.requiredLevel)<=80).sort((a,b)=>Number(b.rank)-Number(a.rank))[0];
        return {...row,rank:Number(level.rank),parameters:{...level,currentCost:String(Math.ceil((Number(level.costBase)+Number(level.costPerLevel)*80)*Number(level.costRankFactor)))},effects:tables.skillEffects.filter(fx=>fx.skillLevelId===level.id)};
    }) as unknown as CombatProfile['skills'];
    const gearIds=['equip.instrument.50','equip.head.leather.70','equip.armor.leather.body.70','equip.armor.leather.hands.70','equip.armor.leather.feet.70'];
    const equipment:CombatEquipment[]=gearIds.map(id=>{
        const row=tables.equipmentTemplates.find(r=>r.id===id)!;
        const stats:Record<string,number>=row.slot==='weapon'?{magicAttack:193}:{physicalDefense:16,magicDefense:24};
        return {id:`local-${job}-${id}`,templateId:id,bound:false,locked:false,value:'500',snapshot:{templateId:id,name:row.name!,slot:row.slot!,equipmentType:row.equipmentType,grip:row.grip,level:80,quality:'blue',value:'500',stats,affixes:[]}};
    });
    return {actorId:`local-bard-${job}`,initialized:true,progression:{level:80,experience:1200,job:`job.${job}`,stats:{strength:40,dexterity:280,intelligence:400,vitality:100,spirit:260,luck:70},skills:Object.fromEntries(skills.map(s=>[s.id,s.rank]))},
        attributes:{hpMax:2200,mpMax:3800,physicalAttack:140,magicAttack:850,physicalDefense:280,magicDefense:370,dexterity:280},hp:1800,mp:2900,
        loadout:Object.fromEntries(equipment.map(e=>[e.snapshot.slot,e.id])),equipment,skills,potions:[],materials:[],activeExplorationId:'local-bard-exploration',promotionOptions:[],promotionBusy:false,reselectOptions:[],reselectBlocked:'二转及以上不能重选一转',restUntil:null,
        discoveries:{encountered:['monster.cave_bat'],defeated:['monster.slime'],equipment:gearIds}};
}
export const bardProfiles=bardJobs.map(profile);
const selected=['battleconductor','requiemsinger','virtuoso','sonomancer'];
export const bardParty:AdventurePartySnapshot={...structuredClone(localPartyExploration.party!),id:'local-bard-party',round:12,actionOrder:selected.map(job=>`local-bard-${job}`),
    players:selected.map(job=>{
        const p=bardProfiles.find(p=>p.progression.job===`job.${job}`)!;
        return {id:p.actorId,name:combatCatalog.tables.professions.find(r=>r.id===p.progression.job)!.name!,jobId:p.progression.job,jobName:combatCatalog.tables.professions.find(r=>r.id===p.progression.job)!.name!,level:80,hp:p.hp,mp:p.mp,stats:p.attributes,skills:p.progression.skills,
            bard:job==='virtuoso'?{beats:2}:job==='battleconductor'?{melody:{skillId:'skill.player.087',expires:17,extended:false}}:{},
            states:job==='virtuoso'?[{code:'modifier',name:'余音馈赠·昂扬',value:.08,expires:17,music:true,echo:true}]:[],
            visual:{dungeonId:'dungeon.moss_cave',jobId:p.progression.job,monsterId:'',encounterId:'local-bard-wave',weaponId:'equip.instrument.50'}};
    }),
    enemies:[{id:'local-bard-enemy',templateId:'monster.cave_bat',name:'洞穴蝙蝠',rank:'normal',level:80,hp:4500,mp:600,stats:{hpMax:6000,mpMax:1000},states:[{code:'bard_resonance',name:'共鸣音爆',value:3,sourceId:'local-bard-sonomancer',expires:17,music:true}]}],
    events:[{id:'local-bard-round',sequence:1,kind:'round',payload:{events:[
        {kind:'modifier',music:true,actor:'战歌指挥',actorId:'local-bard-battleconductor',target:'琴圣',targetId:'local-bard-virtuoso',action:'英雄战歌',stat:'attack',value:.36},
        {kind:'damage',music:true,actor:'琴圣',actorId:'local-bard-virtuoso',target:'洞穴蝙蝠',targetId:'local-bard-enemy',action:'回旋琴音',damage:850,element:'wind',hit:true},
        {kind:'bard_beats',music:true,actor:'琴圣',actorId:'local-bard-virtuoso',target:'琴圣',targetId:'local-bard-virtuoso',action:'回旋琴音',stacks:2},
        {kind:'modifier',music:true,actor:'琴圣',actorId:'local-bard-virtuoso',target:'魔音术士',targetId:'local-bard-sonomancer',action:'余音馈赠',stat:'critical',value:.03},
        {kind:'bard_resonance',music:true,actor:'魔音术士',actorId:'local-bard-sonomancer',target:'洞穴蝙蝠',targetId:'local-bard-enemy',action:'共鸣音爆',stacks:3},
    ]}}]};
bardParty.leaderId=bardParty.players[0].id;
export const bardSnapshot:CombatSnapshot={...structuredClone(localPartyExploration),id:'local-bard-exploration',actorId:bardProfiles[5].actorId,player:bardParty.players[2],enemy:bardParty.enemies[0],party:bardParty,events:[],result:{energy:12,experience:600,kills:4,rewards:[]}};
