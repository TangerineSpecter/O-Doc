import {useEffect, useState} from 'react';
import {AlertCircle, LineChart} from 'lucide-react';
import {getInvestmentDetail} from '../../api/investment';
import type {InvestmentDetail as Detail} from '../../types/api/investment';
import WorldDialog from '../AgentWorld/WorldDialog';
import {investmentMoney} from './presentation';

export function InvestmentDetail({
    actorId,
    code,
    onClose,
}: {
    actorId: string;
    code: string;
    onClose: () => void;
}) {
    const [data, setData] = useState<Detail | null>(null);
    const [error, setError] = useState('');
    const [retry, setRetry] = useState(0);

    useEffect(() => {
        const controller = new AbortController();
        void getInvestmentDetail(actorId, code, controller.signal)
            .then((d) => {
                if (!controller.signal.aborted) setData(d);
            })
            .catch((e) => {
                if (!controller.signal.aborted)
                    setError(e instanceof Error ? e.message : '详情加载失败');
            });
        return () => controller.abort();
    }, [actorId, code, retry]);

    const indicators = data?.analysis?.indicators;

    return (
        <WorldDialog title="持仓分析与技术指标" onClose={onClose}>
            <div className="space-y-4">
                {error ? (
                    <div
                        role="alert"
                        className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700"
                    >
                        <div className="flex items-center gap-1.5">
                            <AlertCircle className="h-4 w-4 shrink-0" />
                            <span>{error}</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                setData(null);
                                setError('');
                                setRetry((v) => v + 1);
                            }}
                            className="font-semibold underline hover:text-red-900"
                        >
                            重试
                        </button>
                    </div>
                ) : !data ? (
                    <div className="flex h-40 flex-col items-center justify-center text-xs text-slate-400">
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
                        <span className="mt-2">正在读取持仓与最新指标…</span>
                    </div>
                ) : (
                    <>
                        {/* 标的头部 */}
                        <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-base font-bold text-slate-900">
                                        {data.position.name}
                                    </h3>
                                    <span className="rounded bg-slate-200/80 px-1.5 py-0.5 font-mono text-xs text-slate-600">
                                        {code}
                                    </span>
                                </div>
                                <span className="font-mono text-xs text-slate-500">
                                    持仓 {data.position.quantity} 股
                                </span>
                            </div>
                            <div className="mt-1.5 flex items-center gap-3 text-[11px] text-slate-400">
                                <span>首次买入 {data.position.firstBought}</span>
                                <span>·</span>
                                <span>最近加仓 {data.position.lastBought}</span>
                            </div>
                        </div>

                        {/* 建仓逻辑说明 */}
                        {data.position.buyReason && (
                            <div className="space-y-1">
                                <span className="text-xs font-semibold text-slate-700">
                                    建仓与加仓理由
                                </span>
                                <p className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 text-xs leading-relaxed text-slate-600">
                                    {data.position.buyReason}
                                </p>
                            </div>
                        )}

                        {/* 技术指标分析 */}
                        {indicators ? (
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                                        <LineChart className="h-3.5 w-3.5 text-orange-500" />
                                        <span>量化技术指标</span>
                                    </div>
                                    <span className="text-[10px] text-slate-400">
                                        截至 {data.analysis?.asOf} · 前复权日线 · {indicators.sampleCount} 样本
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 gap-2.5 font-mono text-xs">
                                    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
                                        <div className="text-[11px] text-slate-400 font-sans">
                                            RSI (14)
                                        </div>
                                        <div className="mt-1 text-sm font-bold text-slate-800">
                                            {investmentMoney(indicators.rsi14)}
                                        </div>
                                    </div>

                                    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
                                        <div className="text-[11px] text-slate-400 font-sans">
                                            近 5 日涨跌幅
                                        </div>
                                        <div
                                            className={`mt-1 text-sm font-bold ${
                                                indicators.change5 > 0
                                                    ? 'text-rose-600'
                                                    : indicators.change5 < 0
                                                      ? 'text-emerald-600'
                                                      : 'text-slate-800'
                                            }`}
                                        >
                                            {indicators.change5 > 0 ? '+' : ''}
                                            {investmentMoney(indicators.change5)}%
                                        </div>
                                    </div>

                                    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs col-span-2">
                                        <div className="text-[11px] text-slate-400 font-sans">
                                            MACD (DIF / DEA / 柱值)
                                        </div>
                                        <div className="mt-1 font-semibold text-slate-800">
                                            {indicators.macd.dif} / {indicators.macd.dea} /{' '}
                                            <span
                                                className={
                                                    indicators.macd.histogram > 0
                                                        ? 'text-rose-600'
                                                        : 'text-emerald-600'
                                                }
                                            >
                                                {indicators.macd.histogram}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs col-span-2">
                                        <div className="text-[11px] text-slate-400 font-sans">
                                            移动平均线 (MA5 / MA20 / MA60)
                                        </div>
                                        <div className="mt-1 font-semibold text-slate-800">
                                            {Object.values(indicators.ma)
                                                .map((v) => `¥${investmentMoney(v)}`)
                                                .join(' / ')}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
                                {data.analysisError ||
                                    '暂无可用技术指标，仍可查看持仓成本与成交记录。'}
                            </p>
                        )}
                    </>
                )}
            </div>
        </WorldDialog>
    );
}
