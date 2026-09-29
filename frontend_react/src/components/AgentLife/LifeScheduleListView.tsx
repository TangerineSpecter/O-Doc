import dayjs from 'dayjs';
import {Calendar, ChevronLeft, ChevronRight, Inbox} from 'lucide-react';
import type {LifeItem} from '../../types/api/agentLife';
import LifeScheduleCard from './LifeScheduleCard';

interface LifeScheduleListViewProps {
    items: LifeItem[];
    names: Map<string, string>;
    total: number;
    page: number;
    onPageChange: (page: number) => void;
    onSelectItem: (id: string) => void;
    dateKey: (value: string) => string;
    density?: 'compact' | 'normal';
}

const weekdayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export default function LifeScheduleListView({
    items,
    names,
    total,
    page,
    onPageChange,
    onSelectItem,
    dateKey,
    density = 'compact',
}: LifeScheduleListViewProps) {
    if (items.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white py-16 text-center shadow-xs">
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

    // 按日期将日程分组
    const groupedItems = items.reduce<Record<string, LifeItem[]>>((acc, item) => {
        const key = dateKey(item.scheduledAt);
        if (!acc[key]) acc[key] = [];
        acc[key].push(item);
        return acc;
    }, {});

    const sortedDates = Object.keys(groupedItems).sort();

    return (
        <div className="space-y-4">
            {sortedDates.map((dateStr) => {
                const dateObj = dayjs(dateStr);
                const dayItems = groupedItems[dateStr];
                const weekday = weekdayNames[dateObj.day()];

                return (
                    <div
                        key={dateStr}
                        className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs space-y-3"
                    >
                        {/* 日期分组标题 */}
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                            <div className="flex items-center gap-2">
                                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-50 text-orange-600 border border-orange-100/80 shadow-2xs">
                                    <Calendar className="h-4 w-4" />
                                </div>
                                <h3 className="text-xs font-bold text-slate-800">
                                    {dateObj.format('YYYY年MM月DD日')} {weekday}
                                </h3>
                            </div>
                            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-500">
                                {dayItems.length} 项日程安排
                            </span>
                        </div>

                        {/* 该日期的卡片列表：自适应流式网格，宽度收窄至 210~250px，卡片更高更规整 */}
                        <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(210px,250px))]">
                            {dayItems.map((item) => (
                                <LifeScheduleCard
                                    key={item.id}
                                    item={item}
                                    actorName={names.get(item.actorId) || '居民'}
                                    onClick={() => onSelectItem(item.id)}
                                    density={density}
                                    viewMode="list"
                                />
                            ))}
                        </div>
                    </div>
                );
            })}

            {/* 分页控制栏 */}
            {total > 100 && (
                <div className="flex items-center justify-between border-t border-slate-100 pt-4 text-xs">
                    <span className="text-slate-500">
                        第 {page} 页 · 共 {total} 个安排
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
