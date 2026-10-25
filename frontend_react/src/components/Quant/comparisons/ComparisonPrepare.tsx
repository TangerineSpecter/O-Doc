import {useState} from 'react';
import {quantApi} from '../../../api/quant';
import type {QuantComparison} from '../../../types/api/quantComparison';
import type {QuantDataset} from '../../../types/api/quantDataset';
import type {QuantFactorCandidate} from '../../../types/api/quant';
import {useQuantFactors} from '../../../hooks/useQuantFactors';
import {useQuantDatasets} from '../../../hooks/useQuantDatasets';
import {useQuantDraftRegistration, type QuantRegisterDraft} from '../../../hooks/useQuantNavigation';
import {createRequestKey} from '../../../utils/requestKey';
import {Select} from '../../common/Select';
import {QuantButton, QuantField, QuantModal} from '../ui';
import {SeedEditor} from '../experiments/SeedEditor';
import {buildSeed, initialSeed, type SeedDraft} from '../experiments/plan';

interface SideDraft {candidate: QuantFactorCandidate; draft: SeedDraft}
export function ComparisonPrepare({collection, initial, register, close, saved}: {
    collection: string; initial?: QuantFactorCandidate; register: QuantRegisterDraft; close: () => void; saved: (value: QuantComparison) => void;
}) {
    const [left, setLeft] = useState<SideDraft | null>(() => initial ? {candidate: initial, draft: initialSeed(initial)} : null);
    const [right, setRight] = useState<SideDraft | null>(null);
    const [q, setQuery] = useState(''), [offset, setOffset] = useState(0), [datasetOffset, setDatasetOffset] = useState(0);
    const [selectedDataset, setSelectedDataset] = useState<QuantDataset | null>(null);
    const candidates = useQuantFactors(collection, {q, groupBy: 'none', limit: 100, offset});
    const datasets = useQuantDatasets(collection, datasetOffset, '');
    const dataset = selectedDataset || datasets.detail;
    const [name, setName] = useState('候选输出对照'), [absolute, setAbsolute] = useState('0.000000001'), [relative, setRelative] = useState('0.0000001'), [warmup, setWarmup] = useState('0');
    const [key, setKey] = useState(createRequestKey), [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
    useQuantDraftRegistration('comparison-prepare', dirty, undefined, register);
    const change = () => {setDirty(true); setKey(createRequestKey());};
    const available = [...new Map([...(left ? [left.candidate] : []), ...(right ? [right.candidate] : []), ...candidates.items].map(row => [row.id, row])).values()].filter(row => row.data.expression && ['numeric_series', 'boolean_series'].includes(row.data.outputType));
    const datasetOptions = [...new Map([...(dataset ? [dataset] : []), ...datasets.items].map(row => [row.id, row])).values()];
    const select = (id: string, setter: (value: SideDraft | null) => void) => {
        const candidate = available.find(row => row.id === id); change(); setter(candidate ? {candidate, draft: initialSeed(candidate)} : null);
    };
    let preparationError = '';
    try {
        if (name.trim().length > 200) throw new Error('对照名称最多 200 字符');
        if (left) buildSeed(left.candidate, left.draft, false);
        if (right) buildSeed(right.candidate, right.draft, false);
        if (left && right && left.candidate.id === right.candidate.id) throw new Error('请选择两个不同候选记录');
        if ([absolute, relative, warmup].some(value => !value.trim() || !Number.isFinite(Number(value)))) throw new Error('请填写有效容差与预热行数');
        if ([Number(absolute), Number(relative)].some(value => value < 0 || value > .001)) throw new Error('绝对与相对容差范围为 0–0.001');
        if (!Number.isInteger(Number(warmup)) || Number(warmup) < 0 || Number(warmup) > 2000) throw new Error('预热需为 0–2000 的整数行');
        if (dataset && dataset.rowCount - Number(warmup) < 30) throw new Error('预热后至少需要 30 行行情，并且结论至少需要 30 行共同有效输出');
    } catch (cause) {preparationError = cause instanceof Error ? cause.message : '输入尚不完整';}
    const start = async () => {
        if (busy || !dataset || !left || !right || preparationError) return;
        setBusy(true); setError('');
        try {
            const side = (value: SideDraft) => {const {candidateId, bindings, parameters} = buildSeed(value.candidate, value.draft, false); return {candidateId, bindings, parameters};};
            const comparison = await quantApi.compareFactors(collection, {requestKey: key, name, datasetId: dataset.id, left: side(left), right: side(right), policy: {absoluteTolerance: Number(absolute), relativeTolerance: Number(relative), warmupBars: Number(warmup)}});
            setDirty(false); saved(comparison);
        } catch (cause) {setError(cause instanceof Error ? cause.message : '对照未提交成功，输入仍保留，可重试同一请求');}
        finally {setBusy(false);}
    };
    return <QuantModal title="固定样本输出对照" close={close} busy={busy} wide><fieldset disabled={busy} className="space-y-5">
        <p className="text-sm leading-7 text-slate-500">固定两个候选、各自输入与参数，对整份行情逐行比较受控表达式输出。计算预算 15 秒，超时保留证据不足记录；本次对照不证明原平台执行、其他参数或全局等价。</p>
        <QuantField label="对照名称" value={name} onChange={value => {change(); setName(value);}} required/>
        <div className="space-y-3"><QuantField label="查找候选" value={q} onChange={value => {setQuery(value); setOffset(0);}} placeholder="名称、来源或公式"/>
            {candidates.loading ? <p role="status" className="text-xs text-slate-500">正在加载候选…</p> : candidates.error ? <p role="alert" className="text-sm text-red-600">{candidates.error}<QuantButton onClick={candidates.reload}>重试</QuantButton></p> : <p className="text-xs leading-6 text-slate-500">当前匹配 {candidates.total} 条记录，每页最多 100 条，仅可选择受控表达式。跨页已选候选会保留。</p>}
            <div className="grid gap-4 sm:grid-cols-2">{[{label: '左侧候选', side: left, setter: setLeft}, {label: '右侧候选', side: right, setter: setRight}].map(({label, side, setter}) => <div key={label} className="space-y-2"><label className="text-sm font-semibold">{label}</label><Select menuPortal aria-label={label} value={side?.candidate.id || ''} onChange={id => select(id, setter)} options={[{value: '', label: '选择候选记录'}, ...available.map(row => ({value: row.id, label: `${row.curation.name} · ${row.entryTitle}`}))]}/></div>)}</div>
            {candidates.total > 100 && <div className="flex gap-2"><QuantButton disabled={!offset || candidates.loading} onClick={() => setOffset(value => Math.max(0, value - 100))}>上一页候选</QuantButton><QuantButton disabled={offset + 100 >= candidates.total || candidates.loading} onClick={() => setOffset(value => value + 100)}>下一页候选</QuantButton></div>}
        </div>
        <div className="space-y-2"><label className="text-sm font-semibold">固定行情快照</label>{datasets.loading ? <p role="status" className="text-xs text-slate-500">正在加载行情…</p> : datasets.error ? <p role="alert" className="text-sm text-red-600">{datasets.error}<QuantButton onClick={datasets.reload}>重试</QuantButton></p> : <Select menuPortal aria-label="对照行情快照" value={dataset?.id || ''} onChange={id => {change(); setSelectedDataset(datasetOptions.find(row => row.id === id) || null);}} options={[{value: '', label: '请选择已有行情'}, ...datasetOptions.map(row => ({value: row.id, label: `${row.name} · ${row.rowCount} 行`}))]}/>}
            {datasets.total > 20 && <div className="flex gap-2"><QuantButton disabled={!datasetOffset} onClick={() => {if (dataset) setSelectedDataset(dataset); setDatasetOffset(value => Math.max(0, value - 20));}}>上一页行情</QuantButton><QuantButton disabled={datasetOffset + 20 >= datasets.total} onClick={() => {if (dataset) setSelectedDataset(dataset); setDatasetOffset(value => value + 20);}}>下一页行情</QuantButton></div>}
            {dataset && <p className="break-words text-xs leading-6 text-slate-500">{dataset.symbol} · {dataset.timeframe} · {dataset.timezone} · {dataset.priceAdjustment || '复权未说明'}<br/>{dataset.start} 至 {dataset.end}，完整 {dataset.rowCount} 行；预热后不裁去缺失或差异行。</p>}
            {!datasets.loading && !datasets.error && !datasets.items.length && <p className="text-xs text-slate-500">请先到“实验行情”导入历史 CSV。</p>}
        </div>
        <div className="grid gap-4 sm:grid-cols-3"><QuantField label="绝对容差" value={absolute} onChange={value => {change(); setAbsolute(value);}}/><QuantField label="相对容差" value={relative} onChange={value => {change(); setRelative(value);}}/><QuantField label="预热行数" value={warmup} onChange={value => {change(); setWarmup(value);}}/></div>
        <div className="grid gap-5 xl:grid-cols-2">{left && <div><p className="mb-2 text-sm font-semibold">左侧实际输入</p><SeedEditor candidate={left.candidate} draft={left.draft} change={draft => {change(); setLeft({...left, draft});}}/></div>}{right && <div><p className="mb-2 text-sm font-semibold">右侧实际输入</p><SeedEditor candidate={right.candidate} draft={right.draft} change={draft => {change(); setRight({...right, draft});}}/></div>}</div>
        {(error || preparationError) && <p role="alert" className="text-sm text-red-600">{error || preparationError}</p>}
        {busy && <p role="status" className="text-sm leading-6 text-orange-700">正在本机核对固定样本，最多计算 15 秒；关闭或离开页面不代表取消服务端计算。</p>}
        <div className="flex justify-end gap-3"><QuantButton onClick={close} disabled={busy}>取消</QuantButton><QuantButton primary disabled={busy || !name.trim() || !left || !right || !dataset || !!preparationError || candidates.loading || datasets.loading} onClick={() => void start()}>{busy ? '正在核对…' : '保存并计算对照'}</QuantButton></div>
    </fieldset></QuantModal>;
}
