import {useState} from 'react';
import {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid
} from 'recharts';
import {
    Activity,
    AlertTriangle,
    BarChart3,
    ChevronLeft,
    ChevronRight,
    Clock,
    Database,
    ExternalLink,
    FileSearch,
    Gauge,
    Globe,
    Hash,
    Layers,
    RefreshCw,
    Settings2,
    Sparkles,
    Trash2,
    TrendingUp,
    Waves,
    XCircle
} from 'lucide-react';
import {Select} from '@/components/common/Select';
import ConfirmationModal from '@/components/common/ConfirmationModal';
import {clearPerformance} from '@/api/performance';
import {usePerformanceMonitor} from '@/hooks/usePerformanceMonitor';
import type {PerformanceKind} from '@/types/performance';
import {PerformanceDetail} from './PerformanceDetail';
import {PerformancePolicyDialog} from './PerformancePolicyDialog';
import {
    duration,
    kindNames,
    methodBadge,
    percentage,
    quantile,
    statusBadge
} from './format';

const kindTabs: {key: Exclude<PerformanceKind, ''>; label: string; icon: typeof Globe}[] = [
    {key: 'request', label: '普通接口', icon: Globe},
    {key: 'stream', label: '流式响应', icon: Waves},
    {key: 'sql', label: 'SQL 执行', icon: Database},
    {key: 'ai', label: '模型调用', icon: Sparkles},
    {key: 'task', label: '后台任务', icon: Layers},
    {key: 'http', label: '外部调用', icon: ExternalLink},
];

const timeRangeOptions = [
    {value: '1', label: '最近 1 小时'},
    {value: '24', label: '最近 24 小时'},
    {value: '168', label: '最近 7 天'},
];

export function PerformanceMonitor() {
    const [hours, setHours] = useState('24');
    const [kind, setKind] = useState<PerformanceKind>('request');
    const [page, setPage] = useState(1);
    const [detail, setDetail] = useState<string | null>(null);
    const [policyOpen, setPolicyOpen] = useState(false);
    const [clearOpen, setClearOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [actionError, setActionError] = useState('');

    const {
        data,
        loading,
        rankingsError,
        samplesError,
        databaseError,
        rankingsLoading,
        samplesLoading,
        samplesReady,
        error,
        partial,
        refresh,
        reset
    } = usePerformanceMonitor(Number(hours), kind, page);

    const metrics = data?.overview.byKind[kind as Exclude<PerformanceKind, ''>];
    const points = data?.overview.trend.filter(point => point.kind === kind) ?? [];
    const trend = points.flatMap((point, index) =>
        index && point.at - points[index - 1].at > (data?.overview.trendStepSeconds || 60) * 1.5
            ? [{at: points[index - 1].at + (data?.overview.trendStepSeconds || 60), averageMs: null}, point]
            : [point]
    );
    const runningGroups = new Map<string, {kind: PerformanceKind; operation: string; count: number; longestMs: number}>();
    for (const item of data?.overview.inflight ?? []) {
        const key = JSON.stringify([item.kind, item.operation]);
        const group = runningGroups.get(key);
        if (group) {
            group.count += 1;
            group.longestMs = Math.max(group.longestMs, item.elapsedMs);
        } else {
            runningGroups.set(key, {kind: item.kind, operation: item.operation, count: 1, longestMs: item.elapsedMs});
        }
    }

    const maxRankingTotalMs = data?.rankings?.length
        ? Math.max(...data.rankings.map(r => r.totalMs), 1)
        : 1;

    const totalSamples = samplesReady && data ? data.total : 0;
    const totalPages = Math.max(1, Math.ceil(totalSamples / 20));

    const clear = async () => {
        setBusy(true);
        setActionError('');
        try {
            await clearPerformance();
            setClearOpen(false);
            setPage(1);
            reset();
        } catch {
            setActionError('清空失败，请重试。');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-4 text-slate-700 animate-in fade-in duration-200" data-performance-monitor>
            {/* 1. Header 卡片与采集状态栏 */}
            <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600 border border-orange-100/70 shadow-2xs shrink-0">
                            <Activity className="h-5 w-5" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-lg font-bold text-slate-900 tracking-tight">性能监控</h2>
                                <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-orange-50 text-orange-700 border border-orange-200/60">
                                    APM
                                </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">
                                从慢记录定位耗时，导出证据交给代码助手分析。
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <div className="w-36">
                            <Select
                                value={hours}
                                onChange={value => {
                                    setHours(value);
                                    setPage(1);
                                }}
                                options={timeRangeOptions}
                                ariaLabel="性能统计时间范围"
                                buttonClassName="!h-9 !py-1 text-xs"
                            />
                        </div>
                        <button
                            type="button"
                            onClick={() => void refresh()}
                            disabled={loading}
                            className="inline-flex items-center gap-1.5 h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-2xs transition-all hover:bg-slate-50 hover:border-slate-300 active:scale-95 disabled:opacity-50 whitespace-nowrap shrink-0"
                        >
                            <RefreshCw className={`h-3.5 w-3.5 text-slate-500 shrink-0 ${loading ? 'animate-spin text-orange-500' : ''}`} />
                            刷新
                        </button>
                        <button
                            type="button"
                            disabled={!data}
                            onClick={() => setPolicyOpen(true)}
                            className="inline-flex items-center gap-1.5 h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-2xs transition-all hover:bg-slate-50 hover:border-slate-300 active:scale-95 disabled:opacity-50 whitespace-nowrap shrink-0"
                        >
                            <Settings2 className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                            采集设置
                        </button>
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => setClearOpen(true)}
                            className="inline-flex items-center gap-1.5 h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 shadow-2xs transition-all hover:text-red-600 hover:border-red-200 hover:bg-red-50 active:scale-95 disabled:opacity-50 whitespace-nowrap shrink-0"
                        >
                            <Trash2 className="h-3.5 w-3.5 shrink-0" />
                            清空监控数据
                        </button>
                    </div>
                </div>

                {/* 状态栏 */}
                <div className="pt-3.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex flex-wrap items-center gap-2.5">
                        {/* 采集开关状态徽标 */}
                        {data?.overview.policy.enabled ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-lime-50 text-lime-800 border border-lime-200/80 font-medium">
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-lime-400 opacity-75" />
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-lime-500" />
                                </span>
                                正在采集
                            </span>
                        ) : (
                            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200/80 font-medium">
                                <span className="h-2 w-2 rounded-full bg-amber-400 shrink-0" />
                                <span>采集已暂停</span>
                                <button
                                    type="button"
                                    onClick={() => setPolicyOpen(true)}
                                    className="text-[11px] underline font-semibold text-amber-900 hover:text-amber-700 ml-1"
                                >
                                    开启采集
                                </button>
                            </div>
                        )}

                        <span className="px-2 py-0.5 rounded-md bg-slate-50 text-slate-600 border border-slate-200/60 text-[11px]">
                            仅当前部署 · 不参与 WebDAV
                        </span>

                        {data && (
                            <span className="px-2 py-0.5 rounded-md bg-slate-50 text-slate-600 border border-slate-200/60 text-[11px]">
                                策略 v{data.overview.policy.version}
                            </span>
                        )}

                        {data && (
                            <span className={`px-2 py-0.5 rounded-md border text-[11px] ${
                                data.overview.health.dropped > 0
                                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                                    : 'bg-slate-50 text-slate-500 border-slate-200/60'
                            }`}>
                                已丢弃 {data.overview.health.dropped} 条
                            </span>
                        )}
                    </div>

                    <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        <span>最近落盘：</span>
                        <span className="text-slate-600 font-mono">
                            {data?.overview.health.lastFlush
                                ? new Date(data.overview.health.lastFlush * 1000).toLocaleTimeString()
                                : '未获取'}
                        </span>
                    </div>
                </div>

                {data?.overview.health.error && (
                    <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-3 text-xs text-amber-800 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>{data.overview.health.error}</span>
                    </div>
                )}
                {partial && (
                    <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-3 text-xs text-amber-800 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>当前查询已达到读取上限，统计只代表已读取数据，建议缩短时间范围。</span>
                    </div>
                )}
            </section>

            {/* 2. 类型切换选项卡（胶囊分段控制器） */}
            <div
                role="tablist"
                aria-label="监控类型"
                className="flex flex-wrap items-center gap-1 bg-slate-100/80 p-1 rounded-2xl border border-slate-200/60 w-fit"
            >
                {kindTabs.map(({key: tabKey, label, icon: TabIcon}) => {
                    const active = kind === tabKey;
                    return (
                        <button
                            key={tabKey}
                            role="tab"
                            aria-selected={active}
                            onClick={() => {
                                setKind(tabKey);
                                setPage(1);
                            }}
                            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap shrink-0 ${
                                active
                                    ? 'bg-white text-orange-600 shadow-xs font-semibold ring-1 ring-slate-200/50'
                                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                            }`}
                        >
                            <TabIcon className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-orange-500' : 'text-slate-400'}`} />
                            <span>{label}</span>
                        </button>
                    );
                })}
            </div>

            {/* 错误提示 */}
            {(error || actionError) && (
                <div role="alert" className="bg-red-50 text-red-700 border border-red-200/80 rounded-2xl p-4 text-sm flex items-center justify-between gap-4">
                    <span>{error || actionError}</span>
                    <button
                        type="button"
                        onClick={() => void refresh()}
                        className="underline text-xs font-semibold hover:text-red-900 shrink-0"
                    >
                        重试
                    </button>
                </div>
            )}

            {/* 正在加载全局骨架态 */}
            {loading && !data && (
                <div role="status" className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm text-center">
                    <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-xs text-slate-500">正在读取性能监控统计…</p>
                </div>
            )}

            {/* 3. 核心指标卡片 & 趋势图 */}
            <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                        <Gauge className="w-4 h-4 text-orange-500 shrink-0" />
                        <h3 className="font-bold text-slate-900 text-sm">
                            {kindNames[kind]} · 指标概览
                        </h3>
                    </div>
                    <p className="text-[11px] text-slate-400">
                        P95 按固定耗时桶估算；错误率包含全部结果；慢不等于失败。
                    </p>
                </div>

                {/* 4 个指标 KPI 卡片 */}
                <dl className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                    {/* 调用次数 */}
                    <div className="bg-slate-50/70 border border-slate-200/70 rounded-xl p-4 flex flex-col justify-between hover:border-slate-300 hover:bg-white transition-all">
                        <div className="flex items-center justify-between gap-2 mb-2">
                            <dt className="text-xs font-semibold text-slate-600">调用次数</dt>
                            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                                <Hash className="w-3.5 h-3.5" />
                            </div>
                        </div>
                        <div>
                            <dd className="text-2xl font-bold font-mono text-slate-900 tracking-tight tabular-nums">
                                {data ? metrics?.count?.toLocaleString() ?? '0' : '—'}
                            </dd>
                            <p className="text-[10px] text-slate-400 mt-1">当前范围总调用量</p>
                        </div>
                    </div>

                    {/* 近似 P95 */}
                    <div className="bg-slate-50/70 border border-slate-200/70 rounded-xl p-4 flex flex-col justify-between hover:border-slate-300 hover:bg-white transition-all">
                        <div className="flex items-center justify-between gap-2 mb-2">
                            <dt className="text-xs font-semibold text-slate-600">近似 P95（区间）</dt>
                            <div className="w-7 h-7 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
                                <Clock className="w-3.5 h-3.5" />
                            </div>
                        </div>
                        <div>
                            <dd className="text-xl font-bold font-mono text-slate-900 tracking-tight tabular-nums truncate" title={quantile(metrics?.p95)}>
                                {quantile(metrics?.p95)}
                            </dd>
                            <p className="text-[10px] text-slate-400 mt-1">95% 请求低于此耗时</p>
                        </div>
                    </div>

                    {/* 慢操作比例 */}
                    <div className="bg-slate-50/70 border border-slate-200/70 rounded-xl p-4 flex flex-col justify-between hover:border-slate-300 hover:bg-white transition-all">
                        <div className="flex items-center justify-between gap-2 mb-2">
                            <dt className="text-xs font-semibold text-slate-600">慢操作比例</dt>
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                                (metrics?.slowRatio ?? 0) > 0 ? 'bg-amber-50 text-amber-600' : 'bg-lime-50 text-lime-600'
                            }`}>
                                <AlertTriangle className="w-3.5 h-3.5" />
                            </div>
                        </div>
                        <div>
                            <dd className={`text-2xl font-bold font-mono tracking-tight tabular-nums ${
                                (metrics?.slowRatio ?? 0) > 0 ? 'text-amber-600' : 'text-slate-900'
                            }`}>
                                {percentage(metrics?.slowRatio)}
                            </dd>
                            <p className="text-[10px] text-slate-400 mt-1">
                                {(metrics?.slow ?? 0) > 0 ? `包含 ${metrics?.slow} 次慢执行` : '无慢操作'}
                            </p>
                        </div>
                    </div>

                    {/* 错误比例 */}
                    <div className="bg-slate-50/70 border border-slate-200/70 rounded-xl p-4 flex flex-col justify-between hover:border-slate-300 hover:bg-white transition-all">
                        <div className="flex items-center justify-between gap-2 mb-2">
                            <dt className="text-xs font-semibold text-slate-600">错误比例</dt>
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                                (metrics?.errorRatio ?? 0) > 0 ? 'bg-red-50 text-red-600' : 'bg-lime-50 text-lime-600'
                            }`}>
                                <XCircle className="w-3.5 h-3.5" />
                            </div>
                        </div>
                        <div>
                            <dd className={`text-2xl font-bold font-mono tracking-tight tabular-nums ${
                                (metrics?.errorRatio ?? 0) > 0 ? 'text-red-600' : 'text-slate-900'
                            }`}>
                                {percentage(metrics?.errorRatio)}
                            </dd>
                            <p className="text-[10px] text-slate-400 mt-1">
                                {(metrics?.errors ?? 0) > 0 ? `共 ${metrics?.errors} 次异常` : '全部执行正常'}
                            </p>
                        </div>
                    </div>
                </dl>

                {metrics && ['invalid', 'incompatible'].includes(metrics.histogramStatus || '') && (
                    <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-3 text-xs text-amber-800">
                        当前范围的耗时分布版本不兼容或数据不完整，P95/P99 暂不可用；次数和总耗时仍可正常查看。
                    </div>
                )}

                {/* 平均耗时趋势图 */}
                <div className="pt-2">
                    <div className="flex items-center justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2">
                            <TrendingUp className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                            <h4 className="text-xs font-bold text-slate-700">平均耗时趋势（ms）</h4>
                        </div>
                        <span className="text-[11px] text-slate-400">无采样缺口区间不自动插值</span>
                    </div>

                    {trend.length > 0 ? (
                        <div className="h-44 w-full bg-slate-50/40 rounded-xl p-2 border border-slate-100">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={trend} margin={{top: 10, right: 15, left: -10, bottom: 0}}>
                                    <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" vertical={false} />
                                    <XAxis
                                        dataKey="at"
                                        tickFormatter={val => new Date(Number(val) * 1000).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
                                        tick={{fontSize: 10, fill: '#94a3b8'}}
                                        minTickGap={35}
                                        axisLine={{stroke: '#e2e8f0'}}
                                        tickLine={false}
                                    />
                                    <YAxis
                                        width={45}
                                        tick={{fontSize: 10, fill: '#94a3b8'}}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <Tooltip
                                        labelFormatter={val => new Date(Number(val) * 1000).toLocaleString()}
                                        formatter={val => [`${Math.round(Number(val))} ms`, '平均耗时']}
                                        contentStyle={{
                                            backgroundColor: '#ffffff',
                                            borderRadius: '0.75rem',
                                            border: '1px solid #e2e8f0',
                                            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                                            fontSize: '12px'
                                        }}
                                    />
                                    <Line
                                        name="平均耗时（ms）"
                                        type="monotone"
                                        dataKey="averageMs"
                                        stroke="#f97316"
                                        strokeWidth={2.5}
                                        dot={false}
                                        activeDot={{r: 4, fill: '#ea580c'}}
                                        isAnimationActive={false}
                                        connectNulls={false}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="h-32 rounded-xl border border-dashed border-slate-200 bg-slate-50/40 flex flex-col items-center justify-center text-slate-400">
                            <TrendingUp className="w-5 h-5 text-slate-300 mb-1" />
                            <p className="text-xs">当前时间范围内暂无趋势采样点</p>
                        </div>
                    )}
                </div>
            </section>

            {/* 4. 正在执行 / 在途任务（如果有） */}
            {Boolean(data?.overview.inflight.length) && (
                <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
                    <div className="flex items-center gap-2">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500" />
                        </span>
                        <h3 className="font-bold text-slate-900 text-sm">正在执行</h3>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-50 text-orange-700">
                            {data?.overview.inflight.length}
                        </span>
                    </div>

                    <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
                        {[...runningGroups.entries()].map(([key, item]) => (
                            <div key={key} className="p-3 bg-white hover:bg-slate-50/80 flex items-center justify-between gap-4 text-xs">
                                <span className="font-mono text-slate-800 break-all">{item.operation === 'unmatched' ? '尚未匹配路由的请求' : item.operation} <span className="font-sans text-slate-400">（{kindNames[item.kind as Exclude<PerformanceKind, ''>]}）</span></span>
                                <span className="tabular-nums font-medium whitespace-nowrap text-orange-600 shrink-0">
                                    {item.count} 个 · 最长已执行 {duration(item.longestMs)}
                                </span>
                            </div>
                        ))}
                    </div>
                    <p className="text-[11px] text-slate-400">按操作类型合并，显示当前执行数量和最长已执行时间；最多展示最近 100 个在途操作。心跳超过 5 分钟后不再展示。</p>
                </section>
            )}

            {/* 5. 累计耗时排行卡片 */}
            <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-orange-500 shrink-0" />
                        <h3 className="font-bold text-slate-900 text-sm">累计耗时排行</h3>
                    </div>
                    <span className="text-[11px] text-slate-400">定位最耗费资源的高频与慢操作</span>
                </div>

                {(rankingsError || (!data && error)) && !data?.rankings.length ? (
                    <div className="py-8 text-center text-sm text-red-600 bg-red-50/50 rounded-xl border border-red-100">
                        排行暂未加载，请点击右上角重试。
                    </div>
                ) : rankingsLoading && !data?.rankings.length ? (
                    <div role="status" className="py-8 flex flex-col items-center justify-center text-slate-400">
                        <div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mb-2" />
                        <p className="text-xs">正在读取累计耗时排行…</p>
                    </div>
                ) : data?.rankings.length ? (
                    <div className="overflow-x-auto scrollbar-hide">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="text-slate-400 border-b border-slate-100 bg-slate-50/50">
                                    <th className="text-center font-semibold py-2.5 px-3 w-12">排名</th>
                                    <th className="text-left font-semibold py-2.5 px-3">操作 / 版本</th>
                                    <th className="text-right font-semibold py-2.5 px-3 whitespace-nowrap">调用次数</th>
                                    <th className="text-right font-semibold py-2.5 px-3 whitespace-nowrap">累计耗时</th>
                                    <th className="text-right font-semibold py-2.5 px-3 whitespace-nowrap">平均耗时</th>
                                    <th className="text-right font-semibold py-2.5 px-3 whitespace-nowrap">最长耗时</th>
                                    <th className="text-right font-semibold py-2.5 px-3 whitespace-nowrap">近似 P95</th>
                                    <th className="text-right font-semibold py-2.5 px-3 whitespace-nowrap">错误率</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {data.rankings.map((row, index) => {
                                    const percentOfMax = Math.min(100, Math.round((row.totalMs / maxRankingTotalMs) * 100));
                                    return (
                                        <tr key={index} className="hover:bg-slate-50/80 transition-colors">
                                            {/* 排名徽标 */}
                                            <td className="py-3 px-3 text-center">
                                                {index === 0 ? (
                                                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-700 border border-orange-200">
                                                        1
                                                    </span>
                                                ) : index === 1 ? (
                                                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700">
                                                        2
                                                    </span>
                                                ) : index === 2 ? (
                                                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                                        3
                                                    </span>
                                                ) : (
                                                    <span className="text-[11px] font-mono text-slate-400">
                                                        {String(index + 1).padStart(2, '0')}
                                                    </span>
                                                )}
                                            </td>

                                            {/* 操作与版本 */}
                                            <td className="py-3 px-3 max-w-[340px]">
                                                <div className="flex items-center gap-2">
                                                    {row.method && (
                                                        <span className={`px-1.5 py-0.2 rounded text-[10px] font-semibold border ${methodBadge(row.method)}`}>
                                                            {row.method}
                                                        </span>
                                                    )}
                                                    <span className="font-mono text-xs font-semibold text-slate-900 break-all">
                                                        {row.operation}
                                                    </span>
                                                </div>
                                                <p className="text-[11px] text-slate-400 mt-1 truncate">
                                                    {row.build.version || '未知版本'} · 策略 v{row.policyVersion}
                                                </p>
                                            </td>

                                            {/* 调用次数 */}
                                            <td className="text-right tabular-nums py-3 px-3 whitespace-nowrap text-slate-700 font-mono">
                                                {row.count.toLocaleString()}
                                            </td>

                                            {/* 累计耗时（含轻量占比条） */}
                                            <td className="text-right tabular-nums py-3 px-3 whitespace-nowrap">
                                                <div className="font-bold text-orange-600 font-mono">
                                                    {duration(row.totalMs)}
                                                </div>
                                                <div className="w-16 h-1 bg-slate-100 rounded-full ml-auto mt-1 overflow-hidden">
                                                    <div
                                                        className="h-full bg-orange-400 rounded-full"
                                                        style={{width: `${percentOfMax}%`}}
                                                    />
                                                </div>
                                            </td>

                                            {/* 平均耗时 */}
                                            <td className="text-right tabular-nums py-3 px-3 whitespace-nowrap text-slate-700 font-mono">
                                                {duration(row.averageMs)}
                                            </td>

                                            <td className="text-right tabular-nums py-3 px-3 whitespace-nowrap text-slate-700 font-mono">
                                                {duration(row.maxMs)}
                                            </td>

                                            {/* 近似 P95 */}
                                            <td className="text-right tabular-nums py-3 px-3 whitespace-nowrap text-slate-700 font-mono">
                                                {quantile(row.p95)}
                                            </td>

                                            {/* 错误率 */}
                                            <td className="text-right tabular-nums py-3 px-3 whitespace-nowrap font-mono">
                                                <span className={(row.errorRatio ?? 0) > 0 ? 'text-red-600 font-semibold' : 'text-slate-600'}>
                                                    {percentage(row.errorRatio)}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="py-10 flex flex-col items-center justify-center text-slate-400">
                        <div className="bg-slate-50 p-3.5 rounded-full mb-2">
                            <BarChart3 className="w-5 h-5 text-slate-300" />
                        </div>
                        <p className="text-xs">尚无统计。开启采集后，执行相关操作，再刷新查看。</p>
                    </div>
                )}
            </section>

            {/* 6. PostgreSQL 原生统计（仅在 SQL 页面展示） */}
            {kind === 'sql' && (
                <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                        <div className="flex items-center gap-2">
                            <Database className="w-4 h-4 text-blue-600 shrink-0" />
                            <h3 className="font-bold text-slate-900 text-sm">PostgreSQL 原生统计 (pg_stat_statements)</h3>
                        </div>
                        <span className="text-[11px] text-slate-400">仅展示前 10 条高耗时快照</span>
                    </div>

                    <div className="bg-slate-50/70 border border-slate-200/70 rounded-xl p-3 text-xs text-slate-600">
                        {databaseError
                            ? '数据库状态读取失败，请重试。'
                            : data?.database.reason || data?.database.gap || data?.database.selection || '正在读取扩展状态…'}
                    </div>

                    {Boolean(data?.database.rows?.length) && (
                        <div className="space-y-2 border border-slate-100 rounded-xl divide-y divide-slate-100 overflow-hidden">
                            {data!.database.rows.slice(0, 10).map(row => (
                                <div key={row.identity} className="p-3 bg-white hover:bg-slate-50/80 flex items-center justify-between gap-4 text-xs">
                                    <span className="font-mono text-slate-800 break-all select-all">{row.identity}</span>
                                    <span className="tabular-nums font-medium whitespace-nowrap text-slate-700 shrink-0">
                                        {row.calls.toLocaleString()} 次 · 累计 {duration(row.totalMs)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                    <p className="text-[11px] text-slate-400">原生累计快照与应用侧排行口径不同，不合并计数。</p>
                </section>
            )}

            {/* 7. 诊断样本卡片 */}
            <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
                <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
                    <FileSearch className="w-4 h-4 text-orange-500 shrink-0" />
                    <h3 className="font-bold text-slate-900 text-sm">
                        诊断样本
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-50 text-orange-700 border border-orange-200/60">
                        {samplesReady && data ? `${data.total} 条` : '—'}
                    </span>
                </div>

                <p className="text-xs text-slate-500">
                    保留慢操作、失败和少量正常样本。点击单条记录可查看执行详情并导出离线诊断包。
                </p>

                {(samplesError || (!data && error)) && !data?.samples.length ? (
                    <div className="py-8 text-center text-sm text-red-600 bg-red-50/50 rounded-xl border border-red-100">
                        样本暂未加载，请点击右上角重试。
                    </div>
                ) : samplesLoading && !samplesReady ? (
                    <div role="status" className="py-8 flex flex-col items-center justify-center text-slate-400">
                        <div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mb-2" />
                        <p className="text-xs">正在读取诊断样本…</p>
                    </div>
                ) : data?.samples.length ? (
                    <div className="space-y-2">
                        {data.samples.map(sample => {
                            const badge = statusBadge(sample.status);
                            return (
                                <button
                                    key={sample.id}
                                    data-performance-sample={sample.id}
                                    onClick={() => setDetail(sample.id)}
                                    className="group w-full text-left p-3.5 rounded-xl border border-slate-200/70 hover:border-orange-200 hover:bg-orange-50/20 transition-all flex items-center justify-between gap-4 cursor-pointer"
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 mb-1.5">
                                            <span className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold border ${badge.className}`}>
                                                {badge.label}
                                            </span>
                                            <span className="font-mono text-xs font-semibold text-slate-900 break-all">
                                                {sample.operation}
                                            </span>
                                        </div>
                                        <p className="text-[11px] text-slate-400 font-mono">
                                            {new Date(sample.created).toLocaleString()}
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-3 shrink-0">
                                        <span className="tabular-nums font-mono text-sm font-bold text-orange-600">
                                            {duration(sample.durationMs)}
                                        </span>
                                        <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-orange-500 group-hover:translate-x-0.5 transition-all" />
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    <div className="py-10 flex flex-col items-center justify-center text-slate-400">
                        <div className="bg-slate-50 p-3.5 rounded-full mb-2">
                            <FileSearch className="w-5 h-5 text-slate-300" />
                        </div>
                        <p className="text-xs">当前范围没有已保存的诊断样本。</p>
                    </div>
                )}

                {/* 分页控制器 */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs text-slate-500">
                    <span className="text-[11px] text-slate-400">
                        第 {page} / {totalPages} 页
                    </span>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            disabled={page <= 1 || loading}
                            onClick={() => setPage(value => value - 1)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 active:scale-95 disabled:opacity-40 transition-all"
                        >
                            <ChevronLeft className="w-3.5 h-3.5" />
                            上一页
                        </button>
                        <button
                            type="button"
                            disabled={!data || page >= totalPages || loading}
                            onClick={() => setPage(value => value + 1)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 active:scale-95 disabled:opacity-40 transition-all"
                        >
                            下一页
                            <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            </section>

            {/* 弹窗组件 */}
            {detail && (
                <PerformanceDetail
                    key={detail}
                    id={detail}
                    onClose={() => setDetail(null)}
                />
            )}

            {policyOpen && data && (
                <PerformancePolicyDialog
                    policy={data.overview.policy}
                    onClose={() => setPolicyOpen(false)}
                    onSaved={() => void refresh()}
                />
            )}

            <ConfirmationModal
                isOpen={clearOpen}
                onClose={() => !busy && setClearOpen(false)}
                onConfirm={clear}
                isLoading={busy}
                type="danger"
                title="清空性能监控数据"
                description="将删除当前部署已保存的性能统计、样本、在途记录和数据库快照。采集策略保留，业务数据不受影响。"
                confirmText="确认清空"
            />
        </div>
    );
}
