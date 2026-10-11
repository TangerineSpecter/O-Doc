import WorldDialog from '../AgentWorld/WorldDialog';
import type {CombatHistory} from '../../types/api/combat';
import {statusLabels} from './presentation';
import {Clock, History, Sparkles} from 'lucide-react';

export default function CombatHistoryDialog({
    history,
    page,
    onPageChange,
    residentName,
    onObserve,
    onClose,
}: {
    history?: CombatHistory;
    page: number;
    onPageChange: (page: number | ((p: number) => number)) => void;
    residentName: string;
    onObserve: (id: string) => void;
    onClose: () => void;
}) {
    const list = history?.list || [];
    const total = history?.total || 0;

    return (
        <WorldDialog
            title={`历练史册 · ${residentName}`}
            description="查看该居民历次探索迷宫的详细战报与收获"
            size="default"
            onClose={onClose}
        >
            <div className="flex h-full min-h-0 flex-col justify-between space-y-3">
                <div className="scrollbar-hide flex-1 space-y-2.5 overflow-y-auto pr-0.5">
                    {list.map(run => (
                        <button
                            key={run.id}
                            type="button"
                            onClick={() => {
                                onClose();
                                onObserve(run.id);
                            }}
                            className="group block w-full rounded-2xl border border-slate-200 bg-white p-3.5 text-left shadow-2xs transition-all hover:border-orange-300 hover:shadow-xs active:scale-[0.99]"
                        >
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <span className="inline-flex items-center rounded-md border border-orange-200/60 bg-orange-50 px-2 py-0.5 text-xs font-bold text-orange-700">
                                        {statusLabels[run.status] || run.status}
                                    </span>
                                    <strong className="text-xs font-semibold text-slate-800 group-hover:text-orange-600 sm:text-sm">
                                        时长 {Math.floor(run.elapsedSeconds / 60)} 分钟
                                    </strong>
                                </div>
                                <span className="text-[11px] text-slate-400">
                                    {new Date(run.createdAt).toLocaleString('zh-CN')}
                                </span>
                            </div>
                            <p className="mt-2 text-xs leading-relaxed text-slate-500 line-clamp-2">
                                {run.result?.report || '探索任务已完成，点击查看详细战报与收获'}
                            </p>
                        </button>
                    ))}

                    {list.length === 0 && (
                        <div className="py-16 text-center text-xs text-slate-400">
                            <Clock className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                            <p className="font-semibold text-slate-600">暂无历练记录</p>
                            <p className="mt-1 text-slate-400">派遣居民出发探索迷宫后，将在此记录每次历练的战报与战利品。</p>
                        </div>
                    )}
                </div>

                {/* 分页控制器 */}
                {total > 20 && (
                    <div className="flex shrink-0 items-center justify-center gap-3 border-t border-slate-100 pt-2 text-xs text-slate-500">
                        <button
                            type="button"
                            disabled={page <= 1}
                            onClick={() => onPageChange(p => p - 1)}
                            className="rounded-lg bg-slate-100 px-3 py-1 hover:bg-slate-200 disabled:opacity-40"
                        >
                            上一页
                        </button>
                        <span>第 {page} 页 / 共 {Math.ceil(total / 20)} 页</span>
                        <button
                            type="button"
                            disabled={page * 20 >= total}
                            onClick={() => onPageChange(p => p + 1)}
                            className="rounded-lg bg-slate-100 px-3 py-1 hover:bg-slate-200 disabled:opacity-40"
                        >
                            下一页
                        </button>
                    </div>
                )}
            </div>
        </WorldDialog>
    );
}
