import {useState} from 'react';
import {
    BarChart2,
    Coins,
    HelpCircle,
    Receipt,
    RefreshCw,
    TrendingUp,
    Wallet,
    Brain,
} from 'lucide-react';
import {useInvestment} from '../../hooks/useInvestment';
import type {InvestmentTab} from '../../types/api/investment';
import WorldDialog from '../AgentWorld/WorldDialog';
import {Select} from '../common/Select';
import {InvestmentPositions} from './InvestmentPositions';
import {InvestmentTrades, InvestmentDecisions} from './InvestmentRecords';
import {InvestmentDetail} from './InvestmentDetail';
import {investmentMoney, investmentSignedMoney, profitClass} from './presentation';

const tabs: Array<{value: InvestmentTab; label: string; icon: React.ElementType}> = [
    {value: 'positions', label: '当前持仓', icon: BarChart2},
    {value: 'trades', label: '成交记录', icon: Receipt},
    {value: 'decisions', label: '投资决策', icon: Brain},
];

export default function InvestmentDialog({onClose}: {onClose: () => void}) {
    const investment = useInvestment();
    const [detail, setDetail] = useState<string | null>(null);
    const [showRule, setShowRule] = useState(false);

    const current =
        investment.tab === 'positions'
            ? investment.positions
            : investment.tab === 'trades'
              ? investment.trades
              : investment.decisions;
    const summary = investment.overview;

    // 计算总资产 = 可用现金 + 持仓市值
    const totalAssets = summary
        ? (Number(summary.balance || 0) + Number(summary.marketValue || 0)).toFixed(2)
        : '0.00';

    return (
        <>
            <WorldDialog
                title="股票投资"
                description="跟随市场行情，记录居民自主投资决策与模拟盈亏"
                onClose={onClose}
                size="extra-wide"
            >
                <div className="space-y-3.5">
                    {/* 顶部综合操作控制条 */}
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50/50 p-2.5">
                        {/* 左侧说明与规则提示 */}
                        <div className="flex items-center gap-2">
                            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-100 text-orange-600">
                                <TrendingUp className="h-4 w-4" />
                            </span>
                            <div>
                                <div className="flex items-center gap-1.5">
                                    <h4 className="text-xs font-bold text-slate-800">
                                        沪深 A 股模拟交易
                                    </h4>
                                    <button
                                        type="button"
                                        onClick={() => setShowRule(!showRule)}
                                        title="点击查看模拟规则"
                                        className="text-slate-400 hover:text-slate-600"
                                    >
                                        <HelpCircle className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                                <p className="text-[11px] text-slate-400">
                                    收盘价模拟成交 · 最少1股 · T+1结算 · 手续费0
                                </p>
                            </div>
                        </div>

                        {/* 右侧居民选择与刷新 */}
                        <div className="flex items-center gap-2">
                            <div className="w-40">
                                <Select
                                    menuPortal
                                    value={investment.actorId}
                                    onChange={(value) => {
                                        setDetail(null);
                                        investment.setActorId(value);
                                    }}
                                    options={investment.residents.map((r) => ({
                                        value: r.id,
                                        label: r.name,
                                    }))}
                                    placeholder="选择投资居民"
                                    buttonClassName="!py-1.5 text-xs"
                                />
                            </div>

                            <button
                                type="button"
                                onClick={investment.refresh}
                                aria-label="刷新投资账户"
                                className="inline-flex shrink-0 whitespace-nowrap items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-2xs transition-colors hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600 active:scale-95"
                            >
                                <RefreshCw
                                    className={`h-3.5 w-3.5 ${investment.loading ? 'animate-spin text-orange-500' : ''}`}
                                />
                                <span>刷新</span>
                            </button>
                        </div>
                    </div>

                    {/* 可折叠的交易规则说明 */}
                    {showRule && (
                        <div className="rounded-xl border border-orange-200/80 bg-orange-50/50 p-3 text-xs leading-relaxed text-slate-600">
                            <p className="font-semibold text-orange-800">模拟交易规则说明：</p>
                            <p className="mt-1 text-[11px] text-slate-600">
                                • 成交与估值均采用最近已发布的收盘数据，模拟价差收益，暂未计分红送转。
                            </p>
                            <p className="text-[11px] text-slate-600">
                                • 居民将在统一生活安排触发时自主研判市场、行业及标的技术指标并决策。如需开启，请在「设置 → Agent → 任务」中启用「A 股投资」能力。
                            </p>
                        </div>
                    )}

                    {/* 专业资产仪表盘（Asset Dashboard） */}
                    {summary && (
                        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
                            {/* 总资产 */}
                            <div className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs">
                                <div className="flex items-center justify-between text-slate-400">
                                    <span className="text-[11px]">总资产 (元)</span>
                                    <Wallet className="h-3.5 w-3.5 text-slate-400" />
                                </div>
                                <div className="mt-1 text-base font-extrabold font-mono text-slate-900 truncate">
                                    ¥{investmentMoney(totalAssets)}
                                </div>
                            </div>

                            {/* 持仓市值 */}
                            <div className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs">
                                <div className="flex items-center justify-between text-slate-400">
                                    <span className="text-[11px]">持仓市值</span>
                                    <BarChart2 className="h-3.5 w-3.5 text-blue-500" />
                                </div>
                                <div className="mt-1 text-base font-bold font-mono text-slate-800 truncate">
                                    ¥{investmentMoney(summary.marketValue)}
                                </div>
                            </div>

                            {/* 可用余额 */}
                            <div className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs">
                                <div className="flex items-center justify-between text-slate-400">
                                    <span className="text-[11px]">可用现金</span>
                                    <Coins className="h-3.5 w-3.5 text-amber-500" />
                                </div>
                                <div className="mt-1 text-base font-bold font-mono text-slate-800 truncate">
                                    ¥{investmentMoney(summary.balance)}
                                </div>
                            </div>

                            {/* 浮动盈亏 */}
                            <div className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs">
                                <div className="flex items-center justify-between text-slate-400">
                                    <span className="text-[11px]">持仓浮动盈亏</span>
                                    <TrendingUp className="h-3.5 w-3.5 text-rose-500" />
                                </div>
                                <div
                                    className={`mt-1 text-base font-bold font-mono truncate ${profitClass(
                                        summary.unrealizedProfit
                                    )}`}
                                >
                                    {investmentSignedMoney(summary.unrealizedProfit)}
                                </div>
                            </div>

                            {/* 已实现盈亏 */}
                            <div className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs col-span-2 sm:col-span-1">
                                <div className="flex items-center justify-between text-slate-400">
                                    <span className="text-[11px]">已实现盈亏</span>
                                    <Receipt className="h-3.5 w-3.5 text-emerald-500" />
                                </div>
                                <div
                                    className={`mt-1 text-base font-bold font-mono truncate ${profitClass(
                                        summary.realizedProfit
                                    )}`}
                                >
                                    {investmentSignedMoney(summary.realizedProfit)}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 选项卡切换栏 */}
                    <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                        <div className="flex rounded-lg bg-slate-100 p-1">
                            {tabs.map((t) => {
                                const Icon = t.icon;
                                const isActive = investment.tab === t.value;

                                return (
                                    <button
                                        type="button"
                                        key={t.value}
                                        onClick={() => investment.setTab(t.value)}
                                        aria-pressed={isActive}
                                        className={`inline-flex shrink-0 whitespace-nowrap items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-all ${
                                            isActive
                                                ? 'bg-white font-semibold text-slate-800 shadow-2xs'
                                                : 'font-medium text-slate-500 hover:text-slate-900'
                                        }`}
                                    >
                                        <Icon className="h-3.5 w-3.5 shrink-0" />
                                        <span>{t.label}</span>
                                    </button>
                                );
                            })}
                        </div>

                        {current && (
                            <span className="text-xs text-slate-400">
                                共 {current.total} 项
                            </span>
                        )}
                    </div>

                    {investment.error && (
                        <div
                            role="alert"
                            className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700"
                        >
                            {investment.error}
                        </div>
                    )}

                    {/* 主列表内容 */}
                    <div className="min-h-[280px]">
                        {investment.loading && !current ? (
                            <div className="flex h-48 flex-col items-center justify-center text-xs text-slate-400">
                                <div className="h-5 w-5 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
                                <span className="mt-2">正在加载投资账户…</span>
                            </div>
                        ) : !current?.items.length ? (
                            <div className="flex h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white text-center text-xs text-slate-400">
                                {!investment.residents.length
                                    ? '请先在任务配置中为居民开启「A 股投资」'
                                    : investment.tab === 'positions'
                                      ? '目前没有股票持仓，居民将在适当时机研判建仓'
                                      : '暂无记录'}
                            </div>
                        ) : investment.tab === 'positions' ? (
                            <InvestmentPositions
                                items={investment.positions?.items || []}
                                onDetail={setDetail}
                            />
                        ) : investment.tab === 'trades' ? (
                            <InvestmentTrades items={investment.trades?.items || []} />
                        ) : (
                            <InvestmentDecisions items={investment.decisions?.items || []} />
                        )}
                    </div>

                    {/* 分页控制栏 */}
                    {current && current.total > 20 && (
                        <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
                            <span>
                                第 {investment.page} 页 · 共 {current.total} 条
                            </span>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    disabled={investment.page <= 1}
                                    onClick={() => investment.setPage(investment.page - 1)}
                                    className="inline-flex shrink-0 whitespace-nowrap items-center rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 shadow-2xs hover:bg-slate-50 disabled:opacity-40"
                                >
                                    上一页
                                </button>
                                <button
                                    type="button"
                                    disabled={investment.page * 20 >= current.total}
                                    onClick={() => investment.setPage(investment.page + 1)}
                                    className="inline-flex shrink-0 whitespace-nowrap items-center rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 shadow-2xs hover:bg-slate-50 disabled:opacity-40"
                                >
                                    下一页
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </WorldDialog>

            {/* 持仓与指标详情弹窗 */}
            {detail && (
                <InvestmentDetail
                    actorId={investment.actorId}
                    code={detail}
                    onClose={() => setDetail(null)}
                />
            )}
        </>
    );
}
