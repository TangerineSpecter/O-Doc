import {useCallback, useState} from 'react';
import {ArrowLeft, Database, Plus, RefreshCw} from 'lucide-react';
import {useQuantDatasets} from '../../hooks/useQuantDatasets';
import type {QuantRegisterDraft} from '../../hooks/useQuantNavigation';
import type {QuantDataset} from '../../types/api/quantDataset';
import {DatasetImport} from './DatasetImport';
import {QuantButton, QuantEmpty, cardClass} from './ui';
export function DatasetLibrary({collection, close, register, request}: {collection: string; close: () => void; register: QuantRegisterDraft; request: (action: () => void) => void}) {
    const [offset, setOffset] = useState(0), [selected, setSelected] = useState(''), [creating, setCreating] = useState(false);
    const controller = useQuantDatasets(collection, offset, selected);
    const {reload} = controller;
    const saved = useCallback((dataset: QuantDataset) => {setCreating(false); setSelected(dataset.id); setOffset(0); reload();}, [reload]);
    const detail = controller.detail;
    return <div className="min-h-0 flex-1 overflow-auto p-4 scrollbar-hide sm:p-6"><div className="mx-auto max-w-6xl space-y-5">
        <section className={cardClass}><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="flex items-center gap-2 text-lg font-semibold"><Database size={20} />实验行情</h2><p className="mt-2 text-sm leading-7 text-slate-500">为参数和因子组合保留可复现的数据快照。再次导入相同内容与名称会复用已有记录。</p></div><div className="flex flex-wrap gap-2"><QuantButton onClick={close}><ArrowLeft size={14} />返回因子库</QuantButton><QuantButton onClick={controller.reload} disabled={controller.loading} aria-label="刷新行情"><RefreshCw size={15} /></QuantButton><QuantButton primary onClick={() => setCreating(true)}><Plus size={15} />导入行情</QuantButton></div></div></section>
        {controller.loading ? <div role="status" className={`${cardClass} text-sm text-slate-500`}>正在加载行情快照…</div> : controller.error ? <div role="alert" className={`${cardClass} space-y-3 text-sm text-red-600`}><p>{controller.error}</p><QuantButton onClick={controller.reload}>重试</QuantButton></div> : !controller.items.length ? <QuantEmpty title="先准备一份实验行情" description="导入一个标的、一个周期的 OHLCV 历史数据，原文件和口径都会保留。" /> : <>
            <div className="grid items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)]"><div className="space-y-2">{controller.items.map(item => <button key={item.id} onClick={() => setSelected(item.id)} aria-pressed={detail?.id === item.id} className={`w-full rounded-2xl border p-4 text-left ${detail?.id === item.id ? 'border-orange-200 bg-orange-50' : 'border-slate-200 bg-white'}`}><h3 className="break-words text-sm font-semibold">{item.name}</h3><p className="mt-2 text-xs leading-6 text-slate-500">{item.symbol} · {item.timeframe}<br />{item.rowCount.toLocaleString()} 根 K 线</p></button>)}</div>
                {detail && <section className={`${cardClass} min-w-0 space-y-5`}><h3 className="break-words text-lg font-semibold">{detail.name}</h3><dl className="grid gap-4 text-sm sm:grid-cols-2">{[['标的 / 周期', `${detail.symbol} / ${detail.timeframe}`], ['时区', detail.timezone], ['复权', detail.priceAdjustment || '未知'], ['来源', detail.source || '未知'], ['开始（UTC）', detail.start], ['结束（UTC）', detail.end]].map(([name, value]) => <div key={name}><dt className="text-xs text-slate-400">{name}</dt><dd className="mt-2 break-words text-slate-700">{value}</dd></div>)}</dl>
                    {!!detail.warnings.length && <div className="rounded-xl bg-amber-50 p-4 text-xs leading-7 text-amber-800">{detail.warnings.map(warning => <p key={warning}>{warning}</p>)}</div>}
                    <div><h4 className="mb-3 text-sm font-semibold">前 {detail.preview?.length || 0} 行预览</h4><div className="overflow-x-auto scrollbar-hide"><table className="w-full text-left text-xs"><thead><tr>{['时间（UTC）', '开盘', '最高', '最低', '收盘', '成交量'].map(title => <th key={title} className="whitespace-nowrap border-b border-slate-200 px-3 py-2 font-medium text-slate-500">{title}</th>)}</tr></thead><tbody>{detail.preview?.map(row => <tr key={row.timestamp}>{[row.timestamp, row.open, row.high, row.low, row.close, row.volume ?? '缺失'].map((value, index) => <td key={index} className="whitespace-nowrap border-b border-slate-100 px-3 py-3 font-mono text-slate-600">{value}</td>)}</tr>)}</tbody></table></div></div>
                    <p className="text-xs leading-6 text-slate-500">时间作为 K 线标签保存；日线日期按所填时区转换。原 CSV 保留，缺失成交量不会填成 0。行情导入本身不构成策略有效性验证。</p><details className="text-xs text-slate-400"><summary>数据版本与指纹</summary><p className="mt-2 break-all leading-6">解析规则：{detail.parserVersion}<br />内容指纹：{detail.contentHash}</p></details>
                </section>}
            </div>
            {controller.total > 20 && <div className="flex justify-end gap-3"><QuantButton disabled={!offset} onClick={() => setOffset(value => Math.max(0, value - 20))}>上一页</QuantButton><QuantButton disabled={offset + 20 >= controller.total} onClick={() => setOffset(value => value + 20)}>下一页</QuantButton></div>}
        </>}
    </div>{creating && <DatasetImport collection={collection} close={() => request(() => setCreating(false))} saved={saved} register={register} />}</div>;
}
