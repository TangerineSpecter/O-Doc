import {requestPhaseName} from '../../utils/tokenUsageLabels';
import {Activity, CheckCircle2, Cpu, Zap} from 'lucide-react';
import type {TokenRequest} from '../../types/api/tokenUsage';
import {knownTokens, clockTime} from '../../utils/tokenObservatory';
import {tokenNumber} from '../../utils/tokenUsage';

export default function ObservationOverview({requests, selected, onSelect, unavailable}: {
    requests: TokenRequest[]; selected?: string; onSelect: (request: TokenRequest) => void; unavailable: boolean;
}) {
    const tail = requests.slice(-24);
    const maximum = Math.max(1, ...tail.flatMap(r => [r.inputTokens || 0, r.outputTokens || 0]));
    const count = requests.length;
    const total = (field: 'inputTokens' | 'outputTokens' | 'totalTokens') => unavailable ? null : count ? knownTokens(requests, field) : 0;

    const failedCount = requests.filter(r => r.status === 'failed' || r.status === 'interrupted').length;
    const retryCount = requests.filter(r => r.attempt > 1).length;
    const completeCount = requests.filter(r => r.usageComplete && r.status !== 'running').length;

    return (
        <section
            aria-label="观测范围用量概览"
            className="shrink-0 rounded-xl border border-slate-200/90 bg-white p-2.5 shadow-2xs"
        >
            <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4 md:divide-x md:divide-slate-100">
                {/* 单元 1: 已知总消耗 */}
                <div className="flex items-center gap-2.5 px-1 sm:px-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
                        <Zap className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between text-[10px] text-slate-400">
                            <span>已知总消耗</span>
                            <span className="font-mono">token</span>
                        </div>
                        <div className="font-mono text-sm sm:text-base font-bold tabular-nums text-slate-900 leading-tight">
                            {tokenNumber(total('totalTokens'))}
                        </div>
                        <div className="truncate text-[10px] text-slate-400">
                            入 {tokenNumber(total('inputTokens'))} · 出 {tokenNumber(total('outputTokens'))}
                        </div>
                    </div>
                </div>

                {/* 单元 2: 真实模型请求 */}
                <div className="flex items-center gap-2.5 px-1 sm:px-2 md:pl-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                        <Cpu className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <div className="text-[10px] text-slate-400">真实模型请求</div>
                        <div className="font-mono text-sm sm:text-base font-bold tabular-nums text-slate-900 leading-tight">
                            {unavailable ? '未知' : count} <span className="text-[10px] font-normal text-slate-400">次</span>
                        </div>
                        <div className="truncate text-[10px]">
                            {failedCount > 0 ? (
                                <span className="font-medium text-red-600">{failedCount} 失败/中断</span>
                            ) : retryCount > 0 ? (
                                <span className="font-medium text-amber-600">{retryCount} 次重试</span>
                            ) : (
                                <span className="text-slate-400">全部正常完成</span>
                            )}
                        </div>
                    </div>
                </div>

                {/* 单元 3: 用量完整度 */}
                <div className="flex items-center gap-2.5 px-1 sm:px-2 md:pl-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <div className="text-[10px] text-slate-400">用量完整请求</div>
                        <div className="font-mono text-sm sm:text-base font-bold tabular-nums text-slate-900 leading-tight">
                            {unavailable ? '未知' : `${completeCount} / ${count}`}
                        </div>
                        <div className="truncate text-[10px] text-slate-400">
                            正文按需 · 不补零
                        </div>
                    </div>
                </div>

                {/* 单元 4: 逐请求迷你柱状图 */}
                <div className="flex flex-col justify-center px-1 sm:px-2 md:pl-3 min-w-0">
                    <div className="flex items-center justify-between text-[10px] text-slate-400 leading-none mb-1">
                        <span className="flex items-center gap-1">
                            <Activity className="h-3 w-3 text-slate-400" />
                            逐请求分布
                        </span>
                        <span className="text-[9px] flex items-center gap-1">
                            <span className="flex items-center gap-0.5"><span className="h-1.5 w-1.5 rounded-full bg-orange-400" />入</span>
                            <span className="flex items-center gap-0.5"><span className="h-1.5 w-1.5 rounded-full bg-slate-400" />出</span>
                        </span>
                    </div>
                    <div
                        className="flex h-7 items-end gap-0.5 overflow-hidden rounded bg-slate-50/70 p-0.5"
                        role="group"
                        aria-label="逐请求消耗微型图表"
                    >
                        {tail.length === 0 ? (
                            <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">
                                无模型请求
                            </div>
                        ) : (
                            tail.map((row, idx) => {
                                const isSelected = selected === row.id;
                                const inHeight = Math.max(2, ((row.inputTokens || 0) / maximum) * 22);
                                const outHeight = Math.max(2, ((row.outputTokens || 0) / maximum) * 22);
                                return (
                                    <button
                                        type="button"
                                        key={row.id}
                                        aria-label={`${requestPhaseName(row)}，输入 ${tokenNumber(row.inputTokens)}，输出 ${tokenNumber(row.outputTokens)}`}
                                        aria-pressed={isSelected}
                                        title={`#${idx + 1} ${requestPhaseName(row)} (${clockTime(row.startedAt)})\n入: ${tokenNumber(row.inputTokens)} / 出: ${tokenNumber(row.outputTokens)}`}
                                        onClick={() => onSelect(row)}
                                        className={`group relative flex h-full min-w-0 flex-1 items-end justify-center gap-px rounded-xs transition-all ${
                                            isSelected
                                                ? 'bg-slate-200/70 ring-1 ring-slate-700 shadow-2xs'
                                                : 'hover:bg-slate-200/70'
                                        }`}
                                    >
                                        <span
                                            className={`w-1 sm:w-1.5 rounded-t-xs transition-all ${
                                                row.inputTokens === null
                                                    ? 'bg-slate-200'
                                                    : isSelected
                                                    ? 'bg-orange-500'
                                                    : 'bg-orange-400 group-hover:bg-orange-500'
                                            }`}
                                            style={{height: `${inHeight}px`}}
                                        />
                                        <span
                                            className={`w-0.5 sm:w-1 rounded-t-xs transition-all ${
                                                row.outputTokens === null
                                                    ? 'bg-slate-200'
                                                    : isSelected
                                                    ? 'bg-slate-600'
                                                    : 'bg-slate-400 group-hover:bg-slate-500'
                                            }`}
                                            style={{height: `${outHeight}px`}}
                                        />
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
}
