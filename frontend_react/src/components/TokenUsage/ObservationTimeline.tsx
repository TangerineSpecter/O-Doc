import {requestPhaseName} from '../../utils/tokenUsageLabels';
import {Check, Cpu, Download, FileText, Loader2, Sparkles} from 'lucide-react';
import type {ObservedActivity} from '../../utils/tokenObservatory';
import {knownTokens, observationTime} from '../../utils/tokenObservatory';
import {tokenNumber} from '../../utils/tokenUsage';

export default function ObservationTimeline({activities, selected, onSelect, showDate, onExport, exporting, exportDisabled, exportError}: {
    activities: ObservedActivity[]; selected?: string; onSelect: (id: string) => void; showDate: boolean;
    onExport?: () => void; exporting?: boolean; exportDisabled?: boolean; exportError?: string;
}) {
    const totalRequests = activities.reduce((sum, item) => sum + item.requests.length, 0);
    const factOnlyCount = activities.filter(item => item.requests.length === 0).length;

    return (
        <aside
            className="flex min-h-0 flex-col rounded-2xl border border-slate-200/90 bg-white shadow-2xs"
            aria-label="活动时间轴"
        >
            {/* 时间轴标题与简报 */}
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3">
                <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold text-slate-800">活动时序</h3>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                        {activities.length} 项
                    </span>
                    {onExport && <button type="button" onClick={onExport} disabled={exportDisabled || exporting}
                        aria-label={exporting ? '正在导出筛选活动的输入输出' : '导出筛选活动的输入输出'}
                        title={exportDisabled ? '观测数据尚未完整加载，请刷新后重试' : exporting ? '正在导出' : '导出筛选活动的输入输出'}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-orange-50 hover:text-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/50 disabled:cursor-not-allowed disabled:opacity-50">
                        {exporting ? <Loader2 className="h-4 w-4 animate-spin"/> : <Download className="h-4 w-4"/>}
                    </button>}
                </div>
                <div className="text-[10px] text-slate-400">
                    {totalRequests > 0 && <span>{totalRequests} 请求</span>}
                    {factOnlyCount > 0 && <span>{totalRequests > 0 ? ' · ' : ''}{factOnlyCount} 事实</span>}
                </div>
            </div>
            {exportError && <p role="alert" className="border-b border-red-100 bg-red-50 px-4 py-2 text-[11px] text-red-700">{exportError}</p>}

            {/* 滚动时间轴列表 */}
            <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto p-3">
                <ol className="relative space-y-2.5 before:absolute before:bottom-3 before:left-[11px] before:top-3 before:w-px before:bg-slate-200">
                    {activities.map(item => {
                        const isSelected = selected === item.id;
                        const hasRequests = item.requests.length > 0;
                        const hasFailed = item.requests.some(r => r.status === 'failed' || r.status === 'interrupted');
                        const isDecision = item.requests.some(r => r.modelType === 'decision_model');
                        const totalTokens = knownTokens(item.requests, 'totalTokens');

                        return (
                            <li key={item.id} className="relative pl-6">
                                {/* 时间轴节点 Marker */}
                                <span
                                    aria-hidden="true"
                                    className={`absolute left-1.5 top-3.5 flex h-4 w-4 -translate-x-1/2 items-center justify-center rounded-full border-2 border-white shadow-2xs transition-all ${
                                        isSelected
                                            ? 'bg-orange-500 text-white ring-4 ring-orange-100'
                                            : !hasRequests
                                            ? 'bg-emerald-500 text-white ring-2 ring-emerald-100'
                                            : hasFailed
                                            ? 'bg-red-500 text-white ring-2 ring-red-100'
                                            : isDecision
                                            ? 'bg-violet-500 text-white ring-2 ring-violet-100'
                                            : 'bg-orange-400 text-white ring-2 ring-orange-100'
                                    }`}
                                >
                                    {!hasRequests ? (
                                        <Check className="h-2.5 w-2.5 stroke-[3]" />
                                    ) : isDecision ? (
                                        <Cpu className="h-2.5 w-2.5 stroke-[2.5]" />
                                    ) : (
                                        <Sparkles className="h-2.5 w-2.5 stroke-[2.5]" />
                                    )}
                                </span>

                                {/* 活动卡片 */}
                                <button
                                    type="button"
                                    aria-pressed={isSelected}
                                    onClick={() => onSelect(item.id)}
                                    className={`group relative flex w-full flex-col rounded-xl border p-2.5 text-left transition-all ${
                                        isSelected
                                            ? 'border-orange-300 border-l-[3px] border-l-orange-500 bg-orange-50/40 shadow-xs ring-1 ring-orange-200'
                                            : 'border-slate-100 bg-slate-50/60 hover:border-slate-200 hover:bg-slate-50 hover:shadow-2xs'
                                    }`}
                                >
                                    {/* 顶部：时间与性质标签 */}
                                    <div className="flex items-center justify-between gap-1.5">
                                        <time
                                            dateTime={item.startedAt}
                                            className={`font-mono text-[11px] font-semibold tabular-nums ${
                                                isSelected ? 'text-orange-600' : 'text-slate-500'
                                            }`}
                                        >
                                            {observationTime(item.startedAt, showDate)}
                                        </time>
                                        {!hasRequests ? (
                                            <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                                                <FileText className="h-2.5 w-2.5" />
                                                业务事实
                                            </span>
                                        ) : (
                                            <span
                                                className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] font-medium ${
                                                    hasFailed
                                                        ? 'bg-red-50 text-red-600'
                                                        : isDecision
                                                        ? 'bg-violet-50 text-violet-700'
                                                        : 'bg-orange-50 text-orange-700'
                                                }`}
                                            >
                                                {item.requests.length} 次请求
                                            </span>
                                        )}
                                    </div>

                                    {/* 中间：活动标题 */}
                                    <p
                                        className={`mt-1.5 break-words text-xs transition-colors ${
                                            isSelected ? 'font-bold text-slate-900' : 'font-medium text-slate-800'
                                        }`}
                                    >
                                        {item.title}
                                    </p>

                                    {/* 底部：消耗信息或事实状态 */}
                                    <div className="mt-1.5 flex items-center justify-between gap-1 text-[10px]">
                                        {hasRequests ? (
                                            <>
                                                <span className="truncate text-slate-400">
                                                    {item.requests[0]?.agentName || (item.requests[0] ? requestPhaseName(item.requests[0]) : '模型任务')}
                                                </span>
                                                <span
                                                    className={`font-mono font-medium tabular-nums ${
                                                        isSelected ? 'text-orange-600' : 'text-slate-600'
                                                    }`}
                                                >
                                                    {tokenNumber(totalTokens)} token
                                                </span>
                                            </>
                                        ) : (
                                            <span className="text-slate-400">
                                                无模型请求 · 业务结果已归档
                                            </span>
                                        )}
                                    </div>
                                </button>
                            </li>
                        );
                    })}
                </ol>
            </div>
        </aside>
    );
}
