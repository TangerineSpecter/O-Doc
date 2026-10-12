import {useState} from 'react';
import {CalendarDays, ChevronDown, RefreshCw} from 'lucide-react';
import WorldDialog from '../WorldDialog';
import WorldOrbitLoader from '../WorldOrbitLoader';
import {Select} from '../../common/Select';
import {DateRangePicker, type DateRange} from '../../common/DateRangePicker';
import {useResidentAnalytics} from '../../../hooks/useResidentAnalytics';
import {analyticsRange, analyticsRangeError} from '../../../utils/residentAnalytics';
import type {AnalyticsPeriod} from '../../../utils/residentAnalytics';
import type {AnalyticsResident} from '../../../types/api/residentAnalytics';
import AgentAvatar from '../AgentAvatar';
import AnalyticsContent from './AnalyticsContent';

export default function ResidentAnalyticsDialog({
    initialActorId,
    initialResidents,
    onClose,
}: {
    initialActorId: string;
    initialResidents: AnalyticsResident[];
    onClose: () => void;
}) {
    const [actor, setActor] = useState(initialActorId);
    const [period, setPeriod] = useState<AnalyticsPeriod>('30');
    const [range, setRange] = useState(() => analyticsRange(30));
    const [refresh, setRefresh] = useState(0);

    const rangeError = analyticsRangeError(range.start_date, range.end_date);
    const analytics = useResidentAnalytics({...range, actor_id: actor}, refresh, !rangeError);
    const residents = analytics.residents.length ? analytics.residents : initialResidents;

    const currentResident = residents.find(row => row.id === actor);

    const currentDateRange: DateRange = {
        startDate: range.start_date,
        endDate: range.end_date,
    };

    const handleDateRangeChange = (newRange: DateRange | null) => {
        if (!newRange?.startDate || !newRange?.endDate) return;
        setRange({
            start_date: newRange.startDate,
            end_date: newRange.endDate,
        });
        const last7 = analyticsRange(7);
        const last30 = analyticsRange(30);
        if (newRange.startDate === last7.start_date && newRange.endDate === last7.end_date) {
            setPeriod('7');
        } else if (newRange.startDate === last30.start_date && newRange.endDate === last30.end_date) {
            setPeriod('30');
        } else {
            setPeriod('custom');
        }
    };

    const options = [
        {value: '', label: '全部居民'},
        ...residents.map(row => ({
            value: row.id,
            label: row.name + (row.departed ? (row.archived ? ' · 已归档' : ' · 历史居民') : ''),
        })),
    ];

    const dialogDescription = currentResident
        ? `正在查看「${currentResident.name}」的个人生活数据，从日常行为、创作往来和收支，看看居民这段时间的生活。`
        : '正在汇总全镇居民活跃、创作和交易账目数据，从日常行为、创作往来和收支，看看居民这段时间的生活。';

    return (
        <WorldDialog
            title="居民数据分析"
            description={dialogDescription}
            size="wide"
            onClose={onClose}
        >
            {/* 顶栏控制条 */}
            <div className="shrink-0 space-y-2.5 border-b border-slate-100 pb-3">
                <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                    {/* 左侧：居民选择与时间周期切换 */}
                    <div className="flex flex-wrap items-center gap-2.5">
                        <div className="w-full sm:w-44">
                            <Select
                                value={actor}
                                onChange={setActor}
                                options={options}
                                menuPortal
                                buttonClassName="!h-[34px] !min-h-[34px] !py-0 px-3 text-xs font-medium rounded-xl flex items-center"
                            />
                        </div>

                        {/* 周期切换胶囊分段控制器 */}
                        <div
                            className="inline-flex h-[34px] items-center rounded-xl bg-slate-100/90 p-0.5"
                            role="group"
                            aria-label="统计时间范围"
                        >
                            {(
                                [
                                    {key: '7', label: '近 7 天'},
                                    {key: '30', label: '近 30 天'},
                                    {key: 'custom', label: '自定义'},
                                ] as const
                            ).map(item => (
                                <button
                                    key={item.key}
                                    type="button"
                                    aria-pressed={period === item.key}
                                    onClick={() => {
                                        setPeriod(item.key);
                                        if (item.key !== 'custom') {
                                            setRange(analyticsRange(Number(item.key)));
                                        }
                                    }}
                                    className={`flex h-full items-center justify-center whitespace-nowrap rounded-lg px-3 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 ${
                                        period === item.key
                                            ? 'bg-white text-orange-600 shadow-2xs'
                                            : 'text-slate-500 hover:text-slate-800'
                                    }`}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </div>

                        {/* 自定义日期区间选择器 */}
                        {period === 'custom' && (
                            <DateRangePicker
                                value={currentDateRange}
                                onChange={handleDateRangeChange}
                                theme="orange"
                                trigger={({toggle, open, ref}) => (
                                    <button
                                        ref={ref}
                                        type="button"
                                        onClick={toggle}
                                        title="点击可在日历中自由挑选统计区间"
                                        className={`inline-flex h-[34px] items-center gap-1.5 rounded-xl border bg-white px-3 py-0 text-xs font-semibold text-slate-700 shadow-2xs transition-all hover:border-orange-300 hover:text-orange-600 active:scale-95 ${
                                            open ? 'border-orange-500 ring-2 ring-orange-500/20 text-orange-600' : 'border-slate-200/80'
                                        }`}
                                    >
                                        <CalendarDays className="h-3.5 w-3.5 text-orange-500"/>
                                        <span className="font-mono text-[11px] font-medium tracking-tight">
                                            {range.start_date} ~ {range.end_date}
                                        </span>
                                        <ChevronDown className={`h-3 w-3 text-slate-400 transition-transform ${open ? 'rotate-180 text-orange-500' : ''}`}/>
                                    </button>
                                )}
                            />
                        )}
                    </div>

                    {/* 右侧：刷新按钮 */}
                    <div className="flex items-center justify-end">
                        <button
                            type="button"
                            onClick={() => {
                                if (period !== 'custom') {
                                    setRange(analyticsRange(Number(period)));
                                }
                                setRefresh(value => value + 1);
                            }}
                            disabled={Boolean(rangeError) || analytics.loading}
                            className="inline-flex h-[34px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-0 text-xs font-semibold text-slate-700 shadow-2xs transition-all hover:border-orange-300 hover:text-orange-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            <RefreshCw className={`h-3.5 w-3.5 ${analytics.loading ? 'animate-spin' : ''}`}/>
                            <span>刷新</span>
                        </button>
                    </div>
                </div>

            {/* 居民上下文标识条（仅在选择具体居民时展示） */}
            {currentResident && (
                <div className="shrink-0 pt-2.5">
                    <div className="flex items-center justify-between rounded-xl bg-orange-50/60 px-3 py-1.5 text-xs text-orange-800 border border-orange-100">
                        <div className="flex items-center gap-2">
                            <AgentAvatar name={currentResident.name} avatar={currentResident.avatar} size="xs"/>
                            <span className="font-bold">{currentResident.name}</span>
                            <span className="text-[11px] text-orange-600/80">的个人生活档案</span>
                            {currentResident.departed && (
                                <span className="rounded bg-orange-200/60 px-1 py-0.2 text-[9px] text-orange-700">
                                    {currentResident.archived ? '已归档' : '历史居民'}
                                </span>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={() => setActor('')}
                            className="text-[11px] font-medium text-orange-600 underline-offset-2 hover:underline"
                        >
                            查看全部居民
                        </button>
                    </div>
                </div>
            )}
        </div>

            {/* 内容滚动展示区 */}
            <div
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-hide pt-3 pb-2"
                aria-busy={analytics.loading}
            >
                {rangeError ? (
                    <div role="alert" className="py-16 text-center text-xs text-rose-500">
                        <p>{rangeError}</p>
                    </div>
                ) : analytics.loading ? (
                    <WorldOrbitLoader title="正在整理居民的生活记录与日常账目"/>
                ) : analytics.error ? (
                    <div role="alert" className="py-16 text-center text-xs text-rose-500">
                        <p>{analytics.error}</p>
                        <button
                            type="button"
                            onClick={() => setRefresh(value => value + 1)}
                            className="mt-3 rounded-lg border border-orange-200 bg-white px-4 py-2 font-medium text-orange-600 shadow-xs hover:bg-orange-50"
                        >
                            重新加载
                        </button>
                    </div>
                ) : analytics.data ? (
                    <AnalyticsContent data={analytics.data}/>
                ) : null}
            </div>
        </WorldDialog>
    );
}
