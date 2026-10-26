import type {CombatAnalyticsResident} from '../../types/api/residentAnalytics';
import {residents,day} from './residents';

/** Two members share two kills; only the first member has an earlier solo kill. */
export const combatAnalyticsResidents:CombatAnalyticsResident[]=residents.map((resident,index)=>{
    const participated=index<2;
    const kills=index===0?3:index===1?2:0;
    const elapsed=index===0?54:index===1?9:0;
    return {id:resident.id,name:resident.name,avatar:'',departed:false,professionName:resident.professionName,
        job:index===1?'job.priest':'job.warrior',jobName:index===1?'牧师':'战士',
        jobLevel:index===1?12:35,
        explorations:participated?1:0,settled:participated?1:0,completed:participated?1:0,ongoing:0,
        fallen:0,recalled:0,exhausted:0,otherEnded:0,kills,bossKills:participated?1:0,
        experience:index===0?54:index===1?35:0,elapsedSeconds:elapsed,longestSeconds:elapsed,averageSeconds:elapsed,
        energy:participated?12:0,potions:index===0?5:index===1?3:0,
        successRate:participated?100:null,killsPerHour:elapsed?Math.round(kills*36000/elapsed)/10:null,
        destinations:participated?1:0,unclassifiedKills:0,
        monsters:participated?[{id:'monster.slime',name:'软泥怪',kills:kills-1,highestLevel:10},
            {id:'monster.moss_king',name:'苔冠巨兽',kills:1,highestLevel:20}]:[]};
});

export function combatAnalyticsMock(url:URL,empty:boolean) {
    const actor=url.searchParams.get('actor_id')||url.searchParams.get('actorId')||'';
    const includesDay=(url.searchParams.get('start_date')||day)<=day&&day<=(url.searchParams.get('end_date')||day);
    const rows=empty?[]:combatAnalyticsResidents.filter(row=>!actor||row.id===actor).map(row=>includesDay?row:{
        ...row,explorations:0,settled:0,completed:0,ongoing:0,kills:0,bossKills:0,experience:0,
        elapsedSeconds:0,longestSeconds:0,averageSeconds:0,energy:0,potions:0,successRate:null,killsPerHour:null,destinations:0,monsters:[]});
    return {combatComparison:rows,explorations:rows.reduce((sum,row)=>sum+row.explorations,0),
        wins:empty||!includesDay?0:actor?(rows[0]?.kills||0):3};
}
