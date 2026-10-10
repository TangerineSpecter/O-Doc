import {useState} from 'react';
import {ChevronDown, ChevronRight, Layers} from 'lucide-react';
import {useTokenExecutions} from '../../hooks/useTokenUsage';
import {useAgentRunRecord} from '../../hooks/useAgentRunRecord';
import type {TokenFilters} from '../../types/api/tokenUsage';
import {tokenNumber, usageTime} from '../../utils/tokenUsage';
import RunTokenUsage from './RunTokenUsage';
import TokenRequestList from './TokenRequestList';

function ExecutionUsage({id}: {id: string}) {
    const {record, error} = useAgentRunRecord(id);
    return error ? (
        <div className="space-y-2 rounded-xl bg-amber-50/60 p-3 border border-amber-200/70">
            <p className="text-xs text-amber-700">执行详情暂不可用；保留的请求用量仍可查看。</p>
            <TokenRequestList filters={{all: '1', record_id: id}}/>
        </div>
    ) : record ? (
        <RunTokenUsage id={id} usage={record.tokenUsage} chain={record.chainTokenUsage}/>
    ) : (
        <div className="p-3 text-center text-xs text-slate-400">正在读取执行用量…</div>
    );
}

export default function TokenUsageDetails({filters}: {filters: TokenFilters}) {
    const {result, loading, error, page, setPage, reload} = useTokenExecutions(filters);
    const [selected, setSelected] = useState('');

    return (
        <div className="space-y-4">
            <div>
                <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <Layers className="h-3.5 w-3.5 text-orange-500" />
                        任务执行记录
                    </h3>
                    {error && (
                        <button onClick={reload} className="text-xs text-red-600 hover:underline">
                            {error}，点击重试
                        </button>
                    )}
                </div>

                {loading ? (
                    <div className="py-4 text-center text-xs text-slate-400">正在加载执行记录…</div>
                ) : !result?.items.length ? (
                    <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 text-center text-xs text-slate-400">
                        此范围暂无任务执行；非任务调用可在下方请求明细中查看。
                    </div>
                ) : (
                    <div className="space-y-2">
                        {result.items.map(row => (
                            <div key={row.key} className="space-y-2">
                                <button
                                    onClick={() => setSelected(value => (value === row.key ? '' : row.key))}
                                    aria-expanded={selected === row.key}
                                    className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition-all ${
                                        selected === row.key
                                            ? 'border-orange-200 bg-orange-50/40 shadow-xs'
                                            : 'border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/40'
                                    }`}
                                >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div className="text-slate-400">
                                            {selected === row.key ? (
                                                <ChevronDown className="h-4 w-4 text-orange-500" />
                                            ) : (
                                                <ChevronRight className="h-4 w-4" />
                                            )}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="truncate text-xs font-bold text-slate-800">{row.name}</p>
                                            <span className="mt-0.5 block text-[11px] text-slate-400">{usageTime(row.lastAt)}</span>
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-xs font-bold tabular-nums text-orange-600">
                                            {tokenNumber(row.totalTokens)} token
                                        </p>
                                        <p className="text-[10px] text-slate-400">{row.requestCount} 次请求</p>
                                    </div>
                                </button>
                                {selected === row.key && <ExecutionUsage id={row.key} />}
                            </div>
                        ))}
                    </div>
                )}

                {!!result?.total && (
                    <div className="mt-2.5 flex items-center justify-between text-xs text-slate-500">
                        <button
                            disabled={page === 1 || loading}
                            onClick={() => setPage(v => Math.max(1, v - 1))}
                            className="rounded-lg border border-slate-200 px-2.5 py-1 text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-colors"
                        >
                            上一页
                        </button>
                        <span>第 {page} 页 · 共 {result.total} 次执行</span>
                        <button
                            disabled={!result.hasMore || loading}
                            onClick={() => setPage(v => v + 1)}
                            className="rounded-lg border border-slate-200 px-2.5 py-1 text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-colors"
                        >
                            下一页
                        </button>
                    </div>
                )}
            </div>

            <div className="border-t border-slate-100 pt-3">
                <TokenRequestList key={JSON.stringify(filters)} filters={filters} />
            </div>
        </div>
    );
}
