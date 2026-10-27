import { useMemo, useState } from 'react';
import {
    Activity,
    ArrowLeft,
    Calendar,
    CheckCircle2,
    ChevronRight,
    Clock,
    Edit3,
    ExternalLink,
    FileText,
    GitCompare,
    Lightbulb,
    Plus,
    Search,
    ShieldAlert,
    Trash2,
    X,
} from 'lucide-react';
import type { MT4ExpertDetail } from '../../types/api/mt4Archive';
import { reportMetric } from '../../utils/mt4Report';
import { cardClass } from '../Quant/ui';
import { Attachments } from './Attachments';

interface ExpertDetailProps {
    collection: string;
    detail: MT4ExpertDetail;
    onBack: () => void;
    onOpenTest: (testId: string) => void;
    onAddTest: () => void;
    onCompare: () => void;
    onEditExpert: () => void;
    onDeleteExpert: () => void;
    onReload: () => Promise<void>;
}

// 格式化提取品种、周期与时间范围（醒目清晰）
function parseSymbolAndPeriod(fields?: Record<string, string>) {
    const rawSymbol = fields?.symbol || '';
    const rawPeriod = fields?.period || '';

    let symbol = rawSymbol;
    const parenIndex = rawSymbol.indexOf('(');
    if (parenIndex > 0) {
        symbol = rawSymbol.slice(0, parenIndex).trim();
    }

    let period = '';
    const periodMatch = rawPeriod.match(/(\d+\s*分钟(?:图)?|[MHWD]\d+|Daily|Hourly)/i);
    if (periodMatch) {
        period = periodMatch[1].replace(/图$/, '');
    }

    // 匹配日期范围如 2023.01.01 - 2023.12.29
    let dateRange = '';
    const dateMatches = rawPeriod.match(/(\d{4}\.\d{2}\.\d{2})/g);
    if (dateMatches && dateMatches.length >= 2) {
        dateRange = `${dateMatches[0]} – ${dateMatches[1]}`;
    }

    return {
        symbol: symbol || rawSymbol || '—',
        period: period || '默认周期',
        dateRange,
    };
}

export function ExpertDetail({
    collection,
    detail,
    onBack,
    onOpenTest,
    onAddTest,
    onCompare,
    onEditExpert,
    onDeleteExpert,
    onReload,
}: ExpertDetailProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const { expert, backtests, attachments } = detail;

    const filteredBacktests = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return backtests;
        return backtests.filter((item) => {
            const content = [
                item.title,
                item.description,
                item.data.fields?.symbol || '',
                item.data.fields?.period || '',
            ]
                .join(' ')
                .toLowerCase();
            return content.includes(query);
        });
    }, [backtests, searchQuery]);

    return (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5 animate-in fade-in duration-200">
            {/* 顶部导航与 Header */}
            <header className="space-y-3">
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <button
                        type="button"
                        onClick={onBack}
                        className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800 transition py-1 px-1.5 -ml-1.5 rounded hover:bg-slate-100"
                    >
                        <ArrowLeft size={13} />
                        <span>返回目录</span>
                    </button>
                    <span>/</span>
                    <span className="text-slate-600 font-medium truncate max-w-[240px]">
                        {expert.name}
                    </span>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 border border-orange-100 text-orange-600 shadow-2xs">
                            <Activity size={20} />
                        </div>
                        <div>
                            {/* 标题、分类标签与版本号：高识别度设计 */}
                            <div className="flex flex-wrap items-center gap-2.5">
                                <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                                    {expert.name}
                                </h1>
                                {expert.category && (
                                    <span className="inline-flex items-center rounded-md border border-orange-200 bg-orange-50 px-2.5 py-0.5 text-xs font-semibold text-orange-700 shadow-2xs">
                                        {expert.category}
                                    </span>
                                )}
                                {expert.version && (
                                    <span className="inline-flex items-center rounded-md bg-slate-800 px-2.5 py-0.5 font-mono text-xs font-semibold text-white shadow-2xs tracking-wide">
                                        {expert.version.startsWith('v') || expert.version.startsWith('V')
                                            ? expert.version
                                            : `v${expert.version}`}
                                    </span>
                                )}
                            </div>
                            <p className="mt-1 text-xs text-slate-400">
                                MT4 EA 策略档案 · 共 {backtests.length} 次回测记录
                            </p>
                        </div>
                    </div>

                    {/* 操作按钮组 */}
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            disabled={backtests.length < 2}
                            onClick={onCompare}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 whitespace-nowrap shrink-0"
                            title={backtests.length < 2 ? '至少需要 2 组回测记录' : '对比回测'}
                        >
                            <GitCompare size={13} className="text-slate-400" />
                            <span>对比回测</span>
                        </button>
                        <button
                            type="button"
                            onClick={onEditExpert}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 whitespace-nowrap shrink-0"
                        >
                            <Edit3 size={13} className="text-slate-400" />
                            <span>编辑 EA</span>
                        </button>
                        <button
                            type="button"
                            onClick={onDeleteExpert}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200/70 bg-white px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 whitespace-nowrap shrink-0"
                        >
                            <Trash2 size={13} />
                            <span>删除</span>
                        </button>
                        <button
                            type="button"
                            onClick={onAddTest}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3.5 py-1.5 text-xs font-medium text-white shadow-xs transition hover:bg-orange-600 active:bg-orange-700 whitespace-nowrap shrink-0"
                        >
                            <Plus size={14} />
                            <span>添加回测</span>
                        </button>
                    </div>
                </div>
            </header>

            {/* 卡片一：EA 信息与策略说明 */}
            <section className={cardClass}>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                    <div className="flex items-center gap-2">
                        <FileText size={16} className="text-slate-400" />
                        <h2 className="text-sm font-bold text-slate-800">EA 信息与运行规范</h2>
                    </div>
                    {expert.parameters && expert.parameters.length > 0 && (
                        <span className="text-xs text-slate-400">
                            已录入 {expert.parameters.length} 项参数定义
                        </span>
                    )}
                </div>

                <div className="grid gap-3.5 sm:grid-cols-2">
                    {/* 观察到的交易逻辑 */}
                    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5 sm:col-span-2">
                        <div className="flex items-center gap-1.5 mb-1.5 text-slate-600">
                            <Lightbulb size={14} className="text-orange-500 shrink-0" />
                            <h3 className="text-xs font-semibold text-slate-700">观察到的交易逻辑</h3>
                        </div>
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-600">
                            {expert.tradingLogic || '暂无详细记录'}
                        </p>
                    </div>

                    {/* 官方最低要求（模块化指标卡片，拆分字段展示） */}
                    <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs space-y-3">
                        <div className="flex items-center gap-1.5">
                            <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">官方最低要求</h3>
                        </div>

                        {/* 三项规格指标网格 */}
                        <div className="grid grid-cols-3 gap-2">
                            <div className="rounded-lg bg-slate-50/80 border border-slate-100 p-2 text-center sm:text-left">
                                <span className="block text-[11px] font-medium text-slate-400">最低资金</span>
                                <div className="mt-1 flex items-baseline justify-center sm:justify-start gap-0.5">
                                    {expert.minimumCapital ? (
                                        <>
                                            <span className="text-sm font-bold font-mono text-slate-900">{expert.minimumCapital}</span>
                                            <span className="text-[11px] text-slate-500 font-medium">美元</span>
                                        </>
                                    ) : (
                                        <span className="text-xs text-slate-400 font-medium">—</span>
                                    )}
                                </div>
                            </div>

                            <div className="rounded-lg bg-slate-50/80 border border-slate-100 p-2 text-center sm:text-left">
                                <span className="block text-[11px] font-medium text-slate-400">时间框架</span>
                                <div className="mt-1">
                                    {expert.timeframe ? (
                                        <span className="inline-flex items-center px-1.5 py-0.2 rounded bg-teal-50 border border-teal-200/70 font-mono text-xs font-bold text-teal-800">
                                            {expert.timeframe}
                                        </span>
                                    ) : (
                                        <span className="text-xs text-slate-400 font-medium">—</span>
                                    )}
                                </div>
                            </div>

                            <div className="rounded-lg bg-slate-50/80 border border-slate-100 p-2 text-center sm:text-left">
                                <span className="block text-[11px] font-medium text-slate-400">账户要求</span>
                                <div className="mt-1">
                                    <span className="text-xs font-bold text-slate-800">
                                        {expert.accountRequirement || '—'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* 额外补充（仅在存在时展示） */}
                        {expert.requirements && expert.requirements.trim() && (
                            <div className="pt-2 border-t border-slate-100">
                                <span className="text-[11px] font-medium text-slate-400">额外补充：</span>
                                <p className="mt-0.5 text-xs text-slate-600 whitespace-pre-wrap leading-relaxed">
                                    {expert.requirements}
                                </p>
                            </div>
                        )}
                    </div>

                    {/* 注意事项（四周边框规整一致，标题与角标用红色凸显，正文保持深灰自然阅读） */}
                    <div className="rounded-xl border border-red-200/80 bg-red-50/20 p-3.5 shadow-2xs space-y-2">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                                <ShieldAlert size={15} className="text-red-600 shrink-0" />
                                <h3 className="text-xs font-bold text-red-700 uppercase tracking-wider">注意事项</h3>
                            </div>
                            <span className="rounded bg-red-100/80 px-2 py-0.5 text-[10px] font-semibold text-red-600">
                                风险提醒
                            </span>
                        </div>
                        <p className="whitespace-pre-wrap text-xs sm:text-sm text-slate-700 leading-relaxed font-normal">
                            {expert.notes || '暂无特殊注意事项'}
                        </p>
                    </div>

                    {/* 来源 */}
                    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5 sm:col-span-2 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-600">相关链接：</span>
                        <div className="flex flex-wrap items-center gap-2">
                            {expert.sourceUrl && (
                                <a
                                    href={expert.sourceUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 hover:text-orange-600 hover:border-orange-200 transition"
                                >
                                    <span>EA 发布主页</span>
                                    <ExternalLink size={11} className="text-slate-400" />
                                </a>
                            )}
                            {expert.forumUrl && (
                                <a
                                    href={expert.forumUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 hover:text-orange-600 hover:border-orange-200 transition"
                                >
                                    <span>论坛讨论帖</span>
                                    <ExternalLink size={11} className="text-slate-400" />
                                </a>
                            )}
                            {!expert.sourceUrl && !expert.forumUrl && (
                                <span className="text-xs text-slate-400">暂无链接</span>
                            )}
                        </div>
                    </div>
                </div>
            </section>

            {/* 卡片二：回测记录列表（周期、时间范围明显，不展示参数） */}
            <section className={cardClass}>
                <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-3 mb-3">
                    <div className="flex items-center gap-2">
                        <h2 className="text-sm font-bold text-slate-800">回测记录</h2>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 tabular-nums">
                            {backtests.length}
                        </span>
                    </div>

                    <div className="relative w-full sm:w-60">
                        <Search
                            size={13}
                            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                        />
                        <input
                            aria-label="筛选回测记录"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="搜索品种或时间..."
                            className="w-full rounded-lg border border-slate-200 bg-slate-50/60 py-1 pl-7 pr-6 text-xs text-slate-800 placeholder-slate-400 outline-none transition focus:bg-white focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20"
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                aria-label="清空搜索"
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            >
                                <X size={12} />
                            </button>
                        )}
                    </div>
                </div>

                {filteredBacktests.length > 0 ? (
                    <div className="divide-y divide-slate-100">
                        {filteredBacktests.map((item) => {
                            const parsed = parseSymbolAndPeriod(item.data.fields);
                            const netProfit = reportMetric(item.data, [
                                '总净盈利',
                                'total net profit',
                                '净盈利',
                                'net profit',
                            ]);
                            const maxDrawdown = reportMetric(item.data, [
                                '最大亏损',
                                'maximal drawdown',
                                '最大回撤',
                                '相对回撤',
                            ]);

                            const isProfitPositive =
                                netProfit && !netProfit.startsWith('-') && netProfit !== '0.00';

                            return (
                                <div
                                    key={item.id}
                                    onClick={() => onOpenTest(item.id)}
                                    className="group -mx-2 px-3 py-3 rounded-lg transition hover:bg-slate-50 cursor-pointer flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between"
                                >
                                    {/* 左侧：标题与醒目的核心规格（周期与时间范围明确） */}
                                    <div className="min-w-0 flex-1 space-y-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-semibold text-slate-900 truncate group-hover:text-orange-600 transition-colors">
                                                {item.title}
                                            </span>
                                            {item.data.source === 'html' && (
                                                <span className="rounded bg-slate-100 px-1.5 py-0.2 text-[10px] font-medium text-slate-500">
                                                    HTML
                                                </span>
                                            )}
                                            {item.data.source === 'vision' && (
                                                <span className="rounded bg-slate-100 px-1.5 py-0.2 text-[10px] font-medium text-slate-500">
                                                    截图
                                                </span>
                                            )}
                                        </div>

                                        {/* 品种、周期（高亮清晰徽标）、时间范围（日历标签） */}
                                        <div className="flex flex-wrap items-center gap-2">
                                            {/* 品种 */}
                                            <span className="text-xs font-bold text-slate-900 tracking-wide mr-1">
                                                {parsed.symbol}
                                            </span>

                                            {/* 周期：醒目的周期徽标 */}
                                            <span className="inline-flex items-center gap-1 rounded-md bg-teal-50 border border-teal-200/80 px-2 py-0.5 text-xs font-bold text-teal-800">
                                                <Clock size={11} className="shrink-0 text-teal-600" />
                                                <span>{parsed.period}</span>
                                            </span>

                                            {/* 时间范围：清晰醒目的时间区间徽标 */}
                                            {parsed.dateRange && (
                                                <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 border border-slate-200/70 px-2 py-0.5 text-xs font-mono font-medium text-slate-700">
                                                    <Calendar size={11} className="shrink-0 text-slate-500" />
                                                    <span>{parsed.dateRange}</span>
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* 右侧：规整的数据列与引导箭头 */}
                                    <div className="flex shrink-0 items-center justify-between sm:justify-end gap-6 pt-1 sm:pt-0">
                                        <div className="flex items-center gap-6">
                                            {/* 净盈利 */}
                                            <div className="text-left sm:text-right">
                                                <span className="block text-[10px] text-slate-400">
                                                    总净盈利
                                                </span>
                                                <span
                                                    className={`text-sm font-semibold font-mono tabular-nums ${
                                                        isProfitPositive
                                                            ? 'text-emerald-600'
                                                            : netProfit && netProfit.startsWith('-')
                                                              ? 'text-rose-600'
                                                              : 'text-slate-700'
                                                    }`}
                                                >
                                                    {netProfit
                                                        ? `${isProfitPositive ? '+' : ''}${netProfit}`
                                                        : '—'}
                                                </span>
                                            </div>

                                            {/* 最大回撤 */}
                                            <div className="text-left sm:text-right">
                                                <span className="block text-[10px] text-slate-400">
                                                    最大回撤
                                                </span>
                                                <span className="text-sm font-medium font-mono text-slate-600 tabular-nums">
                                                    {maxDrawdown || '—'}
                                                </span>
                                            </div>
                                        </div>

                                        <ChevronRight
                                            size={16}
                                            className="text-slate-300 group-hover:text-slate-600 group-hover:translate-x-0.5 transition"
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="py-8 text-center text-xs text-slate-400">
                        {backtests.length ? (
                            <>
                                没有符合筛选条件的回测。
                                <button
                                    type="button"
                                    onClick={() => setSearchQuery('')}
                                    className="ml-1 text-orange-600 hover:underline"
                                >
                                    清除筛选
                                </button>
                            </>
                        ) : (
                            '暂无回测记录，点击右上角“添加回测”导入。'
                        )}
                    </div>
                )}
            </section>

            {/* 卡片三：资源下载 */}
            <section className={cardClass}>
                <Attachments
                    collection={collection}
                    expertId={expert.id}
                    testId={null}
                    attachments={attachments}
                    reload={onReload}
                />
            </section>
        </div>
    );
}
