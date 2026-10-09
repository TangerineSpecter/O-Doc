import {useEffect, useState} from 'react';
import dayjs from 'dayjs';
import {
    CalendarDays,
    Columns3,
    SlidersHorizontal,
    ChevronLeft,
    ChevronRight,
    RefreshCw,
    UserCircle,
    RotateCcw,
    Minimize2,
    Maximize2,
} from 'lucide-react';
import WorldDialog from '../AgentWorld/WorldDialog';
import {Select} from '../common/Select';
import {getLifeAgents, getLifeConfig} from '../../api/agentLife';
import type {AgentConfig} from '../../types/api/setting';
import {useAgentLifeSchedule} from '../../hooks/useAgentLifeSchedule';
import LifeItemDetails from './LifeItemDetails';
import LifeFailedReplanBar from './LifeFailedReplanBar';
import LifeProfilePanel from './LifeProfilePanel';
import LifeScheduleWeekView from './LifeScheduleWeekView';
import LifeScheduleListView from './LifeScheduleListView';
import {statusLabels} from './lifeLabels';

const dateKey = (value: string) =>
    new Intl.DateTimeFormat('sv-SE', {timeZone: 'Asia/Shanghai'}).format(new Date(value));

const getThisMonday = () => {
    const today = dayjs(dateKey(new Date().toISOString()));
    return today.subtract((today.day() + 6) % 7, 'day').format('YYYY-MM-DD');
};

export default function LifeScheduleDialog({onClose}: {onClose: () => void}) {
    const thisMonday = getThisMonday();
    const [start, setStart] = useState(thisMonday);
    const [actorId, setActorId] = useState('');
    const [status, setStatus] = useState('');
    const [mode, setMode] = useState<'week' | 'list' | 'profile'>('week');
    const [density, setDensity] = useState<'compact' | 'normal'>('compact');
    const [agents, setAgents] = useState<AgentConfig[]>([]);
    const [selected, setSelected] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [setupError, setSetupError] = useState('');

    const end = dayjs(start).add(7, 'day').format('YYYY-MM-DD');
    const endDisplay = dayjs(end).subtract(1, 'day').format('YYYY-MM-DD');
    const isThisWeek = start === thisMonday;

    const schedule = useAgentLifeSchedule(start, end, actorId, status, page, mode === 'week' ? 'week' : 'list');

    useEffect(() => {
        const c = new AbortController();
        Promise.all([getLifeAgents(c.signal), getLifeConfig(c.signal)])
            .then(([values, config]) => {
                if (!c.signal.aborted) {
                    setAgents(
                        values.filter((a) =>
                            (config.profileAgentIds || config.settings.agentIds).includes(a.id)
                        )
                    );
                }
            })
            .catch((e) => {
                if (!c.signal.aborted) setSetupError(e.message || '居民加载失败');
            });
        return () => c.abort();
    }, []);

    const names = new Map(agents.map((a) => [a.id, a.name]));
    const days = Array.from({length: 7}, (_, index) =>
        dayjs(start).add(index, 'day').format('YYYY-MM-DD')
    );

    return (
        <WorldDialog
            title="居民生活日程"
            description="上海时间 · 计划根据实际经历持续调整"
            onClose={onClose}
            size="extra-wide"
        >
            <div className="flex h-full flex-col min-h-0 space-y-2.5 overflow-hidden">
                {/* 顶部主控制栏：分段选项卡与全局筛选器 */}
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50/50 p-2.5">
                    {/* 视图模式分段控制器 */}
                    <div className="flex items-center rounded-lg bg-slate-200/60 p-1">
                        <button
                            type="button"
                            onClick={() => setMode('week')}
                            className={`inline-flex shrink-0 whitespace-nowrap items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-all ${
                                mode === 'week'
                                    ? 'bg-white font-semibold text-slate-800 shadow-2xs'
                                    : 'font-medium text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                            <span>周日程</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setMode('list')}
                            className={`inline-flex shrink-0 whitespace-nowrap items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-all ${
                                mode === 'list'
                                    ? 'bg-white font-semibold text-slate-800 shadow-2xs'
                                    : 'font-medium text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            <Columns3 className="h-3.5 w-3.5 shrink-0" />
                            <span>状态看板</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setMode('profile')}
                            className={`inline-flex shrink-0 whitespace-nowrap items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-all ${
                                mode === 'profile'
                                    ? 'bg-white font-semibold text-slate-800 shadow-2xs'
                                    : 'font-medium text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />
                            <span>偏好与目标</span>
                        </button>
                    </div>

                    {/* 筛选下拉与操作 */}
                    <div className="flex flex-wrap items-center gap-2">
                        {/* 居民筛选 */}
                        <div className="w-36">
                            <Select
                                menuPortal
                                value={actorId}
                                options={[
                                    {value: '', label: '全部居民'},
                                    ...agents.map((a) => ({value: a.id, label: a.name})),
                                ]}
                                onChange={(v) => {
                                    setActorId(v);
                                    setPage(1);
                                }}
                                buttonClassName="!py-1.5 text-xs"
                            />
                        </div>

                        {/* 状态筛选 */}
                        {mode !== 'profile' && (
                            <div className="w-32">
                                <Select
                                    menuPortal
                                    value={status}
                                    options={[
                                        {value: '', label: '全部状态'},
                                        ...Object.entries(statusLabels).map(([value, label]) => ({
                                            value,
                                            label,
                                        })),
                                    ]}
                                    onChange={(v) => {
                                        setStatus(v);
                                        setPage(1);
                                    }}
                                    buttonClassName="!py-1.5 text-xs"
                                />
                            </div>
                        )}

                        {/* 刷新按钮 */}
                        <button
                            type="button"
                            onClick={schedule.refresh}
                            title="刷新数据"
                            className="inline-flex shrink-0 whitespace-nowrap items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-2xs transition-all hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600 active:scale-95"
                        >
                            <RefreshCw
                                className={`h-3.5 w-3.5 shrink-0 ${schedule.loading ? 'animate-spin text-orange-500' : ''}`}
                            />
                            <span>刷新</span>
                        </button>
                    </div>
                </div>

                {setupError && (
                    <div
                        role="alert"
                        className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700"
                    >
                        {setupError}
                    </div>
                )}

                {/* 偏好与目标面板 */}
                {mode === 'profile' ? (
                    <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide pr-0.5">
                        {actorId ? (
                            <LifeProfilePanel key={actorId} actorId={actorId} />
                        ) : (
                            <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white py-16 text-center shadow-xs">
                                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-50 text-orange-500">
                                    <UserCircle className="h-7 w-7" />
                                </div>
                                <h4 className="mt-3 text-sm font-semibold text-slate-800">
                                    请选择一位居民
                                </h4>
                                <p className="mt-1 text-xs text-slate-400">
                                    请在上方下拉菜单中选择居民，以查看并配置其生活偏好和远期目标
                                </p>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-1 min-h-0 flex-col space-y-2.5 overflow-hidden">
                        {/* 日期周翻页与统计条 */}
                        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-xs border border-slate-100">
                            {/* 日期切换导航 */}
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setStart(
                                            dayjs(start).subtract(7, 'day').format('YYYY-MM-DD')
                                        );
                                        setPage(1);
                                    }}
                                    className="inline-flex shrink-0 whitespace-nowrap items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-600 shadow-2xs transition-colors hover:bg-slate-50 hover:text-slate-900 active:scale-95"
                                >
                                    <ChevronLeft className="h-3.5 w-3.5 shrink-0" />
                                    <span>上一周</span>
                                </button>

                                <span className="font-mono font-semibold text-slate-800">
                                    {start} — {endDisplay}
                                </span>

                                <button
                                    type="button"
                                    onClick={() => {
                                        setStart(end);
                                        setPage(1);
                                    }}
                                    className="inline-flex shrink-0 whitespace-nowrap items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-600 shadow-2xs transition-colors hover:bg-slate-50 hover:text-slate-900 active:scale-95"
                                >
                                    <span>下一周</span>
                                    <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                                </button>

                                {!isThisWeek ? (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setStart(thisMonday);
                                            setPage(1);
                                        }}
                                        className="inline-flex shrink-0 whitespace-nowrap items-center gap-1 rounded-lg border border-orange-200 bg-orange-50 px-2 py-1 text-[11px] font-medium text-orange-600 shadow-2xs transition-colors hover:bg-orange-100 active:scale-95"
                                    >
                                        <RotateCcw className="h-3 w-3 shrink-0" />
                                        <span>回到本周</span>
                                    </button>
                                ) : (
                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                                        本周
                                    </span>
                                )}
                            </div>

                            {/* 右侧：统计、加载状态与紧凑/详细密度切换 */}
                            <div className="flex items-center gap-3">
                                {/* 密度切换开关 */}
                                <div className="flex items-center rounded-lg bg-slate-100 p-0.5">
                                    <button
                                        type="button"
                                        onClick={() => setDensity('compact')}
                                        title="紧凑模式（适合高频日程一屏查看）"
                                        className={`inline-flex shrink-0 whitespace-nowrap items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-all ${
                                            density === 'compact'
                                                ? 'bg-white font-semibold text-slate-800 shadow-2xs'
                                                : 'text-slate-500 hover:text-slate-700'
                                        }`}
                                    >
                                        <Minimize2 className="h-3 w-3 shrink-0" />
                                        <span>紧凑</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setDensity('normal')}
                                        title="详细模式（展示更多意图与预算明细）"
                                        className={`inline-flex shrink-0 whitespace-nowrap items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-all ${
                                            density === 'normal'
                                                ? 'bg-white font-semibold text-slate-800 shadow-2xs'
                                                : 'text-slate-500 hover:text-slate-700'
                                        }`}
                                    >
                                        <Maximize2 className="h-3 w-3 shrink-0" />
                                        <span>详细</span>
                                    </button>
                                </div>

                                {schedule.loading ? (
                                    <div className="inline-flex items-center gap-1.5 text-slate-400">
                                        <div className="h-3 w-3 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
                                        <span>正在加载…</span>
                                    </div>
                                ) : (
                                    <span className="text-slate-500">
                                        共 <strong className="font-semibold text-slate-700">{schedule.data.total}</strong> 项安排
                                    </span>
                                )}
                            </div>
                        </div>

                        {schedule.error && (
                            <div
                                role="alert"
                                className="shrink-0 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700"
                            >
                                {schedule.error}
                            </div>
                        )}

                        {actorId ? (
                            <LifeFailedReplanBar actorId={actorId} start={start} end={end} onDone={schedule.refresh} />
                        ) : null}

                        {/* 视图展示 */}
                        <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
                            {mode === 'week' ? (
                                <div className="flex min-h-0 flex-1 flex-col gap-2">
                                    <LifeScheduleWeekView
                                        loading={schedule.loading}
                                        error={Boolean(schedule.error)}
                                        days={days}
                                        items={schedule.data.items}
                                        names={names}
                                        onSelectItem={setSelected}
                                        dateKey={dateKey}
                                        density={density}
                                    />
                                </div>
                            ) : (
                                <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
                                    <LifeScheduleListView
                                        items={schedule.data.items}
                                        names={names}
                                        total={schedule.data.total}
                                        page={page}
                                        onPageChange={setPage}
                                        onSelectItem={setSelected}
                                        dateKey={dateKey}
                                        density={density}
                                        statusFilter={status}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* 安排详情弹窗 */}
            {selected && (
                <LifeItemDetails
                    id={selected}
                    onClose={() => setSelected(null)}
                    onChanged={schedule.refresh}
                />
            )}
        </WorldDialog>
    );
}
