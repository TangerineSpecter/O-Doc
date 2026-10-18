import {useState} from 'react';
import {ChevronDown, ChevronRight, RefreshCw} from 'lucide-react';
import {useTokenRequests} from '../../hooks/useTokenUsage';
import type {TokenFilters} from '../../types/api/tokenUsage';
import {purposeNames, requestStatus, tokenNumber, usageTime} from '../../utils/tokenUsage';
import TokenRequestContent from './TokenRequestContent';

export default function TokenRequestList({filters}: {filters: TokenFilters}) {
    const {result, loading, error, more, reload, retry} = useTokenRequests(filters);
    const [selected, setSelected] = useState('');

    return (
        <div className="space-y-2.5">
            <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-700">模型请求明细</h4>
                <button
                    onClick={reload}
                    disabled={loading}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-orange-600 hover:text-orange-700 disabled:opacity-40 transition-colors"
                >
                    <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
                    刷新明细
                </button>
            </div>

            {error && (
                <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-600">
                    <span>{error}</span>
                    <button onClick={retry} className="font-semibold underline hover:text-red-700">重试</button>
                </div>
            )}

            {result?.items.map(row => {
                const isComplete = row.usageComplete && row.status !== 'running';
                const statusName = requestStatus[row.status] || row.status;
                const isSuccess = row.status === 'success';
                const isFailed = row.status === 'failed';
                const isDecisionModel = row.modelType === 'decision_model';
                const modelTypeLabel = isDecisionModel ? '决策' : '大模型';
                const modelTypeClass = isDecisionModel
                    ? 'bg-violet-50 text-violet-700'
                    : 'bg-orange-50 text-orange-700';
                const tokenClass = isDecisionModel ? 'text-violet-600' : 'text-orange-600';

                return (
                    <article
                        key={row.id}
                        className="rounded-xl border border-slate-200/80 bg-white p-3 text-xs shadow-xs hover:border-slate-300 transition-colors"
                    >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-800">
                                    {row.agentName || '系统规划'}
                                </span>
                                <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] ${modelTypeClass}`}>
                                    <span className="font-semibold">{modelTypeLabel}</span>
                                    <span aria-hidden="true" className="text-slate-300">·</span>
                                    <span className="font-mono">{row.modelName || '未知模型'}</span>
                                </span>
                                <span
                                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                        isSuccess
                                            ? 'bg-emerald-50 text-emerald-600'
                                            : isFailed
                                              ? 'bg-red-50 text-red-600'
                                              : 'bg-amber-50 text-amber-600'
                                    }`}
                                >
                                    {statusName}
                                </span>
                            </div>
                            <span className={`font-bold tabular-nums ${tokenClass}`}>
                                {tokenNumber(row.totalTokens)} token
                            </span>
                        </div>

                        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-400">
                            <span>{usageTime(row.startedAt)}</span>
                            <span>{purposeNames[row.purpose] || row.purpose}</span>
                            <span>{row.providerName} · 第 {row.attempt} 次尝试</span>
                        </div>

                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 rounded-lg bg-slate-50/80 px-2.5 py-1.5 text-[11px] text-slate-600">
                            <span>输入 {tokenNumber(row.inputTokens)}</span>
                            <span>输出 {tokenNumber(row.outputTokens)}</span>
                            {row.cachedTokens !== null && (
                                <span>缓存 {tokenNumber(row.cachedTokens)}</span>
                            )}
                            {row.reasoningTokens !== null && (
                                <span>思考 {tokenNumber(row.reasoningTokens)}</span>
                            )}
                        </div>

                        <div className="mt-1.5 flex justify-end">
                            <button
                                type="button"
                                aria-expanded={selected === row.id}
                                onClick={() => setSelected(value => value === row.id ? '' : row.id)}
                                className="inline-flex items-center gap-1 whitespace-nowrap shrink-0 rounded-md px-2 py-1 text-[11px] font-medium text-orange-600 hover:bg-orange-50"
                            >
                                {selected === row.id ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                {selected === row.id ? '收起内容' : '查看输入与输出'}
                            </button>
                        </div>

                        {selected === row.id && <TokenRequestContent id={row.id} />}

                        {!isComplete && (
                            <p className="mt-1.5 text-[11px] text-amber-600">用量尚不完整，当前仅统计已知消耗</p>
                        )}
                    </article>
                );
            })}

            {!loading && !error && !result?.items.length && (
                <div className="rounded-xl border border-slate-100 bg-slate-50/50 py-6 text-center text-xs text-slate-400">
                    暂无已采集的模型请求
                </div>
            )}

            {loading && (
                <div className="py-3 text-center text-xs text-slate-400">
                    正在加载请求明细…
                </div>
            )}

            {result?.hasMore && (
                <button
                    disabled={loading}
                    onClick={more}
                    className="w-full rounded-xl border border-slate-200 bg-white py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                >
                    加载更多请求
                </button>
            )}
        </div>
    );
}
