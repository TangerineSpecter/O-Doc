import {useState} from 'react';
import {Download, Loader2, Network} from 'lucide-react';
import {useTokenUsageExport} from '../../hooks/useTokenUsageExport';
import type {TokenMetrics, RunTokenMetrics} from '../../types/api/tokenUsage';
import {tokenNumber} from '../../utils/tokenUsage';
import ExecutionObservatoryDialog from './ExecutionObservatoryDialog';
import TokenModelTotals from './TokenModelTotals';
import TokenRequestList from './TokenRequestList';

export default function RunTokenUsage({id, usage, chain, taskName, startedAt}: {id: string; usage?: RunTokenMetrics; chain?: TokenMetrics | null; taskName?: string; startedAt?: string}) {
    const [expanded, setExpanded] = useState(false);
    const [flowOpen, setFlowOpen] = useState(false);
    const {exporting, exportError, download} = useTokenUsageExport({all: '1', record_id: id, include_content: '1'});
    return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-sm font-semibold text-slate-800">本次 Token 用量</h3>
                <button type="button" onClick={download} disabled={exporting}
                    title="导出本次执行每轮的模型输入、输出和用量（JSON）"
                    className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg border border-orange-200 px-2.5 py-1 text-xs font-medium text-orange-600 hover:bg-orange-50 focus-visible:outline-orange-500 disabled:opacity-50">
                    {exporting ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin"/> : <Download className="h-3.5 w-3.5 shrink-0"/>}
                    {exporting ? '导出中…' : '导出明细'}
                </button>
                <button type="button" onClick={() => setFlowOpen(true)}
                    title="查看执行时间轴、模型输入输出与相邻请求差异"
                    className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg border border-orange-200 px-2.5 py-1 text-xs font-medium text-orange-600 hover:bg-orange-50 focus-visible:outline-orange-500">
                    <Network className="h-3.5 w-3.5 shrink-0"/>
                    执行流程
                </button>
            </div>
            {usage?.collected ? (
                <div className="text-right">
                    <p className="text-xs font-semibold tabular-nums text-slate-500">合计 {tokenNumber(usage.totalTokens)} token</p>
                    <TokenModelTotals
                        largeModelTokens={usage.largeModelTokens}
                        decisionModelTokens={usage.decisionModelTokens}
                        className="justify-end text-[11px] font-semibold"
                    />
                </div>
            ) : <span className="text-sm font-semibold tabular-nums text-slate-500">未采集</span>}
        </div>
        {exportError && <p role="alert" className="mt-2 text-xs text-red-600">{exportError}</p>}
        {usage?.collected && <>
            <p className="mt-2 text-xs text-slate-500">输入 {tokenNumber(usage.inputTokens)} · 输出 {tokenNumber(usage.outputTokens)} · {usage.requestCount} 次模型请求</p>
            {!!usage.incompleteCount && <p className="mt-1 text-xs text-amber-700">另有 {usage.incompleteCount} 次用量不完整，合计仅包含已知消耗。</p>}
            <div className="mt-3 space-y-2">
                {usage.agents.map(agent => (
                    <div key={agent.key} className="flex flex-wrap justify-between gap-1 text-xs text-slate-600">
                        <span>{agent.name || '系统规划'}</span>
                        <div className="text-right">
                            <TokenModelTotals
                                largeModelTokens={agent.largeModelTokens}
                                decisionModelTokens={agent.decisionModelTokens}
                                className="justify-end text-[10px]"
                            />
                            <p className="text-[10px] text-slate-400">
                                合计 {tokenNumber(agent.totalTokens)} token · {agent.requestCount} 次请求
                                {agent.incompleteCount ? ` · ${agent.incompleteCount} 次不完整` : ''}
                            </p>
                        </div>
                    </div>
                ))}
            </div>
            {chain?.collected && chain.requestCount !== usage.requestCount && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-slate-500">
                        含后续执行的整条链 · 合计 {tokenNumber(chain.totalTokens)} token
                        {chain.incompleteCount ? `（${chain.incompleteCount} 次不完整）` : ''}
                    </p>
                    <TokenModelTotals
                        largeModelTokens={chain.largeModelTokens}
                        decisionModelTokens={chain.decisionModelTokens}
                        className="text-[10px]"
                    />
                </div>
            )}
        </>}
        <button onClick={() => setExpanded(value => !value)} aria-expanded={expanded} className="mt-3 text-xs font-medium text-orange-600 hover:underline">{expanded ? '收起模型请求' : '查看模型请求'}</button>
        {expanded && <div className="mt-3"><TokenRequestList filters={{all: '1', record_id: id}}/></div>}
        {flowOpen && <ExecutionObservatoryDialog recordId={id} taskName={taskName} startedAt={startedAt} onClose={() => setFlowOpen(false)}/>}
    </section>;
}
