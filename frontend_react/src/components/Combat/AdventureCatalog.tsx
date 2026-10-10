import {useState} from 'react';
import {Select} from '../common/Select';
import {useAdventureCatalog} from '../../hooks/useAdventureCatalog';
import CombatAtlas from './CombatAtlas';

export default function AdventureCatalog({residents, initialAgentId = '', active}: {
    residents: {id: string; name: string}[]; initialAgentId?: string; active: boolean;
}) {
    const [actorId, setActorId] = useState(residents.some(row => row.id === initialAgentId) ? initialAgentId : residents[0]?.id || '');
    const state = useAdventureCatalog(actorId, active);
    return <div className="flex h-full min-h-0 flex-col gap-3">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
            <div className="space-y-1 text-xs text-slate-500">
                <p>查阅地牢、怪物与成长路线，了解装备和材料的来源。</p>
                {residents.length > 0 && <p id="adventure-discovery-hint">人物选择仅切换“已遭遇 / 已击败 / 已获得”标记，图鉴内容全世界共享。</p>}
            </div>
            {residents.length > 0 && <div className="flex flex-wrap items-center gap-2">
                <span id="adventure-discovery-label" className="text-xs font-medium text-slate-600">查看居民探索记录</span>
                <div role="group" aria-labelledby="adventure-discovery-label" aria-describedby="adventure-discovery-hint" className="w-36"><Select menuPortal value={actorId} options={residents.map(row => ({value:row.id, label:row.name}))} onChange={setActorId}/></div>
            </div>}
        </div>
        {state.error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-xs text-red-700">{state.error}<button type="button" onClick={state.reload} className="ml-3 font-semibold underline">重新加载</button></p>}
        <div className="min-h-0 flex-1">{state.data ? <CombatAtlas catalog={state.data.catalog} discoveries={state.data.discoveries}/> : !state.error ? <p className="p-6 text-sm text-slate-500">正在翻开冒险图鉴…</p> : null}</div>
    </div>;
}
