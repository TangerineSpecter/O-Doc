import {useEffect, useRef, useState} from 'react';
import {Activity, Code, CornerDownRight, Database, Download, Layers, X} from 'lucide-react';
import {getPerformanceDetail, downloadPerformanceReport} from '@/api/performance';
import {useEscapeDismissal} from '@/hooks/useEscapeDismissal';
import type {PerformanceDetail as Detail} from '@/types/performance';
import {duration, percentage, statusBadge} from './format';

export function PerformanceDetail({id, onClose}: {id: string; onClose: () => void}) {
    const [data, setData] = useState<Detail | null>(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const pending = useRef<AbortController | null>(null);

    useEscapeDismissal(true, onClose);

    useEffect(() => {
        const controller = new AbortController();
        pending.current = controller;
        void getPerformanceDetail(id, controller.signal)
            .then(value => {
                if (!controller.signal.aborted) setData(value);
            })
            .catch(() => {
                if (!controller.signal.aborted) setError('样本读取失败，记录可能已清理。');
            });
        return () => controller.abort();
    }, [id]);

    const download = async () => {
        setBusy(true);
        setError('');
        try {
            await downloadPerformanceReport(id, pending.current?.signal);
        } catch {
            setError('诊断报告下载失败，请重试。');
        } finally {
            setBusy(false);
        }
    };

    const statusInfo = data ? statusBadge(data.event.status) : null;

    return (
        <div data-modal-scroll-lock className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={onClose}>
            <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="performance-detail-title"
                className="bg-white rounded-2xl w-full max-w-3xl max-h-[88vh] flex flex-col border border-slate-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
                    <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-50 text-orange-600 border border-orange-100/60 shrink-0">
                            <Activity className="h-4.5 w-4.5" />
                        </div>
                        <div>
                            <h2 id="performance-detail-title" className="font-bold text-slate-800 text-base">
                                性能记录明细
                            </h2>
                            <p className="text-xs text-slate-500 mt-0.5">
                                完整单次执行诊断证据与同类基线数据
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        aria-label="关闭性能明细"
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto scrollbar-hide space-y-5 text-sm text-slate-700">
                    {error && (
                        <div role="alert" className="bg-red-50 text-red-700 border border-red-200/80 rounded-xl p-3.5 text-xs font-medium">
                            {error}
                        </div>
                    )}
                    {!data && !error && (
                        <div className="py-12 flex flex-col items-center justify-center text-slate-400">
                            <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mb-3" />
                            <p className="text-xs">正在读取诊断证据…</p>
                        </div>
                    )}
                    {data && (
                        <>
                            {/* 操作概览与耗时 */}
                            <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 mb-1.5">
                                            {statusInfo && (
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${statusInfo.className}`}>
                                                    {statusInfo.label}
                                                </span>
                                            )}
                                            <span className="text-xs text-slate-500 font-mono">
                                                {new Date(data.event.started * 1000).toLocaleString()}
                                            </span>
                                        </div>
                                        <p className="font-mono text-xs font-semibold text-slate-900 break-all leading-relaxed">
                                            {data.event.operation}
                                        </p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <span className="text-2xl font-bold text-orange-600 font-mono tabular-nums">
                                            {duration(data.event.durationMs)}
                                        </span>
                                        <p className="text-[11px] text-slate-400 mt-0.5">总耗时</p>
                                    </div>
                                </div>
                            </div>

                            {/* 关键指标看板 */}
                            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div className="bg-white border border-slate-200/80 rounded-xl p-3">
                                    <dt className="text-[11px] text-slate-500 font-medium">SQL 次数 / 累计耗时</dt>
                                    <dd className="mt-1 text-xs font-bold text-slate-800 font-mono tabular-nums">
                                        {data.event.sqlCount} 次 / {duration(data.event.sqlMs)}
                                    </dd>
                                </div>
                                <div className="bg-white border border-slate-200/80 rounded-xl p-3">
                                    <dt className="text-[11px] text-slate-500 font-medium">发生时构建版本</dt>
                                    <dd className="mt-1 text-xs font-semibold text-slate-800 truncate" title={`${data.event.build.version || '未知'} · ${data.event.build.commit?.slice(0, 8) || 'commit 未采集'}`}>
                                        {data.event.build.version || '未知'} · {data.event.build.commit?.slice(0, 8) || '无 commit'}
                                    </dd>
                                </div>
                                <div className="bg-white border border-slate-200/80 rounded-xl p-3">
                                    <dt className="text-[11px] text-slate-500 font-medium">首输出 / 首块</dt>
                                    <dd className="mt-1 text-xs font-bold text-slate-800 font-mono tabular-nums">
                                        {duration(data.event.firstOutputMs)} / {duration(data.event.firstChunkMs)}
                                    </dd>
                                </div>
                                <div className="bg-white border border-slate-200/80 rounded-xl p-3">
                                    <dt className="text-[11px] text-slate-500 font-medium">同类基线错误率</dt>
                                    <dd className="mt-1 text-xs font-bold text-slate-800 tabular-nums">
                                        {percentage(data.baseline.allResults.errorRatio)}
                                        <span className="text-[10px] text-slate-400 font-normal ml-1">({data.baseline.allResults.count} 次)</span>
                                    </dd>
                                </div>
                            </dl>

                            {/* 代码调用位置 */}
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <Code className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                                    <h3 className="text-xs font-bold text-slate-700">代码位置追踪</h3>
                                </div>
                                {data.event.source?.length ? (
                                    <div className="bg-slate-900 text-slate-200 rounded-xl p-3 font-mono text-xs space-y-1 overflow-x-auto scrollbar-hide border border-slate-800">
                                        {data.event.source.map((source, index) => (
                                            <div key={index} className="flex items-center gap-2 text-slate-300">
                                                <span className="text-slate-500 select-none">#</span>
                                                <span className="text-orange-400">{source.file}</span>
                                                <span className="text-slate-500">:</span>
                                                <span className="text-amber-300">{source.line}</span>
                                                <span className="text-slate-400">· in</span>
                                                <span className="text-lime-300">{source.function}</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-xs text-slate-400 bg-slate-50 rounded-xl p-3 border border-slate-100">
                                        未采集到项目调用栈位置
                                    </p>
                                )}
                            </div>

                            {/* SQL 指纹 */}
                            {data.event.sql && (
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <Database className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                                        <h3 className="text-xs font-bold text-slate-700">SQL 结构指纹</h3>
                                    </div>
                                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/70 font-mono text-xs space-y-1">
                                        <p className="text-slate-800 break-all select-all">{data.event.sql.fingerprint}</p>
                                        <p className="text-[11px] text-slate-400 font-sans mt-1">{data.event.sql.templateReason || 'SQL 参数与模板已按安全策略脱敏'}</p>
                                    </div>
                                </div>
                            )}

                            {/* 执行子阶段瀑布 */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Layers className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                                        <h3 className="text-xs font-bold text-slate-700">执行阶段明细</h3>
                                    </div>
                                    <span className="text-[11px] text-slate-400">
                                        阶段可能并发重叠 · 截断 {data.event.truncated || 0} 项
                                    </span>
                                </div>

                                {data.event.children?.length ? (
                                    <div className="border border-slate-200/80 rounded-xl overflow-hidden divide-y divide-slate-100">
                                        {data.event.children.map(child => {
                                            const childBadge = statusBadge(child.status);
                                            return (
                                                <div key={child.id} className="p-3 bg-white hover:bg-slate-50/80 transition-colors flex items-center justify-between gap-3">
                                                    <div className="min-w-0 flex items-center gap-2">
                                                        <CornerDownRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                                        <span className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold border ${childBadge.className}`}>
                                                            {childBadge.label}
                                                        </span>
                                                        <span className="font-mono text-xs text-slate-800 break-all truncate">
                                                            {child.operation}
                                                        </span>
                                                    </div>
                                                    <span className="tabular-nums font-mono text-xs font-bold text-slate-700 shrink-0">
                                                        {duration(child.durationMs)}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <p className="text-xs text-slate-400 bg-slate-50 rounded-xl p-3 border border-slate-100">
                                        没有已记录的子阶段
                                    </p>
                                )}
                            </div>

                            {data.baseline.note && (
                                <p className="text-xs text-slate-400 leading-relaxed bg-slate-50/50 p-2.5 rounded-lg border border-slate-100">
                                    {data.baseline.note}
                                </p>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between">
                    <p className="text-[11px] text-slate-400 hidden sm:block">
                        导出的离线诊断包包含 report.md 与 evidence.json，可直接交付给代码助手分析。
                    </p>
                    <button
                        type="button"
                        onClick={() => void download()}
                        disabled={!data || busy}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-600 active:bg-orange-700 disabled:opacity-50 text-white rounded-xl text-xs font-medium transition-all shadow-sm shadow-orange-500/20 active:scale-95 whitespace-nowrap shrink-0 ml-auto"
                    >
                        <Download size={14} className="shrink-0" />
                        {busy ? '正在生成…' : '导出诊断报告'}
                    </button>
                </div>
            </section>
        </div>
    );
}
