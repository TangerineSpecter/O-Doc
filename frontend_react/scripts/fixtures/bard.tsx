/** Pure-local acceptance surface: real APIs, production renderers, typed MSW samples. */
import {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import '../../src/index.css';
import {getCombatCatalog,getCombatProfile,getCombatSnapshot} from '../../src/api/combat';
import type {CombatCatalog,CombatProfile,CombatSnapshot} from '../../src/types/api/combat';
import {ProfessionAtlasView} from '../../src/components/Combat/atlas/ProfessionAtlasView';
import {PlayerPortrait} from '../../src/components/Combat/atlas/PlayerPortrait';
import CombatLoadoutSlots from '../../src/components/Combat/CombatLoadoutSlots';
import CombatSkillsPanel from '../../src/components/Combat/CombatSkillsPanel';
import PartyBattleStage from '../../src/components/Combat/PartyBattleStage';
import PartyCombatLog from '../../src/components/Combat/PartyCombatLog';
import {EquipmentPortrait} from '../../src/components/Combat/atlas/EquipmentPortrait';
import {bardJobs} from '../../src/mocks/agentWorld/bardSamples';
import {worker} from '../../src/mocks/browser';
import {localMode} from '../../src/config/development';
import {saveAuthToken} from '../../src/utils/authStorage';

function Fixture(){
    const view=new URLSearchParams(location.search).get('view')||'gallery';
    const [catalog,setCatalog]=useState<CombatCatalog|null>(null),[profiles,setProfiles]=useState<CombatProfile[]>([]),[snapshot,setSnapshot]=useState<CombatSnapshot|null>(null),[error,setError]=useState('');
    useEffect(()=>{Promise.all([getCombatCatalog(),Promise.all(bardJobs.map(id=>getCombatProfile(`local-bard-${id}`))),getCombatSnapshot('local-bard-exploration',0)]).then(([c,p,s])=>{setCatalog(c);setProfiles(p);setSnapshot(s);}).catch(e=>setError(e.message));},[]);
    if(error)return <p role="alert" className="p-4">{error}</p>;
    if(!catalog||!snapshot)return <p role="status" className="p-4">正在加载职业与战斗状态</p>;
    return <main className="mx-auto max-w-6xl space-y-4 p-3 sm:p-6" style={view==='atlas'?{height:'100dvh',display:'flex',flexDirection:'column'}:{}}>
        {view==='loadout'?<CombatLoadoutSlots profile={profiles[5]} onInspect={()=>{}} portraitScale={1} portraitOffsetX={0} portraitOffsetY={0} onEditPortrait={()=>{}}/>:view==='atlas'?<ProfessionAtlasView catalog={catalog}/>:view==='battle'&&snapshot.party?<><PartyBattleStage party={snapshot.party} personalKills={4}/><PartyCombatLog party={snapshot.party}/></>:view==='skills'?<>{profiles.map(p=><section key={p.actorId} data-bard-profile={p.progression.job}><h2 className="mb-3 text-lg font-semibold">{catalog.tables.professions.find(r=>r.id===p.progression.job)?.name}</h2><CombatSkillsPanel profile={p}/></section>)}</>:<><h1 className="text-xl font-bold">吟游诗人 · 七条职业形象</h1><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{profiles.map(p=><article key={p.actorId} data-bard-profile={p.progression.job} className="rounded-2xl border border-slate-200 bg-white p-3"><PlayerPortrait jobId={p.progression.job} className="h-60 w-full"/><p className="text-center font-semibold">{catalog.tables.professions.find(r=>r.id===p.progression.job)?.name}</p><div className="flex justify-center">{p.equipment.map(e=><EquipmentPortrait key={e.id} equipmentId={e.templateId} name={e.snapshot.name} className="h-10 w-10"/>)}</div></article>)}</div></>}
    </main>;
}
if(!localMode)throw new Error('Requires pure local mode');
await worker.start({onUnhandledRequest:'bypass'});
saveAuthToken('local-demo-token',false);
createRoot(document.getElementById('root')!).render(<Fixture/>);
