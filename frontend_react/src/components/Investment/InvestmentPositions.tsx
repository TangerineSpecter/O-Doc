import {BarChart2, TrendingUp, TrendingDown} from 'lucide-react';
import type {InvestmentPosition} from '../../types/api/investment';
import {
    investmentMoney,
    investmentSignedMoney,
    profitClass,
    profitBadgeClass,
} from './presentation';

export function InvestmentPositions({
    items,
    onDetail,
}: {
    items: InvestmentPosition[];
    onDetail: (code: string) => void;
}) {
    if (!items.length) {
        return (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-12 text-center text-xs text-slate-400">
                当前暂无股票持仓
            </div>
        );
    }

    return (
        <div className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-2xs">
            {/* 桌面端：高密度行情表格 */}
            <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                            <th className="py-2.5 pl-4 pr-3">标的名称 / 代码</th>
                            <th className="py-2.5 px-3">持仓 / 可用</th>
                            <th className="py-2.5 px-3">收盘价 / 成本</th>
                            <th className="py-2.5 px-3">参考市值 / 成本</th>
                            <th className="py-2.5 px-3 text-right">浮动盈亏 / 收益率</th>
                            <th className="py-2.5 px-3 text-slate-400">估值 / 买入日</th>
                            <th className="py-2.5 pr-4 pl-2 text-right">操作</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100/80 text-xs">
                        {items.map((p) => {
                            const isPositive = Number(p.unrealizedProfit) > 0;
                            const isNegative = Number(p.unrealizedProfit) < 0;

                            return (
                                <tr
                                    key={p.code}
                                    className="group transition-colors hover:bg-orange-50/20"
                                >
                                    {/* 股票名称与代码 */}
                                    <td className="py-3 pl-4 pr-3">
                                        <div className="flex items-center gap-1.5">
                                            <span className="font-bold text-slate-900 group-hover:text-orange-600 transition-colors">
                                                {p.name}
                                            </span>
                                            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-500">
                                                {p.code}
                                            </span>
                                        </div>
                                    </td>

                                    {/* 持仓数量与可卖数量 */}
                                    <td className="py-3 px-3 font-mono">
                                        <span className="font-semibold text-slate-800">
                                            {p.quantity}
                                        </span>
                                        <span className="text-[11px] text-slate-400">
                                            {' '}
                                            / 可卖 {p.availableQuantity}
                                        </span>
                                    </td>

                                    {/* 收盘价与成本 */}
                                    <td className="py-3 px-3 font-mono">
                                        <div className="font-semibold text-slate-800">
                                            ¥{investmentMoney(p.closePrice)}
                                        </div>
                                        <div className="text-[11px] text-slate-400">
                                            成本 ¥{investmentMoney(p.averageCost)}
                                        </div>
                                    </td>

                                    {/* 参考市值与总成本 */}
                                    <td className="py-3 px-3 font-mono">
                                        <div className="font-semibold text-slate-800">
                                            ¥{investmentMoney(p.marketValue)}
                                        </div>
                                        <div className="text-[11px] text-slate-400">
                                            成本 ¥{investmentMoney(p.cost)}
                                        </div>
                                    </td>

                                    {/* 浮动盈亏与盈亏率 */}
                                    <td className="py-3 px-3 text-right font-mono">
                                        <div className={`font-bold ${profitClass(p.unrealizedProfit)}`}>
                                            {investmentSignedMoney(p.unrealizedProfit)}
                                        </div>
                                        <div
                                            className={`mt-0.5 inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold border leading-tight ${profitBadgeClass(
                                                p.unrealizedProfit
                                            )}`}
                                        >
                                            {isPositive ? (
                                                <TrendingUp className="h-2.5 w-2.5 text-rose-600" />
                                            ) : isNegative ? (
                                                <TrendingDown className="h-2.5 w-2.5 text-emerald-600" />
                                            ) : null}
                                            <span>
                                                {Number(p.returnPercent) > 0 ? '+' : ''}
                                                {investmentMoney(p.returnPercent)}%
                                            </span>
                                        </div>
                                    </td>

                                    {/* 估值日期与首次买入 */}
                                    <td className="py-3 px-3 text-[11px] text-slate-400">
                                        <div>估值 {p.priceDate || '—'}</div>
                                        <div>买入 {p.firstBought}</div>
                                    </td>

                                    {/* 操作按钮 */}
                                    <td className="py-3 pr-4 pl-2 text-right">
                                        <button
                                            type="button"
                                            onClick={() => onDetail(p.code)}
                                            className="inline-flex shrink-0 whitespace-nowrap items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-2xs transition-colors hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600 active:scale-95"
                                        >
                                            <BarChart2 className="h-3 w-3" />
                                            <span>持仓详情</span>
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* 移动端：紧凑响应式卡片 */}
            <div className="block md:hidden divide-y divide-slate-100">
                {items.map((p) => (
                    <article key={p.code} className="p-3.5 space-y-2">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                                <span className="font-bold text-slate-900">{p.name}</span>
                                <span className="font-mono text-xs text-slate-400">({p.code})</span>
                            </div>
                            <div className="text-right font-mono">
                                <span className={`font-bold ${profitClass(p.unrealizedProfit)}`}>
                                    {investmentSignedMoney(p.unrealizedProfit)}
                                </span>
                                <span className="ml-1 text-xs text-slate-500">
                                    ({investmentMoney(p.returnPercent)}%)
                                </span>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs font-mono text-slate-600 bg-slate-50/60 p-2 rounded-lg">
                            <div>
                                <span className="text-slate-400">市值 </span>¥{investmentMoney(p.marketValue)}
                            </div>
                            <div>
                                <span className="text-slate-400">成本 </span>¥{investmentMoney(p.cost)}
                            </div>
                            <div>
                                <span className="text-slate-400">现价 </span>¥{investmentMoney(p.closePrice)}
                            </div>
                            <div>
                                <span className="text-slate-400">持仓 </span>{p.quantity} 股
                            </div>
                        </div>

                        <div className="flex items-center justify-between pt-1">
                            <span className="text-[11px] text-slate-400">
                                估值 {p.priceDate || '—'}
                            </span>
                            <button
                                type="button"
                                onClick={() => onDetail(p.code)}
                                className="text-xs font-semibold text-orange-600"
                            >
                                持仓详情 →
                            </button>
                        </div>
                    </article>
                ))}
            </div>
        </div>
    );
}
