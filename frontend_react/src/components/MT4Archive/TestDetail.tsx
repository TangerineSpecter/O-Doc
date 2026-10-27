import { useState, useMemo, useEffect } from 'react';
import {
    ArrowLeft,
    Pencil,
    Trash2,
    Copy,
    Check,
    BarChart3,
    Sliders,
    Layers,
    Table,
    LayoutGrid,
    Calendar,
    FileText,
    TrendingUp,
    ShieldAlert,
    Target,
    Coins,
    CheckCircle2,
    Search,
    Maximize2,
    X,
    Swords,
    Sparkles,
} from 'lucide-react';
import { mt4Api } from '../../api/mt4Archive';
import type { MT4TestDetail } from '../../types/api/mt4Archive';
import AuthenticatedResourceImage from '../common/AuthenticatedResourceImage';
import { QuantButton, cardClass } from '../Quant/ui';
import { Attachments } from './Attachments';
import { BalanceChart } from './BalanceChart';
import {
    extractMT4Kpis,
    groupMT4Metrics,
    extractStreakComparisons,
    reportMetric,
    parsePeriodInfo,
    parseModelInfo,
} from '../../utils/mt4Report';

function ZipChart({ collection, expertId, testId }: { collection: string; expertId: string; testId: string }) {
    const [url, setUrl] = useState('');
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        let live = true;
        let created = '';
        void mt4Api
            .zipChart(collection, expertId, testId)
            .then((blob) => {
                if (live) {
                    created = URL.createObjectURL(blob);
                    setUrl(created);
                }
            })
            .catch(() => {
                if (live) setFailed(true);
            });
        return () => {
            live = false;
            if (created) URL.revokeObjectURL(created);
        };
    }, [collection, expertId, testId]);

    if (failed) {
        return (
            <div className="flex h-40 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-xs text-slate-400">
                <p>原始曲线加载失败，请检查报告附件或在下方补传图片</p>
            </div>
        );
    }
    if (!url) {
        return (
            <div className="flex h-40 flex-col items-center justify-center text-xs text-slate-400">
                <p>正在读取报告内嵌原图…</p>
            </div>
        );
    }
    return <img src={url} alt="MT4 报告原始曲线" className="max-h-[460px] w-full rounded-lg object-contain bg-slate-900/5 p-2" />;
}

export function TestDetail({
    collection,
    expertId,
    detail,
    reload,
    back,
    edit,
    remove,
}: {
    collection: string;
    expertId: string;
    detail: MT4TestDetail;
    reload: () => Promise<void>;
    back: () => void;
    edit: () => void;
    remove: () => void;
}) {
    const { backtest, attachments } = detail;
    const report = backtest.data;
    const events = report.events || [];

    // 图片附件
    const chart = attachments.find((item) => item.role === 'chart' && item.fileType === 'image');
    const screenshot = attachments.find((item) => item.role === 'screenshot' && item.fileType === 'image');
    const hasOriginalImage = Boolean(chart || screenshot || (report.hasChart && attachments.some((item) => item.role === 'report' && item.name.toLowerCase().endsWith('.zip'))));

    // 状态管理
    const [chartTab, setChartTab] = useState<'balance' | 'original' | 'compare'>('balance');
    const [metricViewMode, setMetricViewMode] = useState<'grouped' | 'raw'>('grouped');
    const [paramFilter, setParamFilter] = useState('');
    const [copiedParam, setCopiedParam] = useState(false);
    const [copiedTitle, setCopiedTitle] = useState(false);
    const [eventFilter, setEventFilter] = useState<'all' | 'closes' | 'wins' | 'losses' | 'buys' | 'sells'>('all');
    const [page, setPage] = useState(0);
    const [isImageModalOpen, setIsImageModalOpen] = useState(false);

    // 核心 KPI 提取与分组
    const kpis = useMemo(() => extractMT4Kpis(report, events), [report, events]);
    const metricGroups = useMemo(() => groupMT4Metrics(report), [report]);
    const streakBattles = useMemo(() => extractStreakComparisons(metricGroups), [metricGroups]);

    // 智能分解周期与时间区间、模型与品种，消除截断
    const periodInfo = useMemo(() => parsePeriodInfo(report.fields?.period), [report.fields?.period]);
    const modelInfo = useMemo(() => parseModelInfo(report.fields?.model), [report.fields?.model]);
    const symbolParts = useMemo(() => {
        const raw = (report.fields?.symbol || '').trim();
        const match = raw.match(/^([^(（]+)(?:[(（]([^)）]+)[)）])?$/);
        return {
            symbol: match ? match[1].trim() : raw || '—',
            description: match && match[2] ? match[2].trim() : '',
        };
    }, [report.fields?.symbol]);

    // 提取分组以便独立定制
    const capitalGroup = useMemo(() => metricGroups.find((g) => g.key === 'capital'), [metricGroups]);
    const riskGroup = useMemo(() => metricGroups.find((g) => g.key === 'risk'), [metricGroups]);
    const tradesGroup = useMemo(() => metricGroups.find((g) => g.key === 'trades'), [metricGroups]);
    const qualityGroup = useMemo(() => metricGroups.find((g) => g.key === 'quality'), [metricGroups]);
    const othersGroup = useMemo(() => metricGroups.find((g) => g.key === 'others'), [metricGroups]);

    // 胜率数值与多空单笔数解析
    const winTradesCount = useMemo(() => {
        const match = kpis.profitTrades.match(/(\d+)/);
        return match ? parseInt(match[1], 10) : null;
    }, [kpis.profitTrades]);

    const lossTradesCount = useMemo(() => {
        const match = kpis.lossTrades.match(/(\d+)/);
        return match ? parseInt(match[1], 10) : null;
    }, [kpis.lossTrades]);

    const knownCount = winTradesCount !== null && lossTradesCount !== null ? winTradesCount + lossTradesCount : 0;
    const winRateRatio = kpis.winRateNum ?? (knownCount > 0 ? (winTradesCount! / knownCount) * 100 : null);

    // 参数处理与过滤
    const parameters = report.parameters || [];
    const filteredParams = useMemo(() => {
        if (!paramFilter.trim()) return parameters;
        const q = paramFilter.trim().toLowerCase();
        return parameters.filter(
            (p) => (p.label || p.name).toLowerCase().includes(q) || String(p.value).toLowerCase().includes(q),
        );
    }, [parameters, paramFilter]);

    // 复制所有参数为 MT4 .set 格式
    const handleCopyParams = () => {
        const text = parameters
            .map((p) => `${p.name}=${p.value}`)
            .join('\n');
        navigator.clipboard.writeText(text);
        setCopiedParam(true);
        setTimeout(() => setCopiedParam(false), 2000);
    };

    // 复制标题
    const handleCopyTitle = () => {
        navigator.clipboard.writeText(backtest.title);
        setCopiedTitle(true);
        setTimeout(() => setCopiedTitle(false), 2000);
    };

    // 交易事件过滤与分页
    const filteredEvents = useMemo(() => {
        if (eventFilter === 'all') return events;
        return events.filter((e) => {
            const p = Number(e.profit);
            const type = e.type?.toLowerCase();
            if (eventFilter === 'closes') return e.balance?.trim() && Number.isFinite(Number(e.balance));
            if (eventFilter === 'wins') return Number.isFinite(p) && p > 0;
            if (eventFilter === 'losses') return Number.isFinite(p) && p < 0;
            if (eventFilter === 'buys') return type === 'buy';
            if (eventFilter === 'sells') return type === 'sell';
            return true;
        });
    }, [events, eventFilter]);

    const totalPages = Math.max(1, Math.ceil(filteredEvents.length / 100));
    const pagedEvents = useMemo(() => {
        return filteredEvents.slice(page * 100, (page + 1) * 100);
    }, [filteredEvents, page]);

    const handleFilterChange = (filter: typeof eventFilter) => {
        setEventFilter(filter);
        setPage(0);
    };

    return (
        <div className="space-y-6">
            {/* 顶部主导航与操作栏 */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <QuantButton onClick={back} className="inline-flex items-center gap-1.5 shadow-sm text-xs">
                    <ArrowLeft size={14} />
                    返回 EA 列表
                </QuantButton>

                <div className="flex items-center gap-2">
                    <QuantButton onClick={edit} className="inline-flex items-center gap-1.5 shadow-sm text-xs">
                        <Pencil size={13} className="text-slate-500" />
                        编辑回测
                    </QuantButton>
                    <QuantButton danger onClick={remove} className="inline-flex items-center gap-1.5 text-xs">
                        <Trash2 size={13} />
                        删除记录
                    </QuantButton>
                </div>
            </div>

            {/* 回测标题与元数据横幅 (Header Hero Card) */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <h1 className="truncate text-xl font-bold text-slate-900 sm:text-2xl" title={backtest.title}>
                                {backtest.title}
                            </h1>
                            <button
                                type="button"
                                onClick={handleCopyTitle}
                                title="复制标题"
                                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                            >
                                {copiedTitle ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                            </button>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <span className="inline-flex items-center rounded-md bg-orange-50 px-2 py-0.5 font-medium text-orange-700">
                                MT4 回测详情
                            </span>
                            {report.expertVersion && (
                                <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 font-mono text-slate-700">
                                    EA {report.expertVersion}
                                </span>
                            )}
                            <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-slate-600">
                                {report.source === 'vision'
                                    ? `截图识别${report.visionModel ? ` (${report.visionModel})` : ''}`
                                    : report.source === 'html'
                                      ? 'HTML 报告导入'
                                      : '手工记录'}
                            </span>
                            {backtest.createdAt && (
                                <span className="text-slate-400">
                                    记录于 {new Date(backtest.createdAt).toLocaleDateString()}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* 交易品种、时间区间与复盘模型元信息栏（极简紧凑，去除冗余描述，时间精确到日） */}
                <div className="mt-5 grid grid-cols-1 gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3 sm:grid-cols-3">
                    {/* 1. 交易品种 */}
                    <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white/90 p-3 shadow-xs">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-100/80 text-orange-600">
                            <Coins size={18} />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-medium text-slate-400">交易品种</p>
                            <p className="mt-0.5 font-mono text-base font-bold text-slate-900 tracking-tight truncate">
                                {symbolParts.symbol}
                            </p>
                        </div>
                    </div>

                    {/* 2. 周期与时间区间（只到日期，不带时分秒） */}
                    <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white/90 p-3 shadow-xs">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100/80 text-blue-600">
                            <Calendar size={18} />
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-[11px] font-medium text-slate-400">周期与时间区间</p>
                                {periodInfo.timeframe && (
                                    <span className="rounded-md bg-blue-50 border border-blue-100 px-1.5 py-0.2 font-mono text-[10px] font-semibold text-blue-700">
                                        {periodInfo.timeframe}
                                    </span>
                                )}
                            </div>
                            <p className="mt-0.5 font-mono text-xs font-bold text-slate-800 tracking-tight truncate" title={periodInfo.displayRange}>
                                {periodInfo.displayRange}
                            </p>
                        </div>
                    </div>

                    {/* 3. 复盘模型精度 */}
                    <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white/90 p-3 shadow-xs">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100/80 text-emerald-600">
                            <CheckCircle2 size={18} />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-medium text-slate-400">复盘模型精度</p>
                            <p className="mt-0.5 text-xs font-bold text-slate-800 truncate" title={modelInfo.name}>
                                {modelInfo.name}
                            </p>
                        </div>
                    </div>
                </div>

                {backtest.description && (
                    <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/40 p-3.5 text-xs leading-relaxed text-slate-600 whitespace-pre-wrap">
                        {backtest.description}
                    </div>
                )}
            </div>

            {/* 核心量化指标看板 (KPI Cards Grid) */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
                {/* 1. 总净利润 */}
                <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:shadow-md">
                    <div className="flex items-center justify-between text-slate-400">
                        <span className="text-xs font-medium">总净利润</span>
                        <TrendingUp size={15} className="text-emerald-500" />
                    </div>
                    <div className="mt-2 flex items-baseline gap-1.5">
                        <span
                            className={`font-mono text-xl font-bold tracking-tight ${
                                kpis.totalNetProfitNum === null ? 'text-slate-400' : kpis.totalNetProfitNum >= 0 ? 'text-emerald-600' : 'text-rose-600'
                            }`}
                        >
                            {kpis.totalNetProfitNum !== null && kpis.totalNetProfitNum >= 0 && !kpis.totalNetProfit.startsWith('+') ? '+' : ''}
                            {kpis.totalNetProfit}
                        </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">本金 {kpis.initialDeposit}</span>
                        {kpis.roiPercent && (
                            <span
                                className={`font-semibold ${
                                    (kpis.roiNum ?? 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'
                                }`}
                            >
                                ROI {kpis.roiPercent}
                            </span>
                        )}
                    </div>
                </div>

                {/* 2. 获利率 (Profit Factor) */}
                <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:shadow-md">
                    <div className="flex items-center justify-between text-slate-400">
                        <span className="text-xs font-medium">获利率 (PF)</span>
                        <Coins size={15} className="text-amber-500" />
                    </div>
                    <div className="mt-2 flex items-baseline gap-1.5">
                        <span className="font-mono text-xl font-bold tracking-tight text-slate-900">
                            {kpis.profitFactor}
                        </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                        <span className="truncate">盈利 {kpis.grossProfit}</span>
                        <span className="truncate">亏损 {kpis.grossLoss}</span>
                    </div>
                </div>

                {/* 3. 最大回撤 */}
                <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:shadow-md">
                    <div className="flex items-center justify-between text-slate-400">
                        <span className="text-xs font-medium">最大亏损回撤</span>
                        <ShieldAlert size={15} className="text-rose-500" />
                    </div>
                    <div className="mt-2 flex items-baseline gap-1.5">
                        <span className="font-mono text-xl font-bold tracking-tight text-rose-600">
                            {kpis.maxDrawdownPercent || kpis.maxDrawdown}
                        </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                        <span className="truncate">绝对 {kpis.absoluteDrawdown}</span>
                        <span className="truncate">相对 {kpis.relativeDrawdown}</span>
                    </div>
                </div>

                {/* 4. 胜率与交易 */}
                <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:shadow-md">
                    <div className="flex items-center justify-between text-slate-400">
                        <span className="text-xs font-medium">交易胜率</span>
                        <Target size={15} className="text-blue-500" />
                    </div>
                    <div className="mt-2 flex items-baseline gap-1.5">
                        <span className="font-mono text-xl font-bold tracking-tight text-blue-600">
                            {kpis.winRate}
                        </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                        <span>总共 {kpis.totalTrades} 单</span>
                        <span>盈利 {kpis.profitTrades.split(' ')[0] || '—'}</span>
                    </div>
                </div>

                {/* 5. 预期盈利与建模品质 */}
                <div className="col-span-2 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:shadow-md sm:col-span-4 lg:col-span-1">
                    <div className="flex items-center justify-between text-slate-400">
                        <span className="text-xs font-medium">期望盈利 / 品质</span>
                        <CheckCircle2 size={15} className="text-emerald-500" />
                    </div>
                    <div className="mt-2 flex items-baseline gap-1.5">
                        <span className="font-mono text-xl font-bold tracking-tight text-slate-900">
                            {kpis.expectedPayoff}
                        </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                        <span>品质 {kpis.modellingQuality}</span>
                        <span>点差 {reportMetric(report, ['点差', 'spread']) || '—'}</span>
                    </div>
                </div>
            </div>

            {/* 回测图表分析中心 (Integrated Charts Hub) */}
            <section className={cardClass}>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                    <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-100 text-orange-600">
                            <BarChart3 size={15} />
                        </div>
                        <h2 className="text-base font-bold text-slate-900">回测走势分析</h2>
                    </div>

                    <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 text-xs">
                        <button
                            type="button"
                            onClick={() => setChartTab('balance')}
                            className={`rounded-lg px-3 py-1.5 font-medium transition ${
                                chartTab === 'balance'
                                    ? 'bg-white text-slate-900 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-800'
                            }`}
                        >
                            交互平仓净值与手数
                        </button>
                        {hasOriginalImage && (
                            <>
                                <button
                                    type="button"
                                    onClick={() => setChartTab('original')}
                                    className={`rounded-lg px-3 py-1.5 font-medium transition ${
                                        chartTab === 'original'
                                            ? 'bg-white text-slate-900 shadow-sm'
                                            : 'text-slate-500 hover:text-slate-800'
                                    }`}
                                >
                                    MT4 报告原图
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setChartTab('compare')}
                                    className={`rounded-lg px-3 py-1.5 font-medium transition ${
                                        chartTab === 'compare'
                                            ? 'bg-white text-slate-900 shadow-sm'
                                            : 'text-slate-500 hover:text-slate-800'
                                    }`}
                                >
                                    双图对照
                                </button>
                            </>
                        )}
                    </div>
                </div>

                <div className="pt-4">
                    {/* 视图 1：自研交互曲线 */}
                    {chartTab === 'balance' && (
                        <BalanceChart events={events} initialBalance={kpis.initialDepositNum ? String(kpis.initialDepositNum) : undefined} />
                    )}

                    {/* 视图 2：MT4 报告原图 */}
                    {chartTab === 'original' && (
                        <div className="relative group">
                            <div className="flex justify-end mb-2">
                                <button
                                    type="button"
                                    onClick={() => setIsImageModalOpen(true)}
                                    className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-orange-600 transition"
                                >
                                    <Maximize2 size={13} /> 查看高清大图
                                </button>
                            </div>
                            {chart || screenshot ? (
                                <AuthenticatedResourceImage
                                    resourceId={(chart || screenshot)!.assetId}
                                    alt={chart ? 'MT4 回测曲线图' : '回测截图'}
                                    className="max-h-[460px] w-full rounded-xl border border-slate-100 object-contain bg-slate-50/60 p-2"
                                />
                            ) : report.hasChart && attachments.some((item) => item.role === 'report' && item.name.toLowerCase().endsWith('.zip')) ? (
                                <ZipChart collection={collection} expertId={expertId} testId={backtest.id} />
                            ) : (
                                <div className="flex h-40 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 text-xs text-slate-400">
                                    <p>尚未添加原图，可在下方附件区补传</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* 视图 3：双图对比 */}
                    {chartTab === 'compare' && (
                        <div className="grid gap-6 lg:grid-cols-2">
                            <div>
                                <h3 className="mb-2 text-xs font-bold text-slate-500">平仓净值与手数 (自研渲染)</h3>
                                <BalanceChart events={events} initialBalance={kpis.initialDepositNum ? String(kpis.initialDepositNum) : undefined} />
                            </div>
                            <div>
                                <h3 className="mb-2 text-xs font-bold text-slate-500">MT4 原始报告曲线 (原图)</h3>
                                {chart || screenshot ? (
                                    <AuthenticatedResourceImage
                                        resourceId={(chart || screenshot)!.assetId}
                                        alt="原图"
                                        className="max-h-[380px] w-full rounded-xl border border-slate-100 object-contain bg-slate-50/60 p-2"
                                    />
                                ) : (
                                    <ZipChart collection={collection} expertId={expertId} testId={backtest.id} />
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </section>

            {/* 回测指标全景 (重新设计的高级量化仪表板) */}
            <section className={cardClass}>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                            <Table size={15} />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-slate-900">回测指标全景</h2>
                            <p className="text-[11px] text-slate-400">
                                多维度剖析 EA 盈利质量、风险承受力与多空交易表现
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5 text-xs">
                        <button
                            type="button"
                            onClick={() => setMetricViewMode('grouped')}
                            className={`inline-flex items-center gap-1 rounded px-2.5 py-1 font-medium transition ${
                                metricViewMode === 'grouped'
                                    ? 'bg-white text-slate-900 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-800'
                            }`}
                        >
                            <LayoutGrid size={13} />
                            量化结构看板
                        </button>
                        <button
                            type="button"
                            onClick={() => setMetricViewMode('raw')}
                            className={`inline-flex items-center gap-1 rounded px-2.5 py-1 font-medium transition ${
                                metricViewMode === 'raw'
                                    ? 'bg-white text-slate-900 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-800'
                            }`}
                        >
                            <Table size={13} />
                            MT4 原始排版
                        </button>
                    </div>
                </div>

                <div className="pt-4 space-y-5">
                    {metricViewMode === 'grouped' ? (
                        <>
                            {/* 1. 顶层视觉条：多空胜率攻防力量看板 (Distribution Banner) */}
                            <div className="grid gap-3 rounded-2xl border border-slate-100 bg-gradient-to-r from-slate-50/80 via-white to-slate-50/80 p-4 sm:grid-cols-2">
                                {/* 胜率攻防对比 */}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                                            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                                            胜率攻防分布 · {kpis.winRate || '—'}
                                        </span>
                                        <div className="flex items-center gap-2 font-mono text-[11px]">
                                            <span className="text-emerald-700 font-medium">盈利 {winTradesCount ?? '—'} 单</span>
                                            <span className="text-slate-300">/</span>
                                            <span className="text-rose-600 font-medium">亏损 {lossTradesCount ?? '—'} 单</span>
                                        </div>
                                    </div>
                                    <div className={`h-2.5 w-full overflow-hidden rounded-full flex shadow-inner ${winRateRatio === null ? 'bg-slate-100' : 'bg-rose-100'}`}>
                                        <div
                                            className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
                                            style={{ width: `${winRateRatio === null ? 0 : Math.max(0, Math.min(100, winRateRatio))}%` }}
                                            title={winRateRatio === null ? '胜率未知' : `胜率: ${winRateRatio.toFixed(1)}%`}
                                        />
                                    </div>
                                </div>

                                {/* 多空单仓位对比 */}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                                            <Sparkles size={12} className="text-blue-500" />
                                            多空仓位与胜率表现
                                        </span>
                                        <span className="font-mono text-[11px] text-slate-500">
                                            共 {kpis.totalTrades} 单
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="flex-1 rounded-lg border border-blue-100 bg-blue-50/50 px-2.5 py-1 flex items-center justify-between text-[11px]">
                                            <span className="font-medium text-blue-700">买入 (多)</span>
                                            <span className="font-mono font-bold text-blue-900">{kpis.longWon}</span>
                                        </div>
                                        <div className="flex-1 rounded-lg border border-amber-100 bg-amber-50/50 px-2.5 py-1 flex items-center justify-between text-[11px]">
                                            <span className="font-medium text-amber-700">卖出 (空)</span>
                                            <span className="font-mono font-bold text-amber-900">{kpis.shortWon}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* 2. 核心三维度卡片 (资金与收益 / 风险与回撤 / 交易与胜率) */}
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                {/* 卡片 A：资金与收益能力 */}
                                <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:shadow">
                                    <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2.5">
                                        <div className="flex items-center gap-2">
                                            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-100 text-amber-600">
                                                <Coins size={14} />
                                            </div>
                                            <h3 className="text-xs font-bold text-slate-900">资金与收益能力</h3>
                                        </div>
                                        <span className="rounded bg-amber-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-amber-700">
                                            {capitalGroup?.items.length || 0} 项
                                        </span>
                                    </div>
                                    <dl className="space-y-2.5">
                                        {capitalGroup?.items.map((item, idx) => {
                                            const isNet = item.label.includes('净盈利') || item.label.includes('净利润');
                                            const isPf = item.label.includes('盈利比') || item.label.includes('获利率');
                                            return (
                                                <div
                                                    key={idx}
                                                    className={`flex items-center justify-between rounded-lg px-2 py-1 text-xs transition ${
                                                        isNet ? 'bg-emerald-50/60 font-semibold' : 'hover:bg-slate-50'
                                                    }`}
                                                >
                                                    <dt className="text-slate-600">{item.label}</dt>
                                                    <dd
                                                        className={`font-mono text-right shrink-0 ${
                                                            isNet
                                                                ? 'text-sm font-bold text-emerald-700'
                                                                : isPf
                                                                  ? 'font-bold text-slate-900'
                                                                  : 'text-slate-800'
                                                        }`}
                                                    >
                                                        {item.value}
                                                    </dd>
                                                </div>
                                            );
                                        })}
                                    </dl>
                                </div>

                                {/* 卡片 B：风险与回撤控制 */}
                                <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:shadow">
                                    <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2.5">
                                        <div className="flex items-center gap-2">
                                            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-rose-100 text-rose-600">
                                                <ShieldAlert size={14} />
                                            </div>
                                            <h3 className="text-xs font-bold text-slate-900">风险与回撤控制</h3>
                                        </div>
                                        <span className="rounded bg-rose-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-rose-700">
                                            {riskGroup?.items.length || 0} 项
                                        </span>
                                    </div>
                                    <dl className="space-y-2.5">
                                        {riskGroup?.items.map((item, idx) => {
                                            const isMax = item.label.includes('最大亏损') || item.label.includes('最大回撤');
                                            return (
                                                <div
                                                    key={idx}
                                                    className={`flex items-center justify-between rounded-lg px-2 py-1 text-xs transition ${
                                                        isMax ? 'bg-rose-50/60 font-semibold' : 'hover:bg-slate-50'
                                                    }`}
                                                >
                                                    <dt className="text-slate-600">{item.label}</dt>
                                                    <dd
                                                        className={`font-mono text-right shrink-0 ${
                                                            isMax
                                                                ? 'text-sm font-bold text-rose-600'
                                                                : 'text-slate-800'
                                                        }`}
                                                    >
                                                        {item.value}
                                                    </dd>
                                                </div>
                                            );
                                        })}
                                    </dl>
                                </div>

                                {/* 卡片 C：交易单数与多空胜率 */}
                                <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:shadow">
                                    <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2.5">
                                        <div className="flex items-center gap-2">
                                            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-100 text-blue-600">
                                                <Target size={14} />
                                            </div>
                                            <h3 className="text-xs font-bold text-slate-900">交易单数与多空胜率</h3>
                                        </div>
                                        <span className="rounded bg-blue-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-blue-700">
                                            {tradesGroup?.items.length || 0} 项
                                        </span>
                                    </div>
                                    <dl className="space-y-2.5">
                                        {tradesGroup?.items.map((item, idx) => (
                                            <div
                                                key={idx}
                                                className="flex items-center justify-between rounded-lg px-2 py-1 text-xs transition hover:bg-slate-50"
                                            >
                                                <dt className="text-slate-600">{item.label}</dt>
                                                <dd className="font-mono font-medium text-slate-800 text-right shrink-0">
                                                    {item.value}
                                                </dd>
                                            </div>
                                        ))}
                                    </dl>
                                </div>
                            </div>

                            {/* 3. 下半区：单笔极值与连赢连亏对决矩阵 + 复盘模型质量 */}
                            <div className="grid gap-4 lg:grid-cols-3">
                                {/* 极值与连续统计红绿对决表 (占 2 列) */}
                                <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:shadow lg:col-span-2">
                                    <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2.5">
                                        <div className="flex items-center gap-2">
                                            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-100 text-emerald-600">
                                                <Swords size={14} />
                                            </div>
                                            <div>
                                                <h3 className="text-xs font-bold text-slate-900">
                                                    单笔极值与连胜连亏对决矩阵
                                                </h3>
                                                <p className="text-[10px] text-slate-400">
                                                    直观比对极端盈利与极端回撤承受力
                                                </p>
                                            </div>
                                        </div>
                                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
                                            Win vs Loss
                                        </span>
                                    </div>

                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left text-xs">
                                            <thead>
                                                <tr className="border-b border-slate-100 text-[11px] text-slate-400">
                                                    <th className="py-2 px-2 font-medium">统计维度</th>
                                                    <th className="py-2 px-2 font-medium text-right text-emerald-700">
                                                        盈利端 (Win)
                                                    </th>
                                                    <th className="py-2 px-2 font-medium text-right text-rose-600">
                                                        亏损端 (Loss)
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {streakBattles.map((row, idx) => (
                                                    <tr key={idx} className="hover:bg-slate-50/70 transition">
                                                        <td className="py-2.5 px-2 font-medium text-slate-700">
                                                            {row.metric}
                                                        </td>
                                                        <td className="py-2.5 px-2 text-right">
                                                            <span className="inline-block rounded-md bg-emerald-50 px-2 py-0.5 font-mono font-semibold text-emerald-700">
                                                                {row.profitVal}
                                                            </span>
                                                        </td>
                                                        <td className="py-2.5 px-2 text-right">
                                                            <span className="inline-block rounded-md bg-rose-50 px-2 py-0.5 font-mono font-semibold text-rose-600">
                                                                {row.lossVal}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* 复盘模型与数据质量 (占 1 列) */}
                                <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:shadow flex flex-col justify-between">
                                    <div>
                                        <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2.5">
                                            <div className="flex items-center gap-2">
                                                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-100 text-indigo-600">
                                                    <CheckCircle2 size={14} />
                                                </div>
                                                <h3 className="text-xs font-bold text-slate-900">
                                                    复盘模型与数据质量
                                                </h3>
                                            </div>
                                            <span className="rounded bg-indigo-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-indigo-700">
                                                {qualityGroup?.items.length || 0} 项
                                            </span>
                                        </div>
                                        <dl className="space-y-2.5">
                                            {qualityGroup?.items.map((item, idx) => {
                                                const isQuality = item.label.includes('质量') || item.label.includes('品质');
                                                return (
                                                    <div
                                                        key={idx}
                                                        className={`flex items-center justify-between rounded-lg px-2 py-1 text-xs transition ${
                                                            isQuality ? 'bg-indigo-50/50' : 'hover:bg-slate-50'
                                                        }`}
                                                    >
                                                        <dt className="text-slate-600">{item.label}</dt>
                                                        <dd
                                                            className={`font-mono text-right shrink-0 ${
                                                                isQuality
                                                                    ? 'font-bold text-indigo-700'
                                                                    : 'text-slate-800'
                                                            }`}
                                                        >
                                                            {item.value}
                                                        </dd>
                                                    </div>
                                                );
                                            })}
                                        </dl>
                                    </div>

                                    {/* 补充其他指标（如有） */}
                                    {othersGroup && othersGroup.items.length > 0 && (
                                        <div className="mt-4 border-t border-slate-100 pt-3">
                                            <p className="mb-1 text-[11px] font-semibold text-slate-400">其他补充指标</p>
                                            <dl className="space-y-1 text-xs">
                                                {othersGroup.items.map((it, idx) => (
                                                    <div key={idx} className="flex justify-between text-slate-600">
                                                        <dt>{it.label}</dt>
                                                        <dd className="font-mono text-slate-800">{it.value}</dd>
                                                    </div>
                                                ))}
                                            </dl>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    ) : (
                        /* MT4 原始排版表格优化版 */
                        report.metrics?.length ? (
                            <div className="overflow-x-auto rounded-xl border border-slate-100 scrollbar-hide">
                                <table className="w-full text-left text-xs">
                                    <tbody className="divide-y divide-slate-100">
                                        {report.metrics.map((row, index) => (
                                            <tr
                                                key={index}
                                                className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}
                                            >
                                                {row.map((cell, i) => (
                                                    <td
                                                        key={i}
                                                        className={`px-3 py-2 ${
                                                            i % 2 === 1
                                                                ? 'text-right font-mono font-medium text-slate-800'
                                                                : 'text-slate-500'
                                                        }`}
                                                    >
                                                        {cell && cell !== '——' && cell !== '--' ? cell : (
                                                            <span className="text-slate-300">—</span>
                                                        )}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <p className="text-xs text-slate-400">暂无原始指标数据</p>
                        )
                    )}
                </div>
            </section>

            {/* 参数快照 (Parameters Snapshot) */}
            <section className={cardClass}>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
                            <Sliders size={15} />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-slate-900">EA 参数快照</h2>
                            <p className="text-[11px] text-slate-400">
                                共 {parameters.length} 项参数配置
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                            <input
                                type="text"
                                value={paramFilter}
                                onChange={(e) => setParamFilter(e.target.value)}
                                placeholder="搜索参数…"
                                className="w-36 rounded-lg border border-slate-200 bg-white py-1 pl-7 pr-2 text-xs outline-none transition focus:border-orange-500 focus:w-48"
                            />
                        </div>
                        <button
                            type="button"
                            onClick={handleCopyParams}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition"
                        >
                            {copiedParam ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                            <span>{copiedParam ? '已复制' : '复制参数'}</span>
                        </button>
                    </div>
                </div>

                <div className="pt-4">
                    {filteredParams.length > 0 ? (
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {filteredParams.map((param, index) => {
                                const isComment =
                                    param.name.toLowerCase().startsWith('comm') ||
                                    param.value.startsWith('"') ||
                                    param.value.startsWith("'");

                                return (
                                    <div
                                        key={index}
                                        className={`flex items-center justify-between gap-2 rounded-xl border p-2.5 transition ${
                                            isComment
                                                ? 'border-slate-100 bg-slate-50/50'
                                                : 'border-slate-200/80 bg-white shadow-sm hover:border-orange-200'
                                        }`}
                                    >
                                        <div className="min-w-0 flex-1">
                                            <p
                                                className="truncate font-mono text-xs font-semibold text-slate-700"
                                                title={param.label || param.name}
                                            >
                                                {param.label || param.name}
                                            </p>
                                        </div>
                                        <div className="shrink-0">
                                            <span
                                                className={`rounded-md px-2 py-0.5 font-mono text-xs font-medium ${
                                                    isComment
                                                        ? 'bg-slate-100 text-slate-600'
                                                        : 'bg-orange-50 text-orange-700 border border-orange-100'
                                                }`}
                                            >
                                                {param.value}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <p className="text-xs text-slate-400">没有匹配的参数记录</p>
                    )}
                </div>
            </section>

            {/* 交易事件明细 (Trading Events Log) */}
            <section className={cardClass}>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
                            <Layers size={15} />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-slate-900">
                                交易事件明细 · {filteredEvents.length} 条
                            </h2>
                            <p className="text-[11px] text-slate-400">
                                完整记录开仓、修改及平仓盈亏轨迹
                            </p>
                        </div>
                    </div>

                    {/* 事件筛选器 */}
                    <div className="flex flex-wrap items-center gap-1 rounded-xl bg-slate-100 p-1 text-xs">
                        {[
                            { key: 'all', label: `全部 (${events.length})` },
                            { key: 'closes', label: '平仓单' },
                            { key: 'wins', label: '盈利单' },
                            { key: 'losses', label: '亏损单' },
                            { key: 'buys', label: '买入 Buy' },
                            { key: 'sells', label: '卖出 Sell' },
                        ].map((tab) => (
                            <button
                                key={tab.key}
                                type="button"
                                onClick={() => handleFilterChange(tab.key as any)}
                                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                                    eventFilter === tab.key
                                        ? 'bg-white text-slate-900 shadow-sm'
                                        : 'text-slate-500 hover:text-slate-800'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="pt-4">
                    {pagedEvents.length > 0 ? (
                        <>
                            <div className="max-h-[460px] overflow-auto rounded-xl border border-slate-100 scrollbar-hide">
                                <table className="w-full min-w-[760px] text-left text-xs">
                                    <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] font-semibold text-slate-500 border-b border-slate-200">
                                        <tr>
                                            <th className="px-3 py-2.5">序号</th>
                                            <th className="px-3 py-2.5">成交时间</th>
                                            <th className="px-3 py-2.5">事件类型</th>
                                            <th className="px-3 py-2.5">订单号</th>
                                            <th className="px-3 py-2.5 text-right">手数</th>
                                            <th className="px-3 py-2.5 text-right">成交价</th>
                                            <th className="px-3 py-2.5 text-right">止损 SL</th>
                                            <th className="px-3 py-2.5 text-right">止盈 TP</th>
                                            <th className="px-3 py-2.5 text-right">单笔获利</th>
                                            <th className="px-3 py-2.5 text-right">平仓后余额</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {pagedEvents.map((evt, idx) => {
                                            const profitNum = Number(evt.profit);
                                            const hasProfit = evt.profit?.trim() && Number.isFinite(profitNum);
                                            const type = evt.type?.toLowerCase();

                                            return (
                                                <tr
                                                    key={`${evt.sequence}-${idx}`}
                                                    className="hover:bg-slate-50/70 transition"
                                                >
                                                    <td className="px-3 py-2 font-mono text-slate-400">
                                                        {evt.sequence || idx + 1}
                                                    </td>
                                                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                                                        {evt.time || '—'}
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <span
                                                            className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                                                                type === 'buy'
                                                                    ? 'bg-emerald-50 text-emerald-700'
                                                                    : type === 'sell'
                                                                      ? 'bg-amber-50 text-amber-700'
                                                                      : type === 'close'
                                                                        ? 'bg-blue-50 text-blue-700'
                                                                        : 'bg-slate-100 text-slate-600'
                                                            }`}
                                                        >
                                                            {evt.type}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-2 font-mono text-slate-500">
                                                        {evt.order || '—'}
                                                    </td>
                                                    <td className="px-3 py-2 text-right font-mono font-medium text-slate-800">
                                                        {evt.lots || '—'}
                                                    </td>
                                                    <td className="px-3 py-2 text-right font-mono text-slate-700">
                                                        {evt.price || '—'}
                                                    </td>
                                                    <td className="px-3 py-2 text-right font-mono text-slate-400">
                                                        {evt.stopLoss && evt.stopLoss !== '0.00000' && evt.stopLoss !== '0'
                                                            ? evt.stopLoss
                                                            : '—'}
                                                    </td>
                                                    <td className="px-3 py-2 text-right font-mono text-slate-400">
                                                        {evt.takeProfit && evt.takeProfit !== '0.00000' && evt.takeProfit !== '0'
                                                            ? evt.takeProfit
                                                            : '—'}
                                                    </td>
                                                    <td
                                                        className={`px-3 py-2 text-right font-mono font-bold ${
                                                            hasProfit
                                                                ? profitNum > 0
                                                                    ? 'text-emerald-600'
                                                                    : profitNum < 0
                                                                      ? 'text-rose-600'
                                                                      : 'text-slate-500'
                                                                : 'text-slate-300'
                                                        }`}
                                                    >
                                                        {hasProfit
                                                            ? `${profitNum >= 0 ? '+' : ''}${profitNum.toFixed(2)}`
                                                            : '—'}
                                                    </td>
                                                    <td className="px-3 py-2 text-right font-mono font-medium text-slate-900">
                                                        {evt.balance || '—'}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* 分页控制栏 */}
                            <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                                <div>
                                    显示 {(page * 100) + 1} - {Math.min((page + 1) * 100, filteredEvents.length)} 条 / 共 {filteredEvents.length} 条
                                </div>
                                <div className="flex items-center gap-2">
                                    <QuantButton
                                        disabled={page === 0}
                                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                                        className="text-xs py-1 px-2.5"
                                    >
                                        上一页
                                    </QuantButton>
                                    <span className="font-mono text-xs text-slate-700">
                                        {page + 1} / {totalPages}
                                    </span>
                                    <QuantButton
                                        disabled={page + 1 >= totalPages}
                                        onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                                        className="text-xs py-1 px-2.5"
                                    >
                                        下一页
                                    </QuantButton>
                                </div>
                            </div>
                        </>
                    ) : (
                        <p className="text-xs text-slate-400">当前筛选条件下没有交易事件记录</p>
                    )}
                </div>
            </section>

            {/* 回测结论 (Conclusion) */}
            {backtest.conclusion && (
                <section className={cardClass}>
                    <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-100 text-orange-600">
                            <FileText size={15} />
                        </div>
                        <h2 className="text-base font-bold text-slate-900">策略评价与回测结论</h2>
                    </div>
                    <div className="pt-3 text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">
                        {backtest.conclusion}
                    </div>
                </section>
            )}

            {/* 报告与附件文件资产 */}
            <section className={cardClass}>
                <Attachments
                    collection={collection}
                    expertId={expertId}
                    testId={backtest.id}
                    attachments={attachments}
                    reload={reload}
                    imageOnly
                />
            </section>

            {/* 高清原图全屏模态弹窗 */}
            {isImageModalOpen && (chart || screenshot) && (
                <div
                    className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/80 p-4 backdrop-blur-sm"
                    onClick={() => setIsImageModalOpen(false)}
                >
                    <div
                        className="relative max-h-[90vh] max-w-5xl rounded-2xl bg-white p-3 shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            type="button"
                            onClick={() => setIsImageModalOpen(false)}
                            className="absolute right-4 top-4 rounded-full bg-slate-100 p-2 text-slate-600 hover:bg-slate-200 transition"
                        >
                            <X size={18} />
                        </button>
                        <AuthenticatedResourceImage
                            resourceId={(chart || screenshot)!.assetId}
                            alt="高清原图"
                            className="max-h-[85vh] w-full object-contain rounded-xl"
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
