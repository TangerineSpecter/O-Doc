import {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import '../../src/index.css';
import {worker} from '../../src/mocks/browser';
import {day} from '../../src/mocks/agentWorld/residents';
import {getLifeSchedule} from '../../src/api/agentLife';
import type {LifeItem} from '../../src/types/api/agentLife';
import LifeScheduleCard from '../../src/components/AgentLife/LifeScheduleCard';
import LifeItemDetails from '../../src/components/AgentLife/LifeItemDetails';
import {ToastProvider} from '../../src/components/common/ToastProvider';
await worker.start({onUnhandledRequest:'error'});
function Fixture() {
    const [id,setId]=useState(''),[items,setItems]=useState<LifeItem[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
    useEffect(()=>{const controller=new AbortController();getLifeSchedule({start:day,end:day,source:'reservation',view:'today'},controller.signal).then(result=>setItems(result.items)).catch(err=>setError(err.message)).finally(()=>setLoading(false));return()=>controller.abort();},[]);
    return <ToastProvider><main className="mx-auto max-w-xl space-y-3 p-4">{loading&&<p role="status">加载组队预约…</p>}{error&&<p role="alert">{error}</p>}{!loading&&!error&&!items.length&&<p>没有组队预约</p>}{items.map(item=><LifeScheduleCard key={item.id} item={item} actorName="预约居民" onClick={()=>setId(item.id)}/>)}{id&&<LifeItemDetails id={id} onClose={()=>setId('')} onChanged={()=>setId('')}/>}</main></ToastProvider>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
