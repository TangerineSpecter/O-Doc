import {useEffect, useState} from 'react';
import {getInvestmentDetail} from '../../api/investment';
import type {InvestmentDetail as Detail} from '../../types/api/investment';
import WorldDialog from '../AgentWorld/WorldDialog';
import {investmentMoney} from './presentation';
export function InvestmentDetail({actorId, code, onClose}: {actorId: string; code: string; onClose: () => void}) {
    const [data, setData] = useState<Detail | null>(null);
    const [error, setError] = useState('');
    const [retry, setRetry] = useState(0);
    useEffect(() => {
        const controller = new AbortController();
        void getInvestmentDetail(actorId, code, controller.signal).then(d => {if (!controller.signal.aborted) setData(d);}).catch(e => {if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '详情加载失败');});
        return () => controller.abort();
    }, [actorId, code, retry]);
    const indicators = data?.analysis?.indicators;
    return <WorldDialog title="持仓详情" onClose={onClose}><div className="space-y-4">{error ? <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-600">{error}<button type="button" onClick={() => {setData(null); setError(''); setRetry(v => v + 1);}} className="ml-3 font-semibold">重试</button></p> : !data ? <p className="py-12 text-center text-sm text-slate-400">正在读取持仓与指标…</p> : <><div><h3 className="font-semibold text-slate-800">{data.position.name} · {code}</h3><p className="mt-1 text-xs text-slate-400">首次买入 {data.position.firstBought} · 最近加仓 {data.position.lastBought}</p></div><p className="whitespace-pre-wrap rounded-2xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-600">{data.position.buyReason}</p>{indicators && <><p className="text-xs text-slate-500">指标截至 {data.analysis?.asOf} · 前复权日线 · {indicators.sampleCount} 个样本</p><dl className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 p-4 text-sm"><div><dt className="text-xs text-slate-400">RSI(14)</dt><dd>{investmentMoney(indicators.rsi14)}</dd></div><div><dt className="text-xs text-slate-400">近5日涨跌幅</dt><dd>{investmentMoney(indicators.change5)}%</dd></div><div><dt className="text-xs text-slate-400">MACD DIF / DEA / 柱值</dt><dd className="break-words text-xs">{indicators.macd.dif} / {indicators.macd.dea} / {indicators.macd.histogram}</dd></div><div><dt className="text-xs text-slate-400">MA5 / 20 / 60</dt><dd className="text-xs">{Object.values(indicators.ma).map(v => investmentMoney(v)).join(' / ')}</dd></div></dl></>}{!indicators && <p className="text-xs text-slate-400">{data.analysisError || '暂无可用指标，仍可查看持仓成本与成交记录。'}</p>}</>}</div></WorldDialog>;
}
