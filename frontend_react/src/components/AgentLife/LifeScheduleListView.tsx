import {useMemo} from 'react';
import {ChevronLeft, ChevronRight, Inbox} from 'lucide-react';
import type {LifeItem} from '../../types/api/agentLife';
import LifeScheduleCard from './LifeScheduleCard';
import {boardStatusColumns} from './lifeLabels';

interface LifeScheduleListViewProps {
    items: LifeItem[];
    names: Map<string, string>;
    total: number;
    page: number;
    onPageChange: (page: number) => void;
    onSelectItem: (id: string) => void;
    dateKey?: (value: string) => string;
    density?: 'compact' | 'normal';
    statusFilter?: string;
}

export default function LifeScheduleListView({
    items,
    names,
    total,
    page,
    onPageChange,
    onSelectItem,
    density = 'compact',
    statusFilter = '',
}: LifeScheduleListViewProps) {
    // 按状态对日程进行分类归档
    const groupedByStatus = useMemo(() => {
        const map = new Map<string, LifeItem[]>();
        for (const col of boardStatusColumns) {
            map.set(col.key, []);
        }
        for (const item of items) {
            const list = map.get(item.status);
            if (list) {
                list.push(item);
            } else {
                map.set(item.status, [item]);
            }
        }
        // 每列内部按计划时间升序排序
        map.forEach((list) => {
            list.sort(
                (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
            );
        });
        return map;
    }, [items]);

    // 计算活跃展示的状态列
    const activeColumns = useMemo(() => {
        if (statusFilter) {
            const matched = boardStatusColumns.find((c) => c.key === statusFilter);
            if (matched) return [matched];
        }
        // 核心状态（失败、已顺延、待执行、执行中、已完成、休息）始终列出，暂停/取消有数据时动态展示
        return boardStatusColumns.filter((col) => {
            if (['failed', 'deferred', 'pending', 'running', 'completed', 'rest'].includes(col.key)) {
                return true;
            }
            const count = groupedByStatus.get(col.key)?.length ?? 0;
            return count > 0;
        });
    }, [statusFilter, groupedByStatus]);

    if (items.length === 0) {
        return (
            <div className="flex flex-1 h-full min-h-0 flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white py-16 text-center shadow-xs">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-50 text-orange-500">
                    <Inbox className="h-6 w-6" />
                </div>
                <h4 className="mt-3 text-sm font-semibold text-slate-800">暂无符合条件的日程安排</h4>
                <p className="mt-1 text-xs text-slate-400">
                    在当前筛选条件或时间范围内没有找到居民生活安排
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-1 min-h-0 h-full flex-col overflow-hidden">
            {/* 状态看板泳道容器：支持平滑横向滚动，列内独立纵向滚动，隐藏原生滚动条 */}
            <div className="flex-1 min-h-0 h-full overflow-x-auto scrollbar-hide pb-0.5">
                <div className="flex h-full min-h-0 gap-3 w-full min-w-full">
                    {activeColumns.map((col) => {
                        const colItems = groupedByStatus.get(col.key) || [];
                        const isSingle = activeColumns.length === 1;

                        return (
                            <section
                                key={col.key}
                                className={`flex flex-col h-full min-h-0 rounded-2xl border p-2.5 transition-all ${
                                    col.columnBorder
                                } ${isSingle ? 'w-full' : 'flex-1 min-w-[220px]'}`}
                            >
                                {/* 状态列标题头 */}
                                <div
                                    className={`shrink-0 rounded-xl border p-2 px-2.5 flex items-center justify-between ${col.headerBg}`}
                                >
                                    <div className="flex items-center gap-2">
                                        <span className={`h-2 w-2 rounded-full ${col.dotClass}`} />
                                        <h3 className="text-xs font-bold">{col.label}</h3>
                                    </div>
                                    <span
                                        className={`rounded-full px-2 py-0.5 text-[11px] font-bold border shadow-2xs ${col.badgeClass}`}
                                    >
                                        {colItems.length}
                                    </span>
                                </div>

                                {/* 列内独立滚动卡片容器（严禁触发外部滚动，无原生滚动条） */}
                                <div className="mt-2.5 flex-1 min-h-0 overflow-y-auto scrollbar-hide space-y-2 pr-0.5">
                                    {colItems.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200/80 bg-white/50 py-10 text-center">
                                            <span className="text-xs text-slate-400">
                                                暂无{col.label}安排
                                            </span>
                                        </div>
                                    ) : (
                                        colItems.map((item) => (
                                            <LifeScheduleCard
                                                key={item.id}
                                                item={item}
                                                actorName={names.get(item.actorId) || '居民'}
                                                onClick={() => onSelectItem(item.id)}
                                                density={density}
                                                viewMode="list"
                                            />
                                        ))
                                    )}
                                </div>
                            </section>
                        );
                    })}
                </div>
            </div>

            {/* 分页控制栏 */}
            {total > 100 && (
                <div className="shrink-0 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs">
                    <span className="text-slate-500">
                        第 {page} 页 · 共 {total} 项安排
                    </span>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            disabled={page === 1}
                            onClick={() => onPageChange(page - 1)}
                            className="inline-flex shrink-0 whitespace-nowrap items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-40"
                        >
                            <ChevronLeft className="h-3.5 w-3.5 shrink-0" />
                            上一页
                        </button>
                        <button
                            type="button"
                            disabled={page * 100 >= total}
                            onClick={() => onPageChange(page + 1)}
                            className="inline-flex shrink-0 whitespace-nowrap items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-40"
                        >
                            下一页
                            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

