import {useState} from 'react';
import type {QuantModels} from '../../../types/api/quant';
import type {QuantBatch, QuantBatchRetry} from '../../../types/api/quantIntake';
import type {QuantRegisterDraft} from '../../../hooks/useQuantNavigation';
import {useQuantBatches} from '../../../hooks/useQuantBatches';
import {quantApi} from '../../../api/quant';
import {createRequestKey} from '../../../utils/requestKey';
import {batchStatus} from '../../../utils/quantIntake';
import {Select} from '../../common/Select';
import {QuantButton, QuantField, QuantModal} from '../ui';
import {BatchCollect} from './BatchCollect';

export function BatchPanel({collection, models, register, request, close, openSource, changed}: {
    collection: string; models: QuantModels; register: QuantRegisterDraft; request: (action: () => void) => void;
    close: () => void; openSource: (entry: string, report?: string) => void; changed: () => void;
}) {
    const [offset, setOffset] = useState(0), [creating, setCreating] = useState(false), [busy, setBusy] = useState(''), [error, setError] = useState('');
    const [retry, setRetry] = useState<{batch: QuantBatch; input: QuantBatchRetry} | null>(null);
    const state = useQuantBatches(collection, offset);
    const act = async (id: string, operation: () => Promise<unknown>) => {
        setBusy(id); setError('');
        try {await operation(); setRetry(null); setOffset(0); state.reload(); changed();}
        catch (cause) {setError(cause instanceof Error ? cause.message : '操作失败，请重试');}
        finally {setBusy('');}
    };
    return <QuantModal title={creating ? '批量收集并分析' : '收集批次'} close={() => request(close)} wide busy={!!busy}>
        {creating ? <BatchCollect collection={collection} models={models} register={register} cancel={() => request(() => setCreating(false))} created={() => {setCreating(false); setOffset(0); state.reload(); changed();}} /> : <>
            <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-600">批次进度与每份资料的研究报告</p><QuantButton primary onClick={() => setCreating(true)}>新建收集批次</QuantButton></div>
            {(error || state.error) && <div role="alert" className="text-sm text-red-600">{error || state.error} <QuantButton onClick={state.reload}>重新加载批次</QuantButton></div>}
            {retry && <div className="space-y-4 rounded-xl border border-slate-200 p-4">
                <p className="text-sm">重新分析「{retry.batch.name}」中 {retry.batch.items.length - retry.batch.completed} 份未完成资料；成功报告保留。将创建新的批次记录。</p>
                <Select menuPortal value={retry.input.modelId} onChange={modelId => setRetry(current => current ? {...current, input: {...current.input, modelId}} : null)} options={models.models.map(model => ({value: model.id, label: model.name}))} emptyMessage="未配置模型，仍将等待" />
                <QuantField label="重试时间上限（秒）" type="number" value={String(retry.input.wallSeconds)} onChange={value => setRetry(current => current ? {...current, input: {...current.input, wallSeconds: Number(value)}} : null)} />
                <div className="flex gap-3"><QuantButton onClick={() => setRetry(null)} disabled={!!busy}>取消重试</QuantButton><QuantButton primary disabled={!!busy || !Number.isInteger(retry.input.wallSeconds) || retry.input.wallSeconds < 30 || retry.input.wallSeconds > 3600} onClick={() => void act(retry.batch.id, () => quantApi.retryBatch(collection, retry.batch.id, retry.input))}>启动新批次</QuantButton></div>
            </div>}
            {state.loading ? <p role="status" className="py-8 text-sm text-slate-500">正在读取批次…</p> : !state.items.length && !state.error ? <p className="py-8 text-sm text-slate-500">还没有收集批次。可导入多个源码文件，或添加多份代码和说明。</p> : state.items.map(batch => <section key={batch.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-base font-semibold">{batch.name}</h3><p className="mt-1 text-xs text-slate-500">{batchStatus[batch.status]} · 完成 {batch.completed}/{batch.items.length} · 已派发资料 {batch.reservedCalls}/{batch.callLimit}</p></div>
                    {['pending', 'running'].includes(batch.status) ? <QuantButton disabled={!!busy} onClick={() => void act(batch.id, () => quantApi.cancelBatch(collection, batch.id))}>停止批次</QuantButton> : batch.retryBatchId ? <span className="text-xs text-slate-500">已创建后续重试批次</span> : batch.completed < batch.items.length && <QuantButton disabled={!!busy} onClick={() => setRetry({batch, input: {requestKey: createRequestKey(), modelId: models.defaultModelId || models.models[0]?.id || '', wallSeconds: batch.plan.wallSeconds}})}>重试未完成资料</QuantButton>}
                </div>
                {batch.message && <p className="mt-3 text-sm text-slate-600">{batch.message}</p>}
                {batch.plan.parentId && <p className="mt-2 text-xs text-slate-500">来自先前批次的未完成资料，保留原来源与历史分析。</p>}
                <ol className="mt-4 divide-y divide-slate-100">{batch.items.map(item => <li key={item.sourceId} className="flex flex-wrap items-start gap-3 py-3"><div className="min-w-0 flex-1"><p className="break-words text-sm">{item.ordinal}. {item.title}</p><p className="mt-1 break-words text-xs text-slate-500">{batchStatus[item.status]}{item.message ? ` · ${item.message}` : ''}</p></div><QuantButton disabled={!item.available} onClick={() => {close(); openSource(item.entryId, item.reportId || undefined);}}>{item.reportId ? '查看报告' : '查看资料'}</QuantButton></li>)}</ol>
            </section>)}
            <div className="flex items-center justify-between text-sm text-slate-500"><span>共 {state.total} 个批次</span><div className="flex gap-2"><QuantButton disabled={state.loading || offset === 0} onClick={() => setOffset(value => Math.max(0, value - 10))}>上一页</QuantButton><QuantButton disabled={state.loading || offset + 10 >= state.total} onClick={() => setOffset(value => value + 10)}>下一页</QuantButton></div></div>
        </>}
    </QuantModal>;
}
