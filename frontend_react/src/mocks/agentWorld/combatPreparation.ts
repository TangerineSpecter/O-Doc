import type {AdventureOption, CombatSnapshot, PartyCombatant} from '../../types/api/combat';
import {combatCatalog,combatProfiles,localAdventureOptions,localParty} from './adventure';
import {residents} from './residents';

interface Preparation {
    snapshot:CombatSnapshot;
    created:number;
    target:AdventureOption|null;
    dungeon:string;
    terminal:boolean;
}

/** In-memory local lifecycle, isolated from backend execution and inventory. */
export function createCombatPreparation(now:()=>number=Date.now) {
    const runs=new Map<string,Preparation>();
    const requests=new Map<string,string>();
    let sequence=0;

    function player(actor:string):PartyCombatant {
        const profile=combatProfiles.find(row=>row.actorId===actor)||combatProfiles[0];
        const job=combatCatalog.tables.professions.find(row=>row.id===profile.progression.job);
        return {id:actor,name:residents.find(row=>row.id===actor)?.name||'居民',level:profile.progression.level,
            jobId:profile.progression.job,jobName:job?.name,hp:profile.hp,mp:profile.mp,stats:{...profile.attributes},states:[]};
    }

    function read(id:string):CombatSnapshot|undefined {
        const entry=runs.get(id);
        if(!entry)return undefined;
        const age=now()-entry.created;
        if(!entry.terminal&&entry.snapshot.status==='preparing') {
            if(entry.target&&age>=1000&&age<4000) {
                entry.snapshot={...entry.snapshot,version:2,stage:'waiting_party',reason:'本地样例：补给准备完成，等待下一波加入'};
            } else if(age>=(entry.target?4000:2000)) {
                const actor=entry.snapshot.actorId;
                const players=[...(entry.target?.members.map(member=>({...player(member.actorId),
                    level:member.level,jobId:member.jobId,jobName:member.jobName}))||[]),player(actor)];
                const count=players.length;
                const candidates=combatCatalog.tables.dungeonMonsters.filter(row=>row.dungeonId===entry.dungeon)
                    .map(row=>combatCatalog.tables.monsters.find(monster=>monster.id===row.monsterId))
                    .filter(monster=>monster?.rank==='normal');
                const enemies=structuredClone(localParty.enemies.slice(0,count===1?1:2)).map((enemy,index)=>({
                    ...enemy,id:`${id}:monster-${index}`,templateId:candidates[index%candidates.length]?.id||enemy.templateId,
                    name:candidates[index%candidates.length]?.name||enemy.name,rank:'normal',taunt:undefined}));
                const party={...structuredClone(localParty),id:entry.target?.id||`party:${id}`,version:1,
                    dungeonId:entry.dungeon,leaderId:players[0].id,players,enemies,teamKills:0,
                    wave:1,round:0,phase:'battle',roundSeconds:({1:15,2:8,3:5,4:3})[count as 1|2|3|4],
                    actionOrder:[],events:[],endsAt:new Date(entry.created+entry.snapshot.durationSeconds*1000).toISOString()};
                entry.snapshot={...entry.snapshot,status:'active',stage:'battle',version:3,reason:'本地样例：已出发',
                    party,player:players[players.length-1],enemy:enemies[0],result:{energy:12,experience:0,kills:0,rewards:[]}};
            }
        }
        return structuredClone(entry.snapshot);
    }

    function prepare(actor:string,body:Record<string,unknown>,empty:boolean):CombatSnapshot|Response {
        const key=`${actor}:${String(body.key||'')}`;
        const previous=requests.get(key);
        if(body.key&&previous)return read(previous)!;
        const constraints=(body.constraints||{}) as Record<string,unknown>;
        const target=constraints.partyId?localAdventureOptions.parties.find(row=>row.id===constraints.partyId):null;
        if(constraints.partyId&&(empty||!target||constraints.partyRevision!==target.revision)) {
            return Response.json({code:400,msg:'所选冒险已变化，请重新选择',data:null},{status:400});
        }
        const id=`local-preparation-${++sequence}`;
        const duration=target?.durationSeconds||Number(constraints.durationSeconds||1800);
        const snapshot:CombatSnapshot={id,actorId:actor,version:1,status:'preparing',stage:'preparing',
            canControl:true,reason:'本地样例：正在准备补给',elapsedSeconds:0,durationSeconds:duration,nextTickAt:null,
            party:null,player:null,enemy:null,potions:{},result:{},events:[],latestCursor:0,nextCursor:0,hasMore:false};
        runs.set(id,{snapshot,created:now(),target:target?structuredClone(target):null,
            dungeon:target?.dungeonId||String(constraints.dungeonId||'dungeon.sprout_meadow'),terminal:false});
        if(body.key)requests.set(key,id);
        return structuredClone(snapshot);
    }

    function command(id:string,operation:unknown):CombatSnapshot|undefined {
        const snapshot=read(id),entry=runs.get(id);
        if(!snapshot||!entry)return undefined;
        if(operation==='recall'||operation==='leave') {
            entry.terminal=true;
            entry.snapshot={...snapshot,status:'recalled',stage:'done',version:snapshot.version+1,
                reason:'本地样例：已返回',party:snapshot.party?{...snapshot.party,status:'completed'}:null};
        }
        return read(id);
    }

    function active(actor:string):string|null {
        return [...runs.keys()].reverse().find(id=>{
            const snapshot=read(id)!;
            return snapshot.actorId===actor&&['preparing','active','paused'].includes(snapshot.status);
        })||null;
    }
    return {prepare,read,command,active};
}

export const localCombatPreparation=createCombatPreparation();
