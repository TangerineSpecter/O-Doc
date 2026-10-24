import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import '../../src/index.css';
import ExplorationPreparation from '../../src/components/Combat/ExplorationPreparation';
import CombatObservationView from '../../src/components/Combat/CombatObservationView';
import {combatProfiles,combatCatalog} from '../../src/mocks/agentWorld/adventure';
import {combatCommand} from '../../src/api/combat';
import type {CombatSnapshot} from '../../src/types/api/combat';
import {useCombatObservation} from '../../src/hooks/useCombatObservation';
import {worker} from '../../src/mocks/browser';
import {localMode} from '../../src/config/development';
function Observation({id}:{id:string}) {
    const {snapshot,events,error}=useCombatObservation(id);
    return <>
        {error&&<p role="alert">{error}</p>}
        {snapshot&&<div className="flex flex-col" style={{height:1000}}>
            <output aria-label="冒险阶段">{snapshot.status} · {snapshot.stage}</output>
            <CombatObservationView snapshot={snapshot} events={events}/>
        </div>}
    </>;
}
function Fixture(){
    const [id,setId]=useState(''),[error,setError]=useState('');
    return <main className="mx-auto max-w-6xl space-y-4 p-3 sm:p-6"><h1 className="text-lg font-semibold">组队冒险 · 本地验收</h1>
        {error&&<p role="alert">{error}</p>}
        <ExplorationPreparation catalog={combatCatalog} profile={combatProfiles[0]} busy={false} onStart={constraints=>{void combatCommand<CombatSnapshot>(combatProfiles[0].actorId,{operation:'prepare',constraints}).then(value=>setId(value.id)).catch(e=>setError(String(e)));}}/>
        <button className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" onClick={()=>setId('local-party-exploration')}>查看四人冒险</button>
        {id&&<Observation key={id} id={id}/>}
    </main>;
}
if(!localMode)throw new Error('组队验收页只能在纯local模式运行');
await worker.start({onUnhandledRequest:'bypass'});
localStorage.setItem('token','local-demo-token');
createRoot(document.getElementById('root')!).render(<Fixture/>);
