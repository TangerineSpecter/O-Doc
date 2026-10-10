import type {ElementType} from 'react';
import {useEffect, useMemo, useRef, useState} from 'react';
import {
    AlertTriangle,
    ArrowDownLeft,
    ArrowLeft,
    ArrowUpRight,
    BarChart3,
    BookOpen,
    CalendarClock,
    CheckCircle2,
    ChevronRight,
    Compass,
    Cpu,
    Database,
    Download,
    GraduationCap,
    Heart,
    Info,
    MessageCircle,
    MessageSquare,
    RefreshCw,
    Send,
    ShoppingBag,
    Sparkles,
    Sprout,
    TrendingUp,
    UserRound,
    Zap,
} from 'lucide-react';
import {Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts';
import WorldDialog from '../AgentWorld/WorldDialog';
import AgentAvatar from '../AgentWorld/AgentAvatar';
import {Select} from '../common/Select';
import {useTokenUsage} from '../../hooks/useTokenUsage';
import {useTokenUsageExport} from '../../hooks/useTokenUsageExport';
import {getAgents, getAgentTasks} from '../../api/setting';
import type {TokenFilters, TokenGroup} from '../../types/api/tokenUsage';
import {purposeNames, shanghaiDay, tokenDateRange, tokenNumber} from '../../utils/tokenUsage';
import TokenUsageDetails from './TokenUsageDetails';

function TokenUsageInfoButton() {
    const [open, setOpen] = useState(false);
    const popoverRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [open]);

    return (
        <div
            ref={popoverRef}
            className="relative inline-flex items-center"
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
        >
            <button
                type="button"
                aria-label="查看用量统计说明"
                onClick={() => setOpen(v => !v)}
                className="inline-flex items-center justify-center rounded-full p-1 text-slate-400 hover:bg-orange-50 hover:text-orange-600 focus:outline-hidden transition-colors"
            >
                <Info className="h-4 w-4" />
            </button>

            {open && (
                <div className="absolute left-0 top-full mt-1.5 z-50 w-72 sm:w-80 rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-xl text-xs text-slate-600 animate-in fade-in duration-150">
                    <div className="flex items-center gap-1.5 font-bold text-slate-800 mb-2">
                        <Info className="h-3.5 w-3.5 text-orange-500" />
                        <span>用量统计说明</span>
                    </div>
                    <div className="rounded-lg bg-orange-50/70 p-2 text-[11px] text-orange-800 border border-orange-100 mb-2 font-medium">
                        Agent 模型请求 · 北京时间 · 生图不计入
                    </div>
                    <p className="text-[11px] leading-relaxed text-slate-500">
                        总量只累计接口返回的已知 Token；未知用量不记为零。历史未采集记录不补估算。
                    </p>
                </div>
            )}
        </div>
    );
}

interface TaskTheme {
    icon: ElementType;
    className: string;
}

function getTaskTheme(
    taskKey: string,
    taskName: string,
    taskMap: Record<string, {taskKind?: string; name: string}>
): TaskTheme {
    const kind = taskMap[taskKey]?.taskKind || '';
    const name = taskName.toLowerCase();

    if (
        kind === 'cooking' ||
        name.includes('美食') ||
        name.includes('烹饪') ||
        name.includes('料理') ||
        name.includes('食谱')
    ) {
        return {icon: BookOpen, className: 'bg-orange-50 text-orange-600 border border-orange-200/80'};
    }
    if (
        kind === 'investment' ||
        name.includes('投资') ||
        name.includes('股票') ||
        name.includes('a股') ||
        name.includes('理财')
    ) {
        return {icon: TrendingUp, className: 'bg-emerald-50 text-emerald-600 border border-emerald-200/80'};
    }
    if (
        kind === 'market' ||
        name.includes('市场') ||
        name.includes('交易') ||
        name.includes('集市') ||
        name.includes('购物')
    ) {
        return {icon: ShoppingBag, className: 'bg-amber-50 text-amber-600 border border-amber-200/80'};
    }
    if (
        kind === 'farm' ||
        name.includes('农场') ||
        name.includes('种植') ||
        name.includes('播种') ||
        name.includes('耕作')
    ) {
        return {icon: Sprout, className: 'bg-lime-50 text-lime-700 border border-lime-200/80'};
    }
    if (
        kind === 'travel' ||
        name.includes('旅行') ||
        name.includes('探索') ||
        name.includes('游历') ||
        name.includes('漫游')
    ) {
        return {icon: Compass, className: 'bg-cyan-50 text-cyan-600 border border-cyan-200/80'};
    }
    if (
        kind === 'post_publish' ||
        name.includes('发帖') ||
        name.includes('发布') ||
        name.includes('自主选题')
    ) {
        return {icon: Send, className: 'bg-indigo-50 text-indigo-600 border border-indigo-200/80'};
    }
    if (
        kind === 'post_interaction' ||
        name.includes('评论') ||
        name.includes('互动') ||
        name.includes('打分') ||
        name.includes('阅读帖子')
    ) {
        return {icon: MessageSquare, className: 'bg-blue-50 text-blue-600 border border-blue-200/80'};
    }
    return {icon: CalendarClock, className: 'bg-slate-100 text-slate-600 border border-slate-200/80'};
}

function getPurposeTheme(key: string): {icon: ElementType; className: string} {
    switch (key) {
        case 'preview':
            return {icon: Send, className: 'bg-indigo-50 text-indigo-600 border border-indigo-200/80'};
        case 'task':
            return {icon: CalendarClock, className: 'bg-blue-50 text-blue-600 border border-blue-200/80'};
        case 'planning':
            return {icon: CalendarClock, className: 'bg-purple-50 text-purple-600 border border-purple-200/80'};
        case 'im':
            return {icon: MessageCircle, className: 'bg-sky-50 text-sky-600 border border-sky-200/80'};
        case 'memory':
            return {icon: Database, className: 'bg-teal-50 text-teal-600 border border-teal-200/80'};
        case 'social':
            return {icon: Heart, className: 'bg-rose-50 text-rose-600 border border-rose-200/80'};
        case 'profile':
            return {icon: UserRound, className: 'bg-amber-50 text-amber-600 border border-amber-200/80'};
        case 'learning':
            return {icon: GraduationCap, className: 'bg-emerald-50 text-emerald-600 border border-emerald-200/80'};
        default:
            return {icon: Sparkles, className: 'bg-orange-50 text-orange-600 border border-orange-200/80'};
    }
}

export default function TokenUsageDialog({onClose}: {onClose: () => void}) {
    const [period, setPeriod] = useState('today');
    const [start, setStart] = useState(shanghaiDay);
    const [end, setEnd] = useState(shanghaiDay);
    const [agent, setAgent] = useState('');
    const [task, setTask] = useState('');
    const [group, setGroup] = useState('agent');
    const [page, setPage] = useState(1);
    const [refresh, setRefresh] = useState(0);
    const [focus, setFocus] = useState<{name: string; filters: TokenFilters} | null>(null);

    // 加载 Agent 配置（获取 avatar 头像）与任务配置（获取 taskKind 及对应 SVG 图标）
    const [agentMap, setAgentMap] = useState<Record<string, {avatar?: string; name: string}>>({});
    const [taskMap, setTaskMap] = useState<Record<string, {taskKind?: string; name: string}>>({});

    useEffect(() => {
        let active = true;
        Promise.allSettled([getAgents(), getAgentTasks()]).then(([agentsRes, tasksRes]) => {
            if (!active) return;
            if (agentsRes.status === 'fulfilled' && Array.isArray(agentsRes.value)) {
                const map: Record<string, {avatar?: string; name: string}> = {};
                for (const item of agentsRes.value) {
                    if (item.id) map[item.id] = {avatar: item.avatar, name: item.name};
                }
                setAgentMap(map);
            }
            if (tasksRes.status === 'fulfilled' && Array.isArray(tasksRes.value)) {
                const map: Record<string, {taskKind?: string; name: string}> = {};
                for (const item of tasksRes.value) {
                    if (item.id) map[item.id] = {taskKind: item.taskKind, name: item.name};
                }
                setTaskMap(map);
            }
        });
        return () => {
            active = false;
        };
    }, []);

    // 全局筛选（概览与趋势），不混入列表分组参数以防切换 tab 造成概览刷新与闪烁
    const filters: TokenFilters = useMemo(
        () => ({
            ...tokenDateRange(period, start, end),
            ...(agent ? {agent_id: agent === '__system__' ? '' : agent} : {}),
            ...(task ? {task_id: task} : {}),
        }),
        [period, start, end, agent, task]
    );

    const {summary, groups, loading, summaryLoading, groupsLoading, error, agents, tasks} = useTokenUsage(
        filters,
        group,
        page,
        refresh
    );
    const {exporting, exportError, download} = useTokenUsageExport(filters);

    const reset = () => {
        setPage(1);
        setFocus(null);
    };

    const inspect = (row: TokenGroup) =>
        setFocus({
            name: group === 'purpose' ? purposeNames[row.key] || row.name : row.name || '系统规划',
            filters: {
                ...filters,
                ...(group === 'agent'
                    ? {agent_id: row.key}
                    : group === 'task'
                      ? {task_id: row.key}
                      : {purpose: row.key, other: '1'}),
            },
        });

    const fieldClass =
        'min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 shadow-xs focus:border-orange-500 focus:outline-none';

    const totalTokens = summary?.totalTokens ?? 0;
    const inputTokens = summary?.inputTokens ?? 0;
    const outputTokens = summary?.outputTokens ?? 0;
    const requestCount = summary?.requestCount ?? 0;
    const incompleteCount = summary?.incompleteCount ?? 0;

    const inputPercent = totalTokens > 0 ? ((inputTokens / totalTokens) * 100).toFixed(1) : null;
    const outputPercent = totalTokens > 0 ? ((outputTokens / totalTokens) * 100).toFixed(1) : null;

    const peakDay = summary?.days?.length
        ? summary.days.reduce((max, d) => (d.totalTokens > max.totalTokens ? d : max), summary.days[0])
        : null;

    return (
        <WorldDialog
            title="用量统计"
            titleAction={<TokenUsageInfoButton />}
            onClose={onClose}
            size="extra-wide"
        >
            <div className="space-y-4">
                {/* 顶部全局筛选条 */}
                <div className="flex flex-wrap items-center gap-2">
                    <div className="w-32">
                        <Select
                            menuPortal
                            value={period}
                            onChange={value => {
                                setPeriod(value);
                                reset();
                            }}
                            options={[
                                {value: 'today', label: '今天'},
                                {value: '7', label: '近 7 天'},
                                {value: '30', label: '近 30 天'},
                                {value: 'custom', label: '自定义日期'},
                                {value: 'all', label: '全部历史'},
                            ]}
                        />
                    </div>
                    {period === 'custom' && (
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <input
                                aria-label="开始日期"
                                type="date"
                                className={fieldClass}
                                value={start}
                                max={end}
                                onChange={event => {
                                    setStart(event.target.value);
                                    reset();
                                }}
                            />
                            <span className="text-xs text-slate-400">至</span>
                            <input
                                aria-label="结束日期"
                                type="date"
                                className={fieldClass}
                                value={end}
                                min={start}
                                onChange={event => {
                                    setEnd(event.target.value);
                                    reset();
                                }}
                            />
                        </div>
                    )}
                    <div className="w-40">
                        <Select
                            menuPortal
                            value={agent}
                            onChange={value => {
                                setAgent(value);
                                reset();
                            }}
                            options={[
                                {value: '', label: '全部 Agent'},
                                ...agents.map(row => ({
                                    value: row.agentKey || '__system__',
                                    label: row.name || '系统规划',
                                })),
                            ]}
                        />
                    </div>
                    <div className="w-40">
                        <Select
                            menuPortal
                            value={task}
                            onChange={value => {
                                setTask(value);
                                reset();
                            }}
                            options={[
                                {value: '', label: '全部任务'},
                                ...tasks.map(row => ({value: row.taskKey, label: row.name})),
                            ]}
                        />
                    </div>
                    <button
                        type="button"
                        disabled={exporting}
                        onClick={() => void download()}
                        className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 shadow-xs hover:border-orange-200 hover:text-orange-600 disabled:opacity-50 transition-colors"
                    >
                        <Download className="h-4 w-4" />
                        {exporting ? '导出中…' : '导出用量报告'}
                    </button>
                    <button
                        aria-label="刷新用量统计"
                        onClick={() => setRefresh(v => v + 1)}
                        className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 shadow-xs hover:border-orange-200 hover:text-orange-600 transition-colors"
                    >
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>

                {(error || exportError) && (
                    <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50/70 px-3.5 py-2 text-xs text-red-600">
                        <span role="alert">{exportError || error}</span>
                        <button
                            disabled={exporting}
                            onClick={() => exportError ? void download() : setRefresh(v => v + 1)}
                            className="font-medium underline hover:text-red-700"
                        >
                            重试
                        </button>
                    </div>
                )}

                {/* 5 个核心指标统计卡片（紧凑版） */}
                <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-5">
                    {/* 卡片 1：总 Token 消耗（核心主卡片） */}
                    <div className="flex flex-col justify-between rounded-xl border border-orange-200/90 bg-gradient-to-br from-orange-500/[0.08] via-amber-500/[0.02] to-white p-3 shadow-xs">
                        <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5 font-semibold text-slate-700">
                                <Zap className="h-3.5 w-3.5 text-orange-500" />
                                <span>总 Token 消耗</span>
                            </div>
                            <span className="rounded bg-orange-100/90 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700">
                                核心用量
                            </span>
                        </div>
                        <div className="mt-1.5 flex items-baseline justify-between">
                            <span className="text-xl font-black tracking-tight tabular-nums text-orange-600">
                                {summary == null && summaryLoading ? '—' : tokenNumber(totalTokens)}
                            </span>
                            <span className="text-[11px] font-medium text-orange-400">Tokens</span>
                        </div>
                    </div>

                    {/* 卡片 2：输入 Token */}
                    <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
                        <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5 font-medium text-slate-600">
                                <ArrowDownLeft className="h-3.5 w-3.5 text-sky-500" />
                                <span>输入 Token</span>
                            </div>
                            {inputPercent && (
                                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-slate-500">
                                    占 {inputPercent}%
                                </span>
                            )}
                        </div>
                        <div className="mt-1.5 flex items-baseline justify-between">
                            <span className="text-lg font-bold tracking-tight tabular-nums text-slate-800">
                                {summary == null && summaryLoading ? '—' : tokenNumber(inputTokens)}
                            </span>
                            <span className="text-[11px] text-slate-400">Prompt</span>
                        </div>
                    </div>

                    {/* 卡片 3：输出 Token */}
                    <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
                        <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5 font-medium text-slate-600">
                                <ArrowUpRight className="h-3.5 w-3.5 text-violet-500" />
                                <span>输出 Token</span>
                            </div>
                            {outputPercent && (
                                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-slate-500">
                                    占 {outputPercent}%
                                </span>
                            )}
                        </div>
                        <div className="mt-1.5 flex items-baseline justify-between">
                            <span className="text-lg font-bold tracking-tight tabular-nums text-slate-800">
                                {summary == null && summaryLoading ? '—' : tokenNumber(outputTokens)}
                            </span>
                            <span className="text-[11px] text-slate-400">Completion</span>
                        </div>
                    </div>

                    {/* 卡片 4：模型请求 */}
                    <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
                        <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5 font-medium text-slate-600">
                                <Cpu className="h-3.5 w-3.5 text-emerald-500" />
                                <span>模型请求</span>
                            </div>
                            {summary?.executionCount ? (
                                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-slate-500">
                                    {summary.executionCount} 次执行
                                </span>
                            ) : null}
                        </div>
                        <div className="mt-1.5 flex items-baseline justify-between">
                            <span className="text-lg font-bold tracking-tight tabular-nums text-slate-800">
                                {summary == null && summaryLoading ? '—' : requestCount}
                            </span>
                            <span className="text-[11px] text-slate-400">次调用</span>
                        </div>
                    </div>

                    {/* 卡片 5：采集完整度 */}
                    <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
                        <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5 font-medium text-slate-600">
                                {incompleteCount > 0 ? (
                                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                                ) : (
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                )}
                                <span>采集完整度</span>
                            </div>
                            <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                    incompleteCount > 0
                                        ? 'bg-amber-50 text-amber-600'
                                        : 'bg-emerald-50 text-emerald-600'
                                }`}
                            >
                                {incompleteCount > 0 ? `${incompleteCount} 次缺失` : '100% 完整'}
                            </span>
                        </div>
                        <div className="mt-1.5 flex items-baseline justify-between">
                            <span
                                className={`text-lg font-bold tracking-tight tabular-nums ${
                                    incompleteCount > 0 ? 'text-amber-600' : 'text-emerald-600'
                                }`}
                            >
                                {incompleteCount > 0 ? incompleteCount : '全部有效'}
                            </span>
                            <span className="text-[11px] text-slate-400">
                                {incompleteCount > 0 ? '部分截断' : '无缺失'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* 每日消耗趋势图：柱状图 BarChart */}
                {summary && (
                    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <div className="rounded-md bg-orange-50 p-1 text-orange-600">
                                    <BarChart3 className="h-3.5 w-3.5" />
                                </div>
                                <h3 className="text-sm font-bold text-slate-800">每日消耗趋势</h3>
                                <span className="text-xs text-slate-400">
                                    ({summary.days.length} 天记录)
                                </span>
                            </div>
                            {peakDay && (
                                <div className="text-xs text-slate-500">
                                    {summary.days.length > 1 ? (
                                        <span>
                                            单日峰值：
                                            <strong className="font-semibold text-orange-600">
                                                {tokenNumber(peakDay.totalTokens)}
                                            </strong>{' '}
                                            ({peakDay.day.slice(5)})
                                        </span>
                                    ) : (
                                        <span>
                                            今日累计：
                                            <strong className="font-semibold text-orange-600">
                                                {tokenNumber(peakDay.totalTokens)}
                                            </strong>{' '}
                                            token
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                        {summary.days.length ? (
                            <div className="h-44 w-full min-w-0">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart
                                        data={summary.days}
                                        margin={{left: -8, right: 12, top: 10, bottom: 0}}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis
                                            dataKey="day"
                                            tick={{fontSize: 10, fill: '#64748b'}}
                                            tickLine={false}
                                            axisLine={{stroke: '#e2e8f0'}}
                                            tickFormatter={(day: string) => day.slice(5)}
                                        />
                                        <YAxis
                                            width={48}
                                            tick={{fontSize: 10, fill: '#64748b'}}
                                            tickLine={false}
                                            axisLine={false}
                                            tickFormatter={(v: number) =>
                                                v >= 1000000
                                                    ? `${(v / 1000000).toFixed(1)}M`
                                                    : v >= 1000
                                                      ? `${Math.round(v / 1000)}k`
                                                      : String(v)
                                            }
                                        />
                                        <Tooltip
                                            cursor={{fill: '#ffedd5', opacity: 0.4, radius: 6}}
                                            content={({active, payload, label}) => {
                                                if (!active || !payload?.length) return null;
                                                const val = Number(payload[0].value || 0);
                                                return (
                                                    <div className="rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-md backdrop-blur-xs">
                                                        <p className="text-[11px] font-semibold text-slate-600">{label}</p>
                                                        <p className="mt-0.5 text-xs font-bold text-orange-600">
                                                            {tokenNumber(val)}{' '}
                                                            <span className="text-[10px] font-normal text-slate-400">
                                                                Tokens
                                                            </span>
                                                        </p>
                                                    </div>
                                                );
                                            }}
                                        />
                                        <Bar
                                            dataKey="totalTokens"
                                            fill="#f97316"
                                            radius={[6, 6, 0, 0]}
                                            maxBarSize={44}
                                        />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        ) : (
                            <div className="py-8 text-center text-xs text-slate-400">该日期范围暂无采集记录</div>
                        )}
                    </section>
                )}

                {/* 用量构成与排行大卡片（Tab 与列表整合，平滑防闪烁） */}
                {focus ? (
                    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs">
                        <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
                            <button
                                onClick={() => setFocus(null)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50/80 px-2.5 py-1 text-xs font-semibold text-orange-700 hover:bg-orange-100 transition-colors"
                            >
                                <ArrowLeft className="h-3.5 w-3.5" />
                                返回排行
                            </button>
                            <div className="flex items-center gap-2">
                                {group === 'agent' && focus.filters.agent_id ? (
                                    <AgentAvatar
                                        name={focus.name}
                                        avatar={agentMap[focus.filters.agent_id]?.avatar}
                                        size="xs"
                                    />
                                ) : null}
                                <h3 className="text-sm font-bold text-slate-800">{focus.name}</h3>
                            </div>
                        </div>
                        <TokenUsageDetails key={JSON.stringify(focus.filters) + refresh} filters={focus.filters} />
                    </section>
                ) : (
                    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs">
                        {/* 头部：标题与胶囊分段控制器 */}
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                            <div className="flex items-center gap-2">
                                <div className="rounded-md bg-orange-50 p-1 text-orange-600">
                                    <BarChart3 className="h-3.5 w-3.5" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-slate-800">用量构成与排行</h3>
                                    <p className="text-[11px] text-slate-400">
                                        按维度聚合查看用量消耗，支持下钻查看关联记录与模型请求
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {groupsLoading && (
                                    <span className="flex items-center gap-1 text-[11px] text-orange-600">
                                        <RefreshCw className="h-3 w-3 animate-spin" />
                                        加载中…
                                    </span>
                                )}
                                <div className="inline-flex rounded-xl bg-slate-100/90 p-1 border border-slate-200/50">
                                    {[
                                        ['agent', '按 Agent'],
                                        ['task', '按任务'],
                                        ['purpose', '其他调用'],
                                    ].map(([value, label]) => (
                                        <button
                                            key={value}
                                            onClick={() => {
                                                setGroup(value);
                                                reset();
                                            }}
                                            className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-all ${
                                                group === value
                                                    ? 'bg-white text-orange-600 font-semibold shadow-xs'
                                                    : 'text-slate-500 hover:text-slate-800'
                                            }`}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* 列表主体：保留旧数据 + 透明度过渡 + 骨架屏，杜绝 Tab 切换时的高度坍塌与跳动 */}
                        <div
                            className={`min-h-[160px] transition-opacity duration-200 ${
                                groupsLoading ? 'opacity-60 pointer-events-none' : 'opacity-100'
                            }`}
                        >
                            {!groups?.items.length && !groupsLoading ? (
                                <div className="py-10 text-center text-xs text-slate-400">
                                    暂无符合条件的用量记录
                                </div>
                            ) : !groups?.items.length && groupsLoading ? (
                                <div className="space-y-2.5">
                                    {[1, 2, 3].map(i => (
                                        <div
                                            key={i}
                                            className="animate-pulse rounded-xl border border-slate-100 bg-slate-50/60 p-3.5 flex items-center justify-between"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="h-6 w-6 rounded-lg bg-slate-200" />
                                                <div className="h-8 w-8 rounded-xl bg-slate-200" />
                                                <div className="space-y-1.5">
                                                    <div className="h-3.5 w-24 rounded bg-slate-200" />
                                                    <div className="h-2.5 w-36 rounded bg-slate-200/70" />
                                                </div>
                                            </div>
                                            <div className="h-4 w-20 rounded bg-slate-200" />
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {groups?.items.map((row, index) => {
                                        const rank = (page - 1) * 30 + index + 1;
                                        const percent =
                                            totalTokens > 0
                                                ? Math.min(100, Math.max(0, (row.totalTokens / totalTokens) * 100))
                                                : 0;
                                        const title =
                                            group === 'purpose'
                                                ? purposeNames[row.key] || row.name
                                                : row.name || '系统规划';

                                        // 针对 Agent、任务、其他调用分别解析对应的头像或专属 SVG 图标
                                        let iconElement: React.ReactNode = null;
                                        if (group === 'agent') {
                                            if (row.key && row.key !== '__system__') {
                                                iconElement = (
                                                    <AgentAvatar
                                                        name={title}
                                                        avatar={agentMap[row.key]?.avatar}
                                                        size="sm"
                                                    />
                                                );
                                            } else {
                                                iconElement = (
                                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-600 border border-purple-200/80">
                                                        <Cpu className="h-4 w-4" />
                                                    </div>
                                                );
                                            }
                                        } else if (group === 'task') {
                                            const theme = getTaskTheme(row.key, title, taskMap);
                                            const IconComponent = theme.icon;
                                            iconElement = (
                                                <div
                                                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${theme.className}`}
                                                >
                                                    <IconComponent className="h-4 w-4" />
                                                </div>
                                            );
                                        } else {
                                            const theme = getPurposeTheme(row.key);
                                            const IconComponent = theme.icon;
                                            iconElement = (
                                                <div
                                                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${theme.className}`}
                                                >
                                                    <IconComponent className="h-4 w-4" />
                                                </div>
                                            );
                                        }

                                        return (
                                            <div
                                                key={row.key}
                                                onClick={() => inspect(row)}
                                                className="group relative flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/40 p-3.5 hover:border-orange-200 hover:bg-orange-50/30 hover:shadow-xs transition-all duration-150 cursor-pointer"
                                            >
                                                {/* 左侧：排名 + 头像/专属图标 + 名称与标签 */}
                                                <div className="flex items-center gap-3 min-w-0">
                                                    {/* 排名徽章 */}
                                                    <div
                                                        className={`h-6 w-6 shrink-0 rounded-lg text-xs font-bold flex items-center justify-center ${
                                                            rank === 1
                                                                ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-xs'
                                                                : rank === 2
                                                                  ? 'bg-slate-200 text-slate-700'
                                                                  : rank === 3
                                                                    ? 'bg-amber-700/40 text-amber-900'
                                                                    : 'bg-slate-100 text-slate-400'
                                                        }`}
                                                    >
                                                        {rank}
                                                    </div>

                                                    {/* Agent 头像或任务专属 SVG 图标 */}
                                                    {iconElement}

                                                    {/* 名称与次级信息 */}
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="truncate text-sm font-bold text-slate-800 group-hover:text-orange-600 transition-colors">
                                                                {title}
                                                            </span>
                                                        </div>
                                                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-400">
                                                            <span>{row.requestCount} 次请求</span>
                                                            <span>·</span>
                                                            <span>{row.executionCount} 次执行</span>
                                                            {group === 'task' && (
                                                                <>
                                                                    <span>·</span>
                                                                    <span>平均 {tokenNumber(row.averageTokens)}/次</span>
                                                                </>
                                                            )}
                                                            {!!row.incompleteCount && (
                                                                <span className="text-amber-600 font-medium">
                                                                    ({row.incompleteCount} 次不完整)
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* 右侧：占比条 + Token 数值 + 箭头 */}
                                                <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 pl-9 sm:pl-0">
                                                    {/* 占比条 */}
                                                    <div className="hidden md:flex flex-col items-end gap-1">
                                                        <div className="h-1.5 w-24 rounded-full bg-slate-200/80 overflow-hidden">
                                                            <div
                                                                className="h-full bg-gradient-to-r from-orange-400 to-orange-500 rounded-full"
                                                                style={{width: `${Math.max(4, percent)}%`}}
                                                            />
                                                        </div>
                                                        <span className="text-[10px] text-slate-400 tabular-nums">
                                                            占 {percent.toFixed(1)}%
                                                        </span>
                                                    </div>

                                                    {/* Token 数值 */}
                                                    <div className="text-right">
                                                        <p className="text-sm font-bold tabular-nums text-orange-600">
                                                            {tokenNumber(row.totalTokens)}{' '}
                                                            <span className="text-[11px] font-normal text-slate-400">
                                                                token
                                                            </span>
                                                        </p>
                                                    </div>

                                                    {/* 交互箭头 */}
                                                    <div className="text-slate-300 group-hover:text-orange-500 group-hover:translate-x-0.5 transition-all">
                                                        <ChevronRight className="h-4 w-4" />
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* 分页控制 */}
                        {!!groups?.total && (
                            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
                                <button
                                    disabled={page === 1 || groupsLoading}
                                    onClick={() => setPage(v => Math.max(1, v - 1))}
                                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                                >
                                    上一页
                                </button>
                                <span className="tabular-nums">
                                    第 {page} 页 · 共 {groups.total} 项
                                </span>
                                <button
                                    disabled={!groups.hasMore || groupsLoading}
                                    onClick={() => setPage(v => v + 1)}
                                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                                >
                                    下一页
                                </button>
                            </div>
                        )}
                    </section>
                )}
            </div>
        </WorldDialog>
    );
}
