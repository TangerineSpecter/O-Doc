import {useState} from 'react';
import type {AgentLongTermMemoryConfig, AgentMemorySummary, AgentWorldMemoryMeta} from '@/types/api/setting';

export function AgentMemorySummaryCard({summary}: {summary: AgentMemorySummary | null}) {
    if (!summary) return null;
    return <div className="shrink-0 border-b border-slate-100 bg-slate-50 px-5 py-2 text-xs text-slate-600">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span>自动有效 {summary.active.count}/{summary.active.limit} · {summary.active.characters}/{summary.active.characterLimit} 字符</span>
            <span>自动归档 {summary.archived.count}/{summary.archived.limit}</span>
            <span>受保护 {summary.protectedCount} 条</span>
        </div>
        <p className="mt-1">{summary.state?.detail || '启用后的新经历将每日整理；尚无整理结果'}{summary.state?.status === 'running' ? '（进行中）' : ''}</p>
    </div>;
}

const activityLabels: Record<string, string> = {farm:'农牧经营', cooking:'料理制作', market:'市场成交', investment:'投资交易', travel:'旅行', relation:'关系事件', social:'社交', publication:'作品互动'};

export function AgentMemorySources({memory}: {memory: AgentLongTermMemoryConfig}) {
    const [open, setOpen] = useState(false);
    const info = memory.metadata?.worldMemory as AgentWorldMemoryMeta | undefined;
    if (!info?.sources?.length) return null;
    return <div className="mt-2 text-xs" onClick={event => event.stopPropagation()}>
        <button type="button" onClick={() => setOpen(!open)} className="text-emerald-700 hover:underline" aria-expanded={open}>查看真实来源（{info.sources.length}）</button>
        {open && <ul className="mt-2 space-y-2 rounded-lg bg-slate-50 p-2 text-slate-600">
            {info.sources.map(source => <li key={source.id} className="break-words">
                <div>{source.day} · {activityLabels[source.kind] || source.kind}</div>
                <p className="mt-1 whitespace-pre-wrap">{String(source.facts.reason || source.facts.reflection || source.facts.summary || source.facts.ownExpression || source.facts.target || '已记录实际结果')}
                    {source.facts.result !== undefined && <span className="block mt-1">{JSON.stringify(source.facts.result)}</span>}</p>
            </li>)}
        </ul>}
    </div>;
}
