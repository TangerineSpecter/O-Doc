import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import '../../src/index.css';
import AnalyticsContent from '../../src/components/AgentWorld/Analytics/AnalyticsContent';
import {Select} from '../../src/components/common/Select';
import {useResidentAnalytics} from '../../src/hooks/useResidentAnalytics';
import {day} from '../../src/mocks/agentWorld/residents';
import {worker} from '../../src/mocks/browser';
import {localMode} from '../../src/config/development';

function Fixture() {
    const [actor,setActor]=useState(''),[refresh,setRefresh]=useState(0);
    const {data,residents,loading,error}=useResidentAnalytics({start_date:day,end_date:day,actor_id:actor},refresh,true);
    return <main className="mx-auto max-w-7xl space-y-4 p-3 sm:p-6">
        <h1 className="text-lg font-semibold">组队统计 · 本地验收</h1>
        <Select value={actor} onChange={setActor} options={[{value:'',label:'全部居民'},...residents.map(row=>({value:row.id,label:row.name}))]}/>
        <button type="button" onClick={()=>setRefresh(value=>value+1)}>刷新统计</button>
        {loading&&<p role="status">正在加载统计…</p>}
        {error&&<p role="alert">{error}</p>}
        {data&&<AnalyticsContent data={data}/>}
    </main>;
}
if(!localMode)throw new Error('统计验收页只能在纯local模式运行');
await worker.start({onUnhandledRequest:'bypass'});
localStorage.setItem('token','local-demo-token');
createRoot(document.getElementById('root')!).render(<Fixture/>);
