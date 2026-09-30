import {useCallback, useEffect, useState} from 'react';
import {
    AlertCircle,
    BarChart2,
    ChevronLeft,
    ChevronRight,
    ExternalLink,
    RefreshCw,
    TrendingUp,
    Wallet,
} from 'lucide-react';
import {getInvestmentOverview, getInvestmentPositions} from '../../api/investment';
import type {InvestmentOverview, InvestmentPosition} from '../../types/api/investment';
import WorldDialog from './WorldDialog';
import {InvestmentPositions} from '../Investment/InvestmentPositions';
import {InvestmentDetail} from '../Investment/InvestmentDetail';
import {investmentMoney, investmentSignedMoney, profitClass} from '../Investment/presentation';

interface AgentHoldingsDialogProps {
    agentId: string;
    name: string;
    onClose: () => void;
    onOpenFullInvestment?: (actorId?: string) => void;
}

export function AgentHoldingsDialog({
    agentId,
    name,
    onClose,
    onOpenFullInvestment,
}: AgentHoldingsDialogProps) {
    const [overview, setOverview] = useState<InvestmentOverview | null>(null);
    const [positions, setPositions] = useState<InvestmentPosition[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [notOpened, setNotOpened] = useState(false);
    const [error, setError] = useState('');
    const [detailCode, setDetailCode] = useState<string | null>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    const refresh = useCallback(() => {
        setRefreshTrigger((v) => v + 1);
    }, []);

    useEffect(() => {
        let alive = true;
        const controller = new AbortController();

        void (async () => {
            setLoading(true);
            setError('');
            setNotOpened(false);
            try {
                if (page === 1) {
                    const data = await getInvestmentOverview(agentId, controller.signal);
                    if (!alive || controller.signal.aborted) return;
                    setOverview(data);
                    setPositions(data.positions.items);
                    setTotal(data.positions.total);
                } else {
                    const pageData = await getInvestmentPositions(agentId, page, controller.signal);
                    if (!alive || controller.signal.aborted) return;
                    setPositions(pageData.items);
                    setTotal(pageData.total);
                }
            } catch (err: unknown) {
                if (!alive || controller.signal.aborted) return;
                const message = err instanceof Error ? err.message : String(err);
                // 后端未开立投资账户时返回 404 或特定提示
                if (message.includes('404') || message.includes('没有该投资账户') || message.includes('未找到')) {
                    setNotOpened(true);
                } else {
                    setError(message || '获取持仓明细失败');
                }
            } finally {
                if (alive && !controller.signal.aborted) {
                    setLoading(false);
                }
            }
        })();

        return () => {
            alive = false;
            controller.abort();
        };
    }, [agentId, page, refreshTrigger]);

    // 计算总资产 = 可用现金 + 持仓市值
    const totalAssets = overview
        ? (Number(overview.balance || 0) + Number(overview.marketValue || 0)).toFixed(2)
        : '0.00';

    const totalPages = Math.max(1, Math.ceil(total / 20));

    return (
        <>
            <WorldDialog
                title={`${name} · 持仓明细`}
                description="居民自主模拟交易持仓 · 实时收盘估值与浮动盈亏"
                size="wide"
                onClose={onClose}
            >
                <div className="space-y-4">
                    {/* 顶部概览与操作栏 */}
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3">
                        {/* 左侧说明 */}
                        <div className="flex items-center gap-2">
                            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100 text-orange-600 shadow-2xs">
                                <TrendingUp className="h-4 w-4" />
                            </span>
                            <div>
                                <h4 className="text-xs font-bold text-slate-800">
                                    {name} 的 A 股持仓
                                </h4>
                                <p className="text-[11px] text-slate-400">
                                    收盘价模拟成交 · 最少1股 · T+1结算 · 手续费0
                                </p>
                            </div>
                        </div>

                        {/* 右侧操作按钮 */}
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={refresh}
                                disabled={loading}
                                aria-label="刷新持仓"
                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-2xs transition-colors hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600 active:scale-95 disabled:opacity-50"
                            >
                                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-orange-500' : ''}`} />
                                <span>刷新</span>
                            </button>

                            {onOpenFullInvestment ? (
                                <button
                                    type="button"
                                    onClick={() => onOpenFullInvestment(agentId)}
                                    className="inline-flex items-center gap-1 rounded-lg border border-orange-200 bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs transition-colors hover:bg-orange-600 active:scale-95"
                                >
                                    <span>投资中心</span>
                                    <ExternalLink className="h-3.5 w-3.5" />
                                </button>
                            ) : null}
                        </div>
                    </div>

                    {/* 错误提示 */}
                    {error && (
                        <div
                            role="alert"
                            className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"
                        >
                            <div className="flex items-center gap-2">
                                <AlertCircle className="h-4 w-4 shrink-0" />
                                <span>{error}</span>
                            </div>
                            <button
                                type="button"
                                onClick={refresh}
                                className="font-semibold underline hover:text-rose-900"
                            >
                                重试
                            </button>
                        </div>
                    )}

                    {/* 未开立投资账户空状态 */}
                    {notOpened && !loading && (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center">
                            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                                <BarChart2 className="h-6 w-6" />
                            </div>
                            <h4 className="mt-3 text-sm font-semibold text-slate-800">
                                暂未开立股票投资账户
                            </h4>
                            <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-slate-400">
                                该居民尚未参与 A 股模拟投资。如需开启投资，请在「系统设置 → Agent → 任务」中启用「A 股投资」能力。
                            </p>
                        </div>
                    )}

                    {/* 资产仪表盘卡片（总资产、持仓市值、可用资金、浮动盈亏） */}
                    {!notOpened && overview && (
                        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                            {/* 总资产 */}
                            <div className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs">
                                <div className="flex items-center justify-between text-slate-400">
                                    <span className="text-[11px]">投资总资产</span>
                                    <Wallet className="h-3.5 w-3.5" />
                                </div>
                                <div className="mt-1 font-mono text-base font-bold text-slate-900 truncate">
                                    ¥{investmentMoney(totalAssets)}
                                </div>
                            </div>

                            {/* 持仓市值 */}
                            <div className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs">
                                <div className="flex items-center justify-between text-slate-400">
                                    <span className="text-[11px]">持仓市值</span>
                                    <BarChart2 className="h-3.5 w-3.5 text-blue-500" />
                                </div>
                                <div className="mt-1 font-mono text-base font-bold text-slate-800 truncate">
                                    ¥{investmentMoney(overview.marketValue)}
                                </div>
                            </div>

                            {/* 可用现金 */}
                            <div className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs">
                                <div className="flex items-center justify-between text-slate-400">
                                    <span className="text-[11px]">可用资金</span>
                                    <Wallet className="h-3.5 w-3.5 text-amber-500" />
                                </div>
                                <div className="mt-1 font-mono text-base font-bold text-slate-800 truncate">
                                    ¥{investmentMoney(overview.balance)}
                                </div>
                            </div>

                            {/* 浮动盈亏 */}
                            <div className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs">
                                <div className="flex items-center justify-between text-slate-400">
                                    <span className="text-[11px]">持仓浮动盈亏</span>
                                    <TrendingUp className="h-3.5 w-3.5" />
                                </div>
                                <div className={`mt-1 font-mono text-base font-bold truncate ${profitClass(overview.unrealizedProfit)}`}>
                                    {investmentSignedMoney(overview.unrealizedProfit)}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 加载中状态 */}
                    {loading && !overview && (
                        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                            <RefreshCw className="h-6 w-6 animate-spin text-orange-500" />
                            <span className="mt-2 text-xs">正在调取持仓数据…</span>
                        </div>
                    )}

                    {/* 持仓列表 */}
                    {!notOpened && !loading && (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between px-1">
                                <span className="text-xs font-semibold text-slate-700">
                                    持仓列表
                                    {total > 0 ? (
                                        <span className="ml-1 text-[11px] font-normal text-slate-400">
                                            ({total} 只股票)
                                        </span>
                                    ) : null}
                                </span>
                            </div>

                            <InvestmentPositions
                                items={positions}
                                onDetail={(code) => setDetailCode(code)}
                            />

                            {/* 分页控制 */}
                            {totalPages > 1 && (
                                <div className="flex items-center justify-between pt-2">
                                    <span className="text-xs text-slate-400">
                                        第 {page} / {totalPages} 页 · 共 {total} 条
                                    </span>
                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            disabled={page <= 1}
                                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                                            className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-1 text-slate-600 shadow-2xs hover:bg-slate-50 disabled:opacity-40"
                                            aria-label="上一页"
                                        >
                                            <ChevronLeft className="h-4 w-4" />
                                        </button>
                                        <button
                                            type="button"
                                            disabled={page >= totalPages}
                                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                            className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-1 text-slate-600 shadow-2xs hover:bg-slate-50 disabled:opacity-40"
                                            aria-label="下一页"
                                        >
                                            <ChevronRight className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </WorldDialog>

            {/* 单股技术指标与K线详情弹窗 */}
            {detailCode && (
                <InvestmentDetail
                    actorId={agentId}
                    code={detailCode}
                    onClose={() => setDetailCode(null)}
                />
            )}
        </>
    );
}
