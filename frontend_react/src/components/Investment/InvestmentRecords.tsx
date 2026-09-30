import {useState} from 'react';
import {
    ArrowDownRight,
    ArrowUpRight,
    Calendar,
    ChevronDown,
    ChevronRight,
    Clock,
    Cpu,
} from 'lucide-react';
import type {InvestmentDecision, InvestmentTrade} from '../../types/api/investment';
import {
    investmentMoney,
    investmentTime,
    investmentSignedMoney,
    profitClass,
    cashDeltaClass,
    investmentCashDeltaMoney,
} from './presentation';

const labels: Record<string, {label: string; color: string}> = {
    running: {label: '研究中', color: 'bg-orange-50 text-orange-700 border-orange-200'},
    success: {label: '已决策', color: 'bg-emerald-50 text-emerald-700 border-emerald-200'},
    failed: {label: '失败', color: 'bg-rose-50 text-rose-700 border-rose-200'},
    interrupted: {label: '已中断', color: 'bg-slate-100 text-slate-600 border-slate-200'},
};

const tools: Record<string, string> = {
    account: '查看账户',
    positions: '查看持仓',
    market_news: '市场新闻',
    find_stocks: '查找股票',
    find_boards: '查找行业',
    board_stocks: '行业股票',
    analyze_stock: '技术指标分析',
    buy_stock: '买入委托',
    sell_stock: '卖出委托',
};

// 成交记录流水列表
export function InvestmentTrades({items}: {items: InvestmentTrade[]}) {
    if (!items.length) {
        return (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-12 text-center text-xs text-slate-400">
                暂无成交记录
            </div>
        );
    }

    return (
        <div className="space-y-2.5">
            {items.map((t) => {
                const isBuy = t.operation.side === 'buy';

                return (
                    <article
                        key={t.id}
                        className="rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-2xs transition-all hover:border-orange-200 hover:shadow-xs"
                    >
                        {/* 顶部行：买卖方向、标的、时间、现金变动 */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <span
                                    className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold ${
                                        isBuy
                                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    }`}
                                >
                                    {isBuy ? (
                                        <ArrowUpRight className="h-3 w-3" />
                                    ) : (
                                        <ArrowDownRight className="h-3 w-3" />
                                    )}
                                    <span>{isBuy ? '买入' : '卖出'}</span>
                                </span>

                                <span className="text-sm font-bold text-slate-800">
                                    {t.operation.name}
                                </span>
                                <span className="font-mono text-xs text-slate-500">
                                    ({t.operation.code})
                                </span>
                                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">
                                    {t.operation.quantity} 股
                                </span>
                            </div>

                            <div className="flex items-center gap-2">
                                <div className="text-right font-mono">
                                    <span className="text-[11px] text-slate-400">资金变动 </span>
                                    <span
                                        className={`text-xs font-bold ${cashDeltaClass(
                                            t.result.cashDelta
                                        )}`}
                                    >
                                        {investmentCashDeltaMoney(t.result.cashDelta)}
                                    </span>
                                </div>
                                <span className="font-mono text-[11px] text-slate-400">
                                    {investmentTime(t.createdAt)}
                                </span>
                            </div>
                        </div>

                        {/* 中间核心交易数据条 */}
                        <div className="mt-2.5 flex flex-wrap items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-1.5 text-xs font-mono text-slate-600">
                            <div>
                                <span className="text-slate-400">成交价 </span>
                                <span className="font-semibold text-slate-800">
                                    ¥{investmentMoney(t.result.price)}
                                </span>
                            </div>
                            <span className="text-slate-300">|</span>
                            <div>
                                <span className="text-slate-400">参考价日 </span>
                                <span>{t.result.priceDate || '—'}</span>
                            </div>
                            {t.operation.side === 'sell' && (
                                <>
                                    <span className="text-slate-300">|</span>
                                    <div>
                                        <span className="text-slate-400">已实现盈亏 </span>
                                        <span
                                            className={`font-bold ${profitClass(t.result.realizedProfit)}`}
                                        >
                                            {investmentSignedMoney(t.result.realizedProfit)}
                                        </span>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* 交易逻辑与依据说明 */}
                        {t.operation.reason && (
                            <p className="mt-2.5 rounded-lg border border-slate-100 bg-slate-50/50 p-2.5 text-xs leading-relaxed text-slate-600">
                                {t.operation.reason}
                            </p>
                        )}
                    </article>
                );
            })}
        </div>
    );
}

// 投资决策与研究过程
export function InvestmentDecisions({items}: {items: InvestmentDecision[]}) {
    const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

    const toggleExpand = (id: string) => {
        setExpandedIds((prev) => ({...prev, [id]: !prev[id]}));
    };

    if (!items.length) {
        return (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-12 text-center text-xs text-slate-400">
                暂无投资研究与决策记录
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {items.map((d) => {
                const statusMeta = labels[d.status] || {
                    label: d.status,
                    color: 'bg-slate-100 text-slate-600 border-slate-200',
                };
                const isExpanded = Boolean(expandedIds[d.id]);

                return (
                    <article
                        key={d.id}
                        className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-2xs transition-all hover:border-orange-200 hover:shadow-xs"
                    >
                        {/* 头部：状态与时间 */}
                        <div className="flex items-center justify-between gap-3 text-xs">
                            <div className="flex items-center gap-2">
                                <span
                                    className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${statusMeta.color}`}
                                >
                                    {statusMeta.label}
                                </span>
                                {d.referenceDate && (
                                    <span className="flex items-center gap-1 font-mono text-[11px] text-slate-400">
                                        <Calendar className="h-3 w-3" />
                                        <span>参考日 {d.referenceDate}</span>
                                    </span>
                                )}
                            </div>

                            <span className="flex items-center gap-1 font-mono text-[11px] text-slate-400">
                                <Clock className="h-3 w-3" />
                                <span>{investmentTime(d.createdAt)}</span>
                            </span>
                        </div>

                        {/* 决策核心分析与理由 */}
                        <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50/60 p-3 text-xs leading-relaxed text-slate-700">
                            {d.reason || '正在调研市场与分析持仓…'}
                        </div>

                        {/* AI 研究过程与工具调用 */}
                        {d.calls.length > 0 && (
                            <div className="mt-3 pt-2.5 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => toggleExpand(d.id)}
                                    className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-orange-600 transition-colors"
                                >
                                    <Cpu className="h-3.5 w-3.5 text-orange-500" />
                                    <span>研究链路 · {d.calls.length} 次工具调用</span>
                                    {isExpanded ? (
                                        <ChevronDown className="h-3.5 w-3.5" />
                                    ) : (
                                        <ChevronRight className="h-3.5 w-3.5" />
                                    )}
                                </button>

                                {isExpanded && (
                                    <div className="mt-2.5 space-y-2 border-l-2 border-orange-200 pl-3">
                                        {d.calls.map((c, i) => (
                                            <div
                                                key={i}
                                                className="rounded-lg border border-slate-100 bg-slate-50/80 p-2 text-xs"
                                            >
                                                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700">
                                                    <span>
                                                        {i + 1}. {tools[c.tool] || c.tool}
                                                    </span>
                                                    <span className="font-mono text-[10px] text-slate-400">
                                                        {c.tool}
                                                    </span>
                                                </div>

                                                <div className="mt-1.5 font-mono text-[10px] text-slate-600">
                                                    {Boolean(Object.keys(c.arguments || {}).length) && (
                                                        <div className="truncate text-slate-500">
                                                            入参: {JSON.stringify(c.arguments)}
                                                        </div>
                                                    )}
                                                    <pre className="mt-1 max-h-36 overflow-auto rounded bg-slate-900/5 p-1.5 whitespace-pre-wrap break-all text-[10px] text-slate-700">
                                                        {typeof c.result === 'string'
                                                            ? c.result
                                                            : JSON.stringify(c.result, null, 2)}
                                                    </pre>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </article>
                );
            })}
        </div>
    );
}
