import dayjs from 'dayjs';
import {Calendar} from 'lucide-react';
import type {LifeItem} from '../../types/api/agentLife';
import LifeScheduleCard from './LifeScheduleCard';

interface LifeScheduleWeekViewProps {
    loading?: boolean;
    error?: boolean;
    days: string[];
    items: LifeItem[];
    names: Map<string, string>;
    onSelectItem: (id: string) => void;
    dateKey: (value: string) => string;
    density?: 'compact' | 'normal';
}

const weekdayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export default function LifeScheduleWeekView({
    loading = false,
    error = false,
    days,
    items,
    names,
    onSelectItem,
    dateKey,
    density = 'compact',
}: LifeScheduleWeekViewProps) {
    const todayShanghai = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Asia/Shanghai',
    }).format(new Date());

    return (
        <div className="flex-1 min-h-0 h-full overflow-x-auto scrollbar-hide pb-0.5">
            <div className="grid min-w-[1080px] grid-cols-7 gap-2.5 h-full min-h-0">
                {days.map((day) => {
                    const dayDate = dayjs(day);
                    const isToday = day === todayShanghai;
                    const dayItems = items.filter((i) => dateKey(i.scheduledAt) === day);
                    const weekdayIndex = dayDate.day();
                    const isWeekend = weekdayIndex === 0 || weekdayIndex === 6;

                    return (
                        <section
                            key={day}
                            className={`flex flex-col h-full min-h-0 rounded-2xl p-2 transition-all ${
                                isToday
                                    ? 'bg-gradient-to-b from-orange-50/70 to-orange-50/20 border-2 border-orange-300 shadow-xs'
                                    : 'bg-slate-50/80 border border-slate-200/80'
                            }`}
                        >
                            {/* 列头部（固定吸顶） */}
                            <div className="shrink-0 border-b border-slate-200/60 pb-2 px-1">
                                <div className="flex items-center justify-between">
                                    <span
                                        className={`text-xs font-semibold ${
                                            isToday
                                                ? 'text-orange-700'
                                                : isWeekend
                                                  ? 'text-slate-500'
                                                  : 'text-slate-700'
                                        }`}
                                    >
                                        {weekdayNames[weekdayIndex]}
                                    </span>
                                    {isToday && (
                                        <span className="rounded-full bg-orange-500 px-1.5 py-0.5 text-[9px] font-bold text-white shadow-2xs">
                                            今天
                                        </span>
                                    )}
                                    {!isToday && dayItems.length > 0 && (
                                        <span className="rounded-full bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                                            {dayItems.length}
                                        </span>
                                    )}
                                </div>
                                <div className="mt-0.5 flex items-baseline justify-between">
                                    <span
                                        className={`text-sm font-bold font-mono ${
                                            isToday ? 'text-orange-600' : 'text-slate-900'
                                        }`}
                                    >
                                        {dayDate.format('MM-DD')}
                                    </span>
                                    {dayItems.length > 0 && (
                                        <span className="text-[10px] text-slate-400">
                                            {dayItems.length} 项日程
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* 列日程卡片容器（列内独立滚动，绝不触发外层滚动，无右侧滚动条） */}
                            <div className="mt-2 flex-1 min-h-0 overflow-y-auto scrollbar-hide space-y-1.5 pr-0.5">
                                {dayItems.length > 0 ? (
                                    dayItems.map((item) => (
                                        <LifeScheduleCard
                                            key={item.id}
                                            item={item}
                                            actorName={names.get(item.actorId) || '居民'}
                                            onClick={() => onSelectItem(item.id)}
                                            density={density}
                                            viewMode="week"
                                        />
                                    ))
                                ) : (
                                    <div className="flex h-20 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200/80 bg-white/40 p-2 text-center">
                                        <Calendar className="h-3.5 w-3.5 text-slate-300" />
                                        <span className="mt-1 text-[10px] text-slate-400">{loading ? '正在加载…' : error ? '日程加载失败' : '暂无安排'}</span>
                                    </div>
                                )}
                            </div>
                        </section>
                    );
                })}
            </div>
        </div>
    );
}
