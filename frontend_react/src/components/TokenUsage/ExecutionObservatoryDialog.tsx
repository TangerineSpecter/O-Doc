import {useEffect, useMemo, useRef, useState} from 'react';
import {
    ArrowLeft,
    ArrowRight,
    Calendar,
    CalendarClock,
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    FileText,
    Info,
    Loader2,
    RefreshCw,
    Sparkles,
} from 'lucide-react';
import WorldDialog from '../AgentWorld/WorldDialog';
import AgentAvatar from '../AgentWorld/AgentAvatar';
import {useTokenObservatory} from '../../hooks/useTokenObservatory';
import {clockTime, dayOf, knownTokens, observedActivities, requestOrder, shiftDay} from '../../utils/tokenObservatory';
import {requestStatus, shanghaiDay, tokenNumber} from '../../utils/tokenUsage';
import ObservationOverview from './ObservationOverview';
import ObservationTimeline from './ObservationTimeline';
import ObservationInspector from './ObservationInspector';

export interface ObservatoryProps {
    recordId?: string | null;
    agentId?: string;
    agentName?: string;
    avatar?: string;
    taskName?: string;
    startedAt?: string;
    initialDate?: string;
    onClose: () => void;
}

export default function ExecutionObservatoryDialog({
    recordId,
    agentId = '',
    agentName,
    avatar,
    taskName,
    startedAt,
    initialDate,
    onClose,
}: ObservatoryProps) {
    const today = shanghaiDay();
    const [date, setDate] = useState(() => initialDate || (startedAt ? dayOf(startedAt) : today));
    const [actor, setActor] = useState(agentId);
    const [daily, setDaily] = useState(!recordId);
    const [refresh, setRefresh] = useState(0);
    const [activityId, setActivityId] = useState('');
    const [requestId, setRequestId] = useState('');
    const [factsExpanded, setFactsExpanded] = useState(false);
    const stepsContainerRef = useRef<HTMLDivElement>(null);

    const {requests, facts, errors, loading} = useTokenObservatory(
        actor,
        date,
        daily ? undefined : recordId || undefined,
        refresh
    );
    const ordered = useMemo(() => [...requests].sort(requestOrder), [requests]);
    const activities = useMemo(() => observedActivities(requests, facts), [requests, facts]);
    const activity = activities.find(a => a.id === activityId) || activities[0];
    const current = activity?.requests.find(r => r.id === requestId) || activity?.requests[0];
    const previous = current && activity ? activity.requests[activity.requests.indexOf(current) - 1] : undefined;
    const name = daily
        ? requests.find(r => r.agentKey === actor)?.agentName || agentName || (actor ? '居民' : '系统规划')
        : taskName || '任务执行';

    // 仅在横向列表内部微调水平 scrollLeft，绝不触发全局或垂直祖先容器的 scrollIntoView
    useEffect(() => {
        if (!current?.id || !stepsContainerRef.current) return;
        const container = stepsContainerRef.current;
        const activeEl = container.querySelector<HTMLElement>(`[data-request-id="${current.id}"]`);
        if (!activeEl) return;
        const containerRect = container.getBoundingClientRect();
        const activeRect = activeEl.getBoundingClientRect();
        if (activeRect.left >= containerRect.left && activeRect.right <= containerRect.right) return;
        const offset = activeRect.left - containerRect.left;
        container.scrollTo({
            left: container.scrollLeft + offset - containerRect.width / 2 + activeRect.width / 2,
            behavior: 'smooth',
        });
    }, [current?.id]);

    const buttonClass =
        'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50 active:scale-95 transition-all';

    const isToday = date === today;

    return (
        <WorldDialog
            title="执行观测"
            description={daily ? '北京时间 · 当天全部已采集调用与业务事实' : '本次执行 · 包含跨日请求'}
            size="extra-wide"
            zIndex={140}
            onClose={onClose}
        >
            <div className="flex min-h-0 flex-1 flex-col gap-2.5 rounded-xl bg-slate-50 p-2.5 sm:p-3">
                {/* 顶部身份与日期工具栏 */}
                <header className="flex shrink-0 flex-wrap items-center justify-between gap-2.5 rounded-xl border border-slate-200/90 bg-white p-2.5 sm:px-3 sm:py-2 shadow-2xs">
                    {/* 左侧：居民身份 / 执行标识 */}
                    <div className="flex min-w-0 items-center gap-2.5">
                        <div className="relative shrink-0">
                            <AgentAvatar name={name} avatar={avatar} />
                            <span
                                className={`absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full text-[8px] font-bold text-white shadow-2xs ${
                                    daily ? 'bg-orange-500' : 'bg-blue-500'
                                }`}
                                title={daily ? '居民全天观测' : '单次执行分析'}
                            >
                                {daily ? '日' : '次'}
                            </span>
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <h2 className="truncate text-sm sm:text-base font-bold text-slate-900">
                                    {name}{daily ? '的一天' : ''}
                                </h2>
                                <span className="rounded-full bg-slate-100 px-1.5 py-0.2 text-[9px] font-medium text-slate-500">
                                    {daily ? '全天观测' : '任务执行'}
                                </span>
                            </div>
                            <p className="truncate text-[11px] text-slate-400">
                                活动、模型与输入，在一条线上看清楚
                            </p>
                        </div>
                    </div>

                    {/* 右侧：日期切换与操作控制 */}
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                        {daily ? (
                            <div className="flex items-center gap-1 rounded-xl border border-slate-200/80 bg-slate-50 p-1">
                                <button
                                    type="button"
                                    className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 hover:bg-white hover:shadow-2xs active:scale-95 transition-all"
                                    aria-label="前一天"
                                    title="前一天"
                                    onClick={() => setDate(day => shiftDay(day, -1))}
                                >
                                    <ArrowLeft className="h-3.5 w-3.5" />
                                </button>

                                <div className="relative flex items-center gap-1.5 px-1.5">
                                    <Calendar className="h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                                    <input
                                        type="date"
                                        aria-label="观测日期"
                                        value={date}
                                        onChange={e => {
                                            if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) setDate(e.target.value);
                                        }}
                                        className="w-28 bg-transparent font-mono text-xs font-semibold text-slate-700 outline-none focus:ring-0 cursor-pointer"
                                    />
                                </div>

                                <button
                                    type="button"
                                    className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 hover:bg-white hover:shadow-2xs active:scale-95 transition-all"
                                    aria-label="后一天"
                                    title="后一天"
                                    onClick={() => setDate(day => shiftDay(day, 1))}
                                >
                                    <ArrowRight className="h-3.5 w-3.5" />
                                </button>

                                {!isToday && (
                                    <button
                                        type="button"
                                        onClick={() => setDate(today)}
                                        className="ml-1 rounded-md bg-orange-50 px-2 py-1 text-[11px] font-semibold text-orange-600 hover:bg-orange-100 transition-colors"
                                    >
                                        今天
                                    </button>
                                )}
                            </div>
                        ) : current?.agentKey ? (
                            <button
                                type="button"
                                className={buttonClass}
                                onClick={() => {
                                    setActor(current.agentKey);
                                    setDate(dayOf(current.startedAt));
                                    setDaily(true);
                                }}
                            >
                                查看该居民当天
                            </button>
                        ) : null}

                        {recordId && daily && (
                            <button
                                type="button"
                                className={buttonClass}
                                onClick={() => setDaily(false)}
                            >
                                返回本次执行
                            </button>
                        )}

                        <button
                            type="button"
                            className={buttonClass}
                            aria-label="刷新执行观测"
                            title="刷新数据"
                            onClick={() => setRefresh(v => v + 1)}
                        >
                            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-orange-500' : ''}`} />
                            <span className="hidden sm:inline">刷新</span>
                        </button>
                    </div>
                </header>

                {/* 错误提示条 */}
                {errors.length > 0 && (
                    <div
                        role="alert"
                        className="flex shrink-0 items-center justify-between rounded-xl border border-red-200/80 bg-red-50 p-3 text-xs text-red-700 shadow-2xs"
                    >
                        <span>{errors.join('；')}。</span>
                        <button
                            type="button"
                            onClick={() => setRefresh(v => v + 1)}
                            className="whitespace-nowrap font-semibold underline hover:text-red-800"
                        >
                            点击重试
                        </button>
                    </div>
                )}

                {/* 主数据区 */}
                {loading ? (
                    <div
                        role="status"
                        className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200/80 bg-white py-16 text-slate-500 shadow-2xs"
                    >
                        <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
                        <span className="text-xs font-medium">正在读取观测数据与业务事实…</span>
                    </div>
                ) : (
                    <>
                        {/* 顶部四联指标概览 */}
                        <ObservationOverview
                            requests={ordered}
                            selected={current?.id}
                            unavailable={errors.some(e => e.startsWith('模型请求'))}
                            onSelect={row => {
                                const match = activities.find(a => a.requests.some(r => r.id === row.id));
                                if (match) setActivityId(match.id);
                                setRequestId(row.id);
                            }}
                        />

                        {/* 下部左右分栏布局 */}
                        {!activity ? (
                            <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-xs text-slate-400">
                                <CalendarClock className="h-7 w-7 text-slate-300" />
                                <p>{errors.length ? '数据读取不完整，请重试' : '此观测范围暂无已采集请求或业务活动'}</p>
                            </div>
                        ) : (
                            <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(0,2fr)] gap-3.5 overflow-hidden lg:grid-cols-[280px_minmax(0,1fr)] lg:grid-rows-1">
                                {/* 左侧时序时间轴 */}
                                <ObservationTimeline
                                    activities={activities}
                                    selected={activity.id}
                                    onSelect={id => {
                                        setActivityId(id);
                                        setRequestId('');
                                    }}
                                />

                                {/* 右侧活动执行与请求详情面板 */}
                                <main
                                    className="scrollbar-hide flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto rounded-2xl border border-slate-200/90 bg-white shadow-2xs"
                                    aria-label="活动执行详情"
                                >
                                    {/* 活动卡片头部 Banner */}
                                    <header className="shrink-0 border-b border-slate-100 bg-gradient-to-b from-slate-50/60 to-white p-3 sm:px-4 sm:py-3">
                                        <div className="flex flex-wrap items-center justify-between gap-2.5">
                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="font-mono text-xs font-bold text-orange-600">
                                                        {clockTime(activity.startedAt)}
                                                    </span>
                                                    <h3 className="text-sm sm:text-base font-bold text-slate-900">
                                                        {activity.title}
                                                    </h3>
                                                    {activity.requests.length === 0 ? (
                                                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                                                            <FileText className="h-3 w-3" />
                                                            业务事实归档
                                                        </span>
                                                    ) : (
                                                        <span className="rounded-md bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-700">
                                                            包含 {activity.requests.length} 次模型请求
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="mt-0.5 text-xs text-slate-400">
                                                    {activity.requests.length} 次模型请求 · {activity.facts.length} 项明确关联的业务事实
                                                </p>
                                            </div>

                                            {/* 活动消耗汇总徽章 */}
                                            {activity.requests.length > 0 && (
                                                <div className="flex items-center gap-2 rounded-xl border border-slate-200/70 bg-white px-2.5 py-1 shadow-2xs">
                                                    <span className="text-[11px] text-slate-400">活动总消耗</span>
                                                    <span className="font-mono text-xs sm:text-sm font-bold text-orange-600">
                                                        {tokenNumber(knownTokens(activity.requests, 'totalTokens'))}{' '}
                                                        <span className="text-[10px] font-normal text-slate-400">token</span>
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </header>

                                    {/* 场景 A: 包含模型请求的活动（单行横向滚动，收敛高度占用） */}
                                    {activity.requests.length > 0 && (
                                        <section className="shrink-0 border-b border-slate-100 bg-slate-50/50 px-3.5 py-2 sm:px-4 sm:py-2.5">
                                            <div className="mb-1.5 flex items-center justify-between">
                                                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                                                    <Sparkles className="h-3.5 w-3.5 text-orange-500" />
                                                    请求调用链 ({activity.requests.length} 次)
                                                </div>
                                                <span className="text-[10px] text-slate-400">
                                                    可横向滑动 · 点击切换查看下方明细
                                                </span>
                                            </div>

                                            {/* 横向滚动步骤卡片流 */}
                                            <div
                                                ref={stepsContainerRef}
                                                className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-0.5"
                                            >
                                                {activity.requests.map((row, i) => {
                                                    const isSelected = current?.id === row.id;
                                                    const isDec = row.modelType === 'decision_model';
                                                    const isFail = row.status === 'failed' || row.status === 'interrupted';
                                                    return (
                                                        <button
                                                            type="button"
                                                            key={row.id}
                                                            data-request-id={row.id}
                                                            aria-pressed={isSelected}
                                                            onClick={() => setRequestId(row.id)}
                                                            className={`group relative flex shrink-0 flex-col justify-between w-48 sm:w-52 h-[52px] rounded-xl border p-2 text-left transition-all ${
                                                                isSelected
                                                                    ? 'border-orange-400 bg-orange-50/70 shadow-xs ring-1 ring-orange-300'
                                                                    : 'border-slate-200/90 bg-white hover:border-slate-300 hover:bg-slate-50 shadow-2xs'
                                                            }`}
                                                        >
                                                            <div className="flex items-center justify-between gap-1.5 leading-none">
                                                                <span className="flex items-center gap-1.5 min-w-0">
                                                                    <span
                                                                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded font-mono text-[9px] font-bold ${
                                                                            isSelected
                                                                                ? 'bg-orange-500 text-white'
                                                                                : 'bg-slate-100 text-slate-600 group-hover:bg-slate-200'
                                                                        }`}
                                                                    >
                                                                        {i + 1}
                                                                    </span>
                                                                    <span
                                                                        className={`truncate text-xs ${
                                                                            isSelected ? 'font-bold text-slate-900' : 'font-semibold text-slate-700'
                                                                        }`}
                                                                    >
                                                                        {row.phase || row.purpose}
                                                                    </span>
                                                                </span>

                                                                <span
                                                                    className={`shrink-0 rounded px-1 py-0.2 text-[9px] font-semibold ${
                                                                        isDec
                                                                            ? 'bg-violet-100 text-violet-700'
                                                                            : 'bg-orange-100 text-orange-700'
                                                                    }`}
                                                                >
                                                                    {isDec ? '决策' : '大模型'}
                                                                </span>
                                                            </div>

                                                            <div className="flex items-center justify-between text-[10px] text-slate-400 leading-none">
                                                                <span className="flex items-center gap-1 font-mono">
                                                                    <span>{clockTime(row.startedAt)}</span>
                                                                    <span
                                                                        className={`font-medium ${
                                                                            isFail
                                                                                ? 'text-red-600'
                                                                                : isSelected
                                                                                ? 'text-slate-700'
                                                                                : 'text-slate-500'
                                                                        }`}
                                                                    >
                                                                        · {requestStatus[row.status] || row.status}
                                                                        {row.attempt > 1 ? `#${row.attempt}` : ''}
                                                                    </span>
                                                                </span>
                                                                <span className="font-mono font-medium text-slate-600">
                                                                    {tokenNumber(row.inputTokens)} / {tokenNumber(row.outputTokens)}
                                                                </span>
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </section>
                                    )}

                                    {/* 关联的业务事实卡片 (无论有无模型请求，均支持展开查看) */}
                                    {activity.facts.length > 0 && (
                                        <section className={`border-b border-slate-100 ${activity.requests.length === 0 ? 'p-4 sm:p-5' : 'px-4 py-2 bg-emerald-50/20'}`}>
                                            {activity.requests.length > 0 ? (
                                                <div>
                                                    <button
                                                        type="button"
                                                        onClick={() => setFactsExpanded(v => !v)}
                                                        className="flex w-full items-center justify-between text-xs font-semibold text-emerald-800 hover:text-emerald-900"
                                                    >
                                                        <span className="flex items-center gap-1.5 min-w-0 truncate">
                                                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                                                            <span>业务结果 · {activity.facts.length} 项记录</span>
                                                            {!factsExpanded && activity.facts[0] && (
                                                                <span className="truncate font-normal text-slate-500 text-[11px]">
                                                                    — {activity.facts[0].title}
                                                                </span>
                                                            )}
                                                        </span>
                                                        <span className="flex items-center gap-1 text-[11px] text-emerald-600 shrink-0 ml-2">
                                                            {factsExpanded ? '收起' : '展开'}
                                                            {factsExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                                        </span>
                                                    </button>

                                                    {factsExpanded && (
                                                        <div className="mt-3 space-y-2.5">
                                                            {activity.facts.map(fact => (
                                                                <div
                                                                    key={fact.id}
                                                                    className="rounded-xl border border-emerald-200/70 bg-white p-3.5 shadow-2xs"
                                                                >
                                                                    <div className="flex items-center justify-between text-xs">
                                                                        <span className="font-bold text-slate-800">{fact.title}</span>
                                                                        <span className="font-mono text-[11px] text-slate-400">
                                                                            {clockTime(fact.occurredAt)} · {requestStatus[fact.status] || fact.status}
                                                                        </span>
                                                                    </div>
                                                                    <p className="mt-1.5 whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-600">
                                                                        {fact.detail}
                                                                    </p>
                                                                    {fact.steps && fact.steps.length > 0 && (
                                                                        <div className="mt-3 space-y-2 border-t border-slate-100 pt-2">
                                                                            {fact.steps.map(step => (
                                                                                <div key={step.id} className="rounded-lg bg-slate-50 p-2 text-xs">
                                                                                    <span className="font-semibold text-slate-700">{step.title}</span>
                                                                                    <p className="mt-1 whitespace-pre-wrap break-words text-slate-500">{step.detail}</p>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                /* 纯业务事实活动展示 (如截图中的新芽草甸观察笔记) */
                                                <div className="space-y-4">
                                                    <div className="flex items-center justify-between border-b border-emerald-100 pb-2.5">
                                                        <h4 className="flex items-center gap-2 text-sm font-bold text-emerald-900">
                                                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                                            业务事实与结果档案
                                                        </h4>
                                                        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-emerald-800">
                                                            {activity.facts.length} 项事实记录
                                                        </span>
                                                    </div>

                                                    <div className="space-y-3">
                                                        {activity.facts.map(fact => (
                                                            <div
                                                                key={fact.id}
                                                                className="rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/40 via-white to-white p-4 shadow-2xs"
                                                            >
                                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                                    <h5 className="text-sm font-bold text-slate-900">
                                                                        {fact.title}
                                                                    </h5>
                                                                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                                                                        <CheckCircle2 className="h-3 w-3" />
                                                                        {clockTime(fact.occurredAt)} · {requestStatus[fact.status] || fact.status}
                                                                    </span>
                                                                </div>

                                                                <p className="mt-2.5 whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-600">
                                                                    {fact.detail}
                                                                </p>

                                                                {/* 步骤时间轴链 */}
                                                                {fact.steps && fact.steps.length > 0 && (
                                                                    <div className="mt-4 rounded-xl border border-slate-100 bg-white/80 p-3">
                                                                        <p className="mb-2 text-[11px] font-semibold text-slate-500">执行步骤轨迹：</p>
                                                                        <div className="space-y-2">
                                                                            {fact.steps.map((step, idx) => (
                                                                                <div key={step.id} className="flex items-start gap-2 text-xs">
                                                                                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 font-mono text-[10px] font-bold text-emerald-700">
                                                                                        {idx + 1}
                                                                                    </span>
                                                                                    <div className="min-w-0 flex-1">
                                                                                        <p className="font-semibold text-slate-800">{step.title}</p>
                                                                                        <p className="mt-0.5 whitespace-pre-wrap break-words text-slate-500">{step.detail}</p>
                                                                                    </div>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>

                                                    {/* 说明卡片：解释为何无模型请求，且不推定为零 */}
                                                    <div className="flex items-start gap-3 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 text-xs text-slate-500">
                                                        <Info className="h-4 w-4 shrink-0 text-slate-400 mt-0.5" />
                                                        <div className="space-y-1">
                                                            <p className="font-semibold text-slate-700">业务事实说明</p>
                                                            <p className="leading-relaxed">
                                                                没有可明确关联的模型请求；不据此推定本活动消耗为零。此类事件通常为定时归档、规则检查或状态事实沉淀，无需大模型或决策模型参与推理。
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </section>
                                    )}

                                    {/* 场景 B: 包含模型请求时，渲染请求深入检查器 */}
                                    {current ? (
                                        <ObservationInspector
                                            key={current.id}
                                            current={current}
                                            previous={previous}
                                            refresh={refresh}
                                        />
                                    ) : null}
                                </main>
                            </div>
                        )}
                    </>
                )}
            </div>
        </WorldDialog>
    );
}
