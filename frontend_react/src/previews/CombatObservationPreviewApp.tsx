import {useState} from 'react';
import CombatObservationView from '../components/Combat/CombatObservationView';
import CombatObservationSummary from '../components/Combat/CombatObservationSummary';
import {observationPreviewEvents,observationPreviewRewards} from './combatObservationFixtures';
import {battleBackgroundArt} from '../components/Combat/art/battleBackgroundArt';
import type {BattleBackgroundId} from '../components/Combat/art/battleBackgroundArt';
import type {CombatSnapshot} from '../types/api/combat';

type PreviewBackgroundId=BattleBackgroundId;
const previewBackgrounds=Object.values(battleBackgroundArt);
const encounters:Record<PreviewBackgroundId,{id:string;name:string}[]>={
    'dungeon.element.tidal_shoal':[{id:'monster.element.water.bubble_crab',name:'泡泡寄居蟹'},{id:'monster.element.water.little_spirit',name:'小潮水灵'},{id:'monster.element.water.reef_guard',name:'礁壳守卫'},{id:'monster.element.water.tide_crown',name:'潮冠海兽'}],
    'dungeon.element.earth':[{id:'monster.element.earth.mole',name:'砂晶鼹鼠'},{id:'monster.element.earth.snail',name:'岩芽蜗牛'},{id:'monster.element.earth.armored',name:'琥岩甲兽'},{id:'monster.element.earth.dragon',name:'晶脊地龙'}],
    'dungeon.element.wind':[{id:'monster.element.wind.cloudbird',name:'云绒鸟'},{id:'monster.element.wind.bell',name:'风铃精'},{id:'monster.element.wind.falcon',name:'岚羽猎隼'},{id:'monster.element.wind.griffin',name:'云冠风鹫'}],
    'dungeon.element.fire':[{id:'monster.element.fire.lizard',name:'火绒蜥'},{id:'monster.element.fire.turtle',name:'炭壳龟'},{id:'monster.element.fire.horn',name:'熔角兽'},{id:'monster.element.fire.firebird',name:'焰羽炎鸟'}],
    'dungeon.moss_cave':[{id:'monster.moss_beast',name:'苔石兽'},{id:'monster.cave_bat',name:'洞穴蝙蝠'},{id:'monster.moss_king',name:'苔冠巨兽'},{id:'monster.cave_crystal_lizard',name:'洞穴晶蜥'}],
    'dungeon.abandoned_mine':[{id:'monster.ore_golem',name:'矿石傀儡'},{id:'monster.iron_guard',name:'铁甲矿卫'}],
    'dungeon.mist_forest':[{id:'monster.mist_wolf',name:'迷雾狼'},{id:'monster.mist_treant',name:'迷雾树王'}],
    'dungeon.sunken_ruins':[{id:'monster.water_spirit',name:'幽水灵'},{id:'monster.tide_priest',name:'潮汐祭司'}],
    'dungeon.ember_fortress':[{id:'monster.ash_demon',name:'灰烬魔'},{id:'monster.ash_lord',name:'灰烬领主'}],
    'dungeon.star_rift':[{id:'monster.rift_walker',name:'裂隙行者'},{id:'monster.star_overlord',name:'星蚀主宰'}],
    'dungeon.sprout_meadow':[{id:'monster.slime',name:'软泥怪'},{id:'monster.fuzzy_ear_rabbit',name:'绒耳兔'},
        {id:'monster.leafshell_beetle',name:'叶壳甲虫'},{id:'monster.dawnfire_glowbug',name:'晨光萤'}],
};
const roles=[
    {id:'job.novice',name:'新手',weapon:'none',skills:[]},
    {id:'job.warrior',name:'战士',weapon:'equip.sword',skills:['skill.player.001','skill.player.002']},
    {id:'job.ranger',name:'游侠',weapon:'equip.bow',skills:['skill.player.007']},
    {id:'job.mage',name:'法师',weapon:'equip.mage_staff',skills:['skill.player.004','skill.player.005']},
    {id:'job.pyromancer',name:'炎术师',weapon:'equip.staff',skills:['skill.player.004','skill.player.005','skill.player.017','skill.player.037']},
];
const previewBosses=new Set(['monster.moss_king','monster.element.water.tide_crown','monster.element.earth.dragon','monster.element.wind.griffin','monster.element.fire.firebird']);
const previewElites=new Set(['monster.moss_beast','monster.element.water.reef_guard','monster.element.earth.armored','monster.element.wind.falcon','monster.element.fire.horn']);

/** Fixture-only review route; the exact stage and HUD are shared with CombatObservation. */
export default function CombatObservationPreviewApp() {
    const [job,setJob]=useState('job.mage'),[map,setMap]=useState<PreviewBackgroundId>('dungeon.sprout_meadow');
    const [index,setIndex]=useState(0),[encounter,setEncounter]=useState(1),[kills,setKills]=useState(2),[defeated,setDefeated]=useState(false),[fallen,setFallen]=useState(false);
    const role=roles.find(item=>item.id===job)!,enemy=encounters[map][index];
    const snapshot:CombatSnapshot={id:'preview.observation',actorId:'preview.resident',version:encounter,canControl:false,
        status:fallen?'fallen':'active',stage:fallen?'done':defeated?'searching':'battle',reason:fallen?'角色倒地，本次探索已结束；战报和掉落记录仍可查看。':'',elapsedSeconds:60,durationSeconds:1800,nextTickAt:null,
        visual:{dungeonId:map,jobId:job,weaponId:role.weapon,monsterId:defeated?'':enemy.id,encounterId:`preview:${encounter}`},
        player:{name:'猫猫',level:10,hp:fallen?0:81,mp:62,stats:{hpMax:104,mpMax:62},states:[],skills:Object.fromEntries(role.skills.map(id=>[id,1]))},
        enemy:defeated?null:{name:enemy.name,level:8,hp:559,mp:76,rank:previewBosses.has(enemy.id)?'boss':previewElites.has(enemy.id)?'elite':'normal',stats:{hpMax:604,mpMax:84},states:[]},
        potions:{'potion.hp':3},result:{kills,energy:12,experience:28,rewards:observationPreviewRewards,report:fallen?'猫猫探索1分钟，击败2只怪物，获得28经验。角色倒地，本次探索结束。':''},events:[],latestCursor:0,nextCursor:0,hasMore:false};
    const changeMap=(id:PreviewBackgroundId)=>{setMap(id);setIndex(0);setDefeated(false);setEncounter(value=>value+1);};
    return <main className="mx-auto max-w-6xl space-y-4 px-4 py-7 text-slate-800 sm:px-6">
        <header><h1 className="text-xl font-bold">探索观察 · 战斗画面</h1><p className="mt-2 text-xs text-slate-500">接入效果预览，使用示例快照。正式探索读取当前居民、已学技能、出发武器、所在地图和遭遇魔物。</p></header>
        <nav aria-label="预览职业" className="flex flex-wrap gap-2">{roles.map(item=><button key={item.id} aria-pressed={item.id===job} onClick={()=>setJob(item.id)}
            className={`rounded-full border px-4 py-2 text-xs ${item.id===job?'border-orange-200 bg-orange-50 text-orange-700':'border-slate-200 bg-white text-slate-500'}`}>{item.name}</button>)}</nav>
        <nav aria-label="预览地图" className="flex flex-wrap gap-2">{previewBackgrounds.map(item=><button key={item.id} aria-pressed={item.id===map} onClick={()=>changeMap(item.id as PreviewBackgroundId)}
            className={`rounded-full border px-3 py-2 text-xs ${item.id===map?'border-teal-200 bg-teal-50 text-teal-700':'border-slate-200 bg-white text-slate-500'}`}>{item.name}</button>)}</nav>
        <div className="flex gap-2"><button aria-pressed={fallen} onClick={()=>setFallen(value=>!value)} className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">{fallen?'返回进行中预览':'查看倒地记录预览'}</button></div>
        <section className="flex h-[640px] flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <header className="mb-4 shrink-0 border-b border-slate-100 pb-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2"><h2 className="text-sm font-bold">探索观察</h2><CombatObservationSummary snapshot={snapshot}/></div>
                <p className="mt-1 text-[11px] leading-4 text-slate-400">{[snapshot.reason, '动作与飘字仅作演示，数值与收益以已确认战报为准'].filter(Boolean).join(' · ')}</p>
            </header>
            <CombatObservationView snapshot={snapshot} events={observationPreviewEvents(enemy,role.skills.length>0)}/>
        </section>
        <div className="flex flex-wrap gap-2">{encounters[map].map((item,i)=><button key={item.id} onClick={()=>{setIndex(i);setDefeated(false);setEncounter(value=>value+1);}}
            className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">{item.name}</button>)}
            <button disabled={defeated} onClick={()=>{setKills(value=>value+1);setDefeated(true);}} className="rounded-full bg-orange-500 px-4 py-2 text-xs text-white disabled:opacity-40">模拟确认击败</button>
            {defeated&&<button onClick={()=>{setDefeated(false);setEncounter(value=>value+1);}} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs">遭遇下一只</button>}
        </div>
        <p className="text-xs text-slate-400">此页不调用探索命令、不修改实际血量或奖励。正式界面继续保留战斗动态、掉落与击败记录。</p>
    </main>;
}
