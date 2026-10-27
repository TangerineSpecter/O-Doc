import {useEffect, useState} from 'react';
import {mt4Api} from '../../api/mt4Archive';
import type {MT4TestDetail} from '../../types/api/mt4Archive';
import AuthenticatedResourceImage from '../common/AuthenticatedResourceImage';
import {QuantButton, cardClass} from '../Quant/ui';
import {Attachments} from './Attachments';
import {BalanceChart} from './BalanceChart';
import {LotChart} from './LotChart';
import {reportMetric} from '../../utils/mt4Report';

function ZipChart({collection, expertId, testId}: {collection: string; expertId: string; testId: string}) {
    const [url, setUrl] = useState('');
    const [failed, setFailed] = useState(false);
    useEffect(() => {let live = true; let created = ''; void mt4Api.zipChart(collection, expertId, testId).then(blob => {if (live) {created = URL.createObjectURL(blob); setUrl(created);}}).catch(() => {if (live) setFailed(true);}); return () => {live = false; if (created) URL.revokeObjectURL(created);};}, [collection, expertId, testId]);
    return url ? <img src={url} alt="MT4 报告原始曲线" className="w-full object-contain"/> : <p className="text-sm text-slate-500">{failed ? '原始曲线加载失败，请检查报告附件或补传图片。' : '正在加载原始曲线…'}</p>;
}

export function TestDetail({collection, expertId, detail, reload, back, edit, remove}: {collection: string; expertId: string; detail: MT4TestDetail; reload: () => Promise<void>; back: () => void; edit: () => void; remove: () => void}) {
    const [page, setPage] = useState(0);
    const {backtest, attachments} = detail;
    const chart = attachments.find(item => item.role === 'chart' && item.fileType === 'image');
    const screenshot = attachments.find(item => item.role === 'screenshot' && item.fileType === 'image');
    const report = backtest.data;
    const initial = reportMetric(report, ['起始资金', 'initial deposit']);
    const events = report.events || [];
    return <div className="space-y-4"><div className="flex flex-wrap items-center gap-3"><QuantButton onClick={back}>返回 EA</QuantButton><div className="min-w-0 flex-1"><h2 className="truncate text-xl font-bold text-slate-900">{backtest.title}</h2><p className="text-xs text-slate-500">MT4 回测记录{report.expertVersion ? ` · EA ${report.expertVersion}` : ''}{report.source === 'vision' ? ` · 截图识别${report.visionModel ? `（${report.visionModel}）` : ''}` : report.source === 'html' ? ' · HTML 导入' : ' · 手工或演示记录'}</p></div><QuantButton onClick={edit}>编辑回测</QuantButton><QuantButton danger onClick={remove}>删除</QuantButton></div>
        <section className={cardClass}><div className="grid gap-3 sm:grid-cols-3"><div><p className="text-xs text-slate-500">交易品种</p><p className="mt-1 text-sm">{report.fields?.symbol || '—'}</p></div><div><p className="text-xs text-slate-500">时间周期与区间</p><p className="mt-1 text-sm">{report.fields?.period || '—'}</p></div><div><p className="text-xs text-slate-500">复盘模型</p><p className="mt-1 text-sm">{report.fields?.model || '—'}</p></div></div>{backtest.description && <p className="mt-4 whitespace-pre-wrap text-sm text-slate-600">{backtest.description}</p>}</section>
        <section className={cardClass}><h3 className="mb-3 text-base font-bold">MT4 原图</h3>{chart || screenshot ? <AuthenticatedResourceImage resourceId={(chart || screenshot)!.assetId} alt={chart ? 'MT4 回测曲线图' : '回测截图'} className="max-h-[420px] w-full object-contain"/> : report.hasChart && attachments.some(item => item.role === 'report' && item.name.toLowerCase().endsWith('.zip')) ? <ZipChart collection={collection} expertId={expertId} testId={backtest.id}/> : <p className="text-sm text-slate-500">尚未添加图片，可在下方补传。</p>}</section>
        <section className={cardClass}><h3 className="mb-3 text-base font-bold">平仓余额曲线</h3><BalanceChart events={events} initialBalance={initial}/><LotChart events={events}/></section>
        <section className={cardClass}><h3 className="mb-3 text-base font-bold">回测指标</h3>{report.metrics?.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><tbody>{report.metrics.map((row, index) => <tr key={index} className="border-t border-slate-100">{row.map((cell, i) => <td key={i} className={`px-2 py-2 ${i % 2 ? 'text-right tabular-nums text-slate-800' : 'text-slate-500'}`}>{cell || '—'}</td>)}</tr>)}</tbody></table></div> : <p className="text-sm text-slate-500">暂无指标。</p>}</section>
        <section className={cardClass}><h3 className="mb-3 text-base font-bold">参数快照</h3><div className="flex flex-wrap gap-2">{report.parameters?.length ? report.parameters.map((param, index) => <span key={index} className="rounded-md bg-slate-50 px-2 py-1 text-sm text-slate-700">{param.label || param.name}：{param.value}</span>) : <span className="text-sm text-slate-500">暂无参数</span>}</div></section>
        <section className={cardClass}><h3 className="mb-3 text-base font-bold">交易事件 · {events.length} 条</h3>{events.length ? <><div className="max-h-96 overflow-auto scrollbar-hide"><table className="w-full min-w-[700px] text-left text-xs"><thead><tr className="text-slate-500">{['序号', '时间', '类型', '订单', '手数', '价格', '止损', '止盈', '获利', '余额'].map(label => <th key={label} className="px-2 py-2 font-medium">{label}</th>)}</tr></thead><tbody>{events.slice(page * 100, (page + 1) * 100).map((event, index) => <tr key={`${event.sequence}-${index}`} className="border-t border-slate-100">{[event.sequence,event.time,event.type,event.order,event.lots,event.price,event.stopLoss,event.takeProfit,event.profit,event.balance].map((value, i) => <td key={i} className="whitespace-nowrap px-2 py-2 tabular-nums">{value || '—'}</td>)}</tr>)}</tbody></table></div><div className="mt-3 flex items-center gap-3 text-xs text-slate-500"><QuantButton disabled={page === 0} onClick={() => setPage(page - 1)}>上一页</QuantButton><span>第 {page + 1} / {Math.ceil(events.length / 100)} 页</span><QuantButton disabled={(page + 1) * 100 >= events.length} onClick={() => setPage(page + 1)}>下一页</QuantButton></div></> : <p className="text-sm text-slate-500">没有交易明细。</p>}</section>
        {backtest.conclusion && <section className={cardClass}><h3 className="mb-2 text-base font-bold">回测结论</h3><p className="whitespace-pre-wrap text-sm text-slate-700">{backtest.conclusion}</p></section>}
        <section className={cardClass}><Attachments collection={collection} expertId={expertId} testId={backtest.id} attachments={attachments} reload={reload} imageOnly/></section>
    </div>;
}
