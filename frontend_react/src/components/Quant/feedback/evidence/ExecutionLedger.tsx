import type {QuantExecutionEvidence} from '../../../../types/api/quantPlatformEvidence';
import {EvidenceRows} from './EvidenceRows';
import {ExecutionProvenance} from './ExecutionProvenance';

const kinds = {trade: '已平仓交易', cash_flow: '外部现金流', equity: '净值采样', operation: '平台操作事件'};
const display = (value: string | null) => value === null ? '未知' : value;
export function ExecutionLedger({evidence}: {evidence: QuantExecutionEvidence}) {
    return <details className="rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer text-sm font-semibold">完整记录与原文定位 · {evidence.records.length} 项</summary><p className="mt-3 text-xs leading-6 text-slate-500">按原始记录顺序展示，不按时间重新排序。UTC 时间未知时保留原时间；未平仓/修改/挂单等操作不混入已平仓交易数。</p>
        <EvidenceRows items={evidence.records} render={row => <div className="space-y-2 text-xs leading-6 text-slate-600"><div className="flex flex-wrap justify-between gap-2"><strong className="break-all font-medium text-slate-800">原序 {row.sequence} · {row.id}</strong><span>{kinds[row.kind]}</span></div><p className="break-words">UTC：{row.timestamp ?? '未知'}{row.raw_timestamp ? ` · 原时间：${row.raw_timestamp}` : ''}</p>
            {row.kind === 'trade' && <><p className="break-words">利润 {row.profit} · {row.profit_basis === 'net' ? '已含费用的净额' : row.profit_basis === 'gross' ? '毛额' : '净/毛口径未知'}<br/>佣金 {display(row.commission)} · 隔夜费 {display(row.swap)} · 其他费 {display(row.fees)}<br/>报告余额 {display(row.balance)}</p><p className="break-words">{row.symbol || '标的未说明'} · {row.side || '方向未说明'} · 数量 {display(row.volume)}{row.order_id ? ` · 订单 ${row.order_id}` : ''}{row.operation ? ` · ${row.operation}` : ''}</p></>}
            {row.kind === 'cash_flow' && <p>现金变化 {row.amount} · 报告余额 {display(row.balance)}</p>}
            {row.kind === 'equity' && <p>报告净值 {row.equity} · 报告余额 {display(row.balance)}</p>}
            {row.kind === 'operation' && <p className="break-words">{row.operation} · 订单 {row.order_id || '未说明'} · 数量 {display(row.volume)} · 价格 {display(row.price)} · 报告利润 {display(row.profit)} · 余额 {display(row.balance)}</p>}
            <ExecutionProvenance value={row.provenance} reference={row.ref}/>
        </div>}/>
    </details>;
}
