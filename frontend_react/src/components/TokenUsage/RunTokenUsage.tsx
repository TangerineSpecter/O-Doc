import {useState} from 'react';
import type {TokenMetrics, RunTokenMetrics} from '../../types/api/tokenUsage';
import {tokenNumber} from '../../utils/tokenUsage';
import TokenRequestList from './TokenRequestList';

export default function RunTokenUsage({id, usage, chain}: {id: string; usage?: RunTokenMetrics; chain?: TokenMetrics | null}) {
    const [expanded, setExpanded] = useState(false);
    return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold text-slate-800">本次 Token 用量</h3><span className="text-sm font-semibold tabular-nums text-orange-600">{usage?.collected ? `${tokenNumber(usage.totalTokens)} token` : '未采集'}</span></div>
        {usage?.collected && <>
            <p className="mt-2 text-xs text-slate-500">输入 {tokenNumber(usage.inputTokens)} · 输出 {tokenNumber(usage.outputTokens)} · {usage.requestCount} 次模型请求</p>
            {!!usage.incompleteCount && <p className="mt-1 text-xs text-amber-700">另有 {usage.incompleteCount} 次用量不完整，合计仅包含已知消耗。</p>}
            <div className="mt-3 space-y-1">{usage.agents.map(agent => <div key={agent.key} className="flex flex-wrap justify-between gap-1 text-xs text-slate-600"><span>{agent.name || '系统规划'}</span><span>{tokenNumber(agent.totalTokens)} token · {agent.requestCount} 次请求{agent.incompleteCount ? ` · ${agent.incompleteCount} 次不完整` : ''}</span></div>)}</div>
            {chain?.collected && chain.requestCount !== usage.requestCount && <p className="mt-3 text-xs text-slate-500">含后续执行的整条链：{tokenNumber(chain.totalTokens)} token{chain.incompleteCount ? `（${chain.incompleteCount} 次不完整）` : ''}</p>}
        </>}
        <button onClick={() => setExpanded(value => !value)} aria-expanded={expanded} className="mt-3 text-xs font-medium text-orange-600 hover:underline">{expanded ? '收起模型请求' : '查看模型请求'}</button>
        {expanded && <div className="mt-3"><TokenRequestList filters={{all: '1', record_id: id}}/></div>}
    </section>;
}
