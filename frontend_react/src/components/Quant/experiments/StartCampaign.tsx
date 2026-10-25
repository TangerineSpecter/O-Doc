import {useState} from 'react';
import {quantApi} from '../../../api/quant';
import {useQuantDatasets} from '../../../hooks/useQuantDatasets';
import {useQuantDraftRegistration, type QuantRegisterDraft} from '../../../hooks/useQuantNavigation';
import type {QuantExperimentProposal} from '../../../types/api/quantExperiment';
import {createRequestKey} from '../../../utils/requestKey';
import {QuantButton, QuantField, QuantModal} from '../ui';
import {readProposal} from './proposal';
const fields = [['maxRounds', '最多轮数（1–5）'], ['maxAttempts', '候选总预算（1–160）'], ['computeSeconds', '计算总预算（1–300 秒）'], ['wallSeconds', '总耗时上限（30–1200 秒）']] as const;
export function StartCampaign({collection, proposal, close, saved, register}: {collection: string; proposal: QuantExperimentProposal; close: () => void; saved: () => void; register: QuantRegisterDraft}) {
    const [prepared] = useState(() => readProposal(proposal));
    const [name, setName] = useState(`连续研究 · ${prepared.name}`.slice(0, 200)), [offset, setOffset] = useState(0);
    const [datasets, setDatasets] = useState<{id: string; name: string}[]>([]);
    const source = useQuantDatasets(collection, offset, '');
    const [budget, setBudget] = useState({maxRounds: '3', maxAttempts: String(Math.min(160, prepared.config.maxCandidates * 3)), computeSeconds: String(Math.min(300, prepared.config.seconds * 3)), wallSeconds: '900'});
    const [busy, setBusy] = useState(false), [error, setError] = useState(''), [dirty, setDirty] = useState(false), [key, setKey] = useState(createRequestKey);
    const change = () => {setDirty(true); setKey(createRequestKey());};
    useQuantDraftRegistration('campaign-start', dirty, undefined, register);
    const start = async () => {
        if (busy) return;
        setBusy(true); setError('');
        try {
            if (Object.values(budget).some(value => !value.trim() || !Number.isInteger(Number(value)))) throw new Error('请填写整数预算');
            await quantApi.startCampaign(collection, {requestKey: key, name, proposalId: proposal.id, datasetIds: datasets.map(row => row.id), modelId: '',
                maxRounds: Number(budget.maxRounds), maxAttempts: Number(budget.maxAttempts), computeSeconds: Number(budget.computeSeconds), wallSeconds: Number(budget.wallSeconds)});
            setDirty(false); saved();
        } catch (cause) {setError(cause instanceof Error ? cause.message : '连续研究启动失败，设置仍保留');}
        finally {setBusy(false);}
    };
    return <QuantModal title="启动 AI 连续研究" close={close} busy={busy} wide><fieldset disabled={busy} className="space-y-5">
        <p className="text-sm leading-7 text-slate-600">从“{prepared.name}”开始，自动执行实验、调用默认模型解读，再采用它提出的下一方案。固定本次模型，每轮最多一次解读；不生成方案、执行失败、预算不足或行情用完都会停止。</p>
        <QuantField label="连续研究名称" value={name} onChange={value => {change(); setName(value);}} required/>
        <section className="space-y-3"><h3 className="text-sm font-semibold">按使用顺序选择历史行情</h3><p className="text-xs leading-6 text-slate-500">每条记录使用一次，最多 5 条。请按 AI 要求准备数据；系统不会自动证明它满足市场、周期或独立性要求。选定数据用完后停止，不自行循环旧行情。</p>
            {source.loading ? <p role="status">正在加载行情…</p> : source.error ? <p role="alert" className="text-sm text-red-600">{source.error}<QuantButton onClick={source.reload}>重试</QuantButton></p> : !source.items.length ? <p className="text-sm text-slate-500">暂无历史行情，请先导入 CSV。</p> : source.items.map(row => <label key={row.id} className="flex gap-3 rounded-xl border border-slate-200 p-3 text-sm"><input type="checkbox" className="accent-orange-500" checked={datasets.some(item => item.id === row.id)} disabled={row.rowCount < 60 || (!datasets.some(item => item.id === row.id) && datasets.length >= Math.min(5, Number(budget.maxRounds)))} onChange={event => {change(); setDatasets(items => event.target.checked ? [...items, {id: row.id, name: row.name}] : items.filter(item => item.id !== row.id));}}/><span>{row.name} · {row.rowCount} 根<span className="block text-xs text-slate-400">{row.symbol} · {row.timeframe}{row.rowCount < 60 && ' · 不足 60 根'}</span></span></label>)}
            {datasets.length > 0 && <p className="text-xs leading-6 text-orange-700">执行顺序：{datasets.map((row, index) => `${index + 1}. ${row.name}`).join(' → ')}；本次最多执行 {Math.min(datasets.length, Number(budget.maxRounds))} 轮。</p>}
            {source.total > 20 && <div className="flex gap-2"><QuantButton disabled={!offset} onClick={() => setOffset(value => Math.max(0, value - 20))}>上一页行情</QuantButton><QuantButton disabled={offset + 20 >= source.total} onClick={() => setOffset(value => value + 20)}>下一页行情</QuantButton></div>}
        </section>
        <div className="grid gap-4 sm:grid-cols-2">{fields.map(([key, label]) => <QuantField key={key} label={label} type="number" value={budget[key]} onChange={value => {change(); setBudget(current => ({...current, [key]: value}));}}/>)}</div>
        <p className="text-xs leading-6 text-slate-500">每轮按方案的尝试上限和计算秒数预留预算，即使提前完成也不返还。本轮起点预留 {prepared.config.maxCandidates} 次尝试、{prepared.config.seconds} 秒；总耗时包含排队、计算和解读。同步保留研究记录，但不恢复本机运行权限。</p>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-3"><QuantButton onClick={close}>取消</QuantButton><QuantButton primary disabled={busy || !datasets.length || datasets.length > Number(budget.maxRounds)} onClick={() => void start()}>{busy ? '正在启动…' : '按此预算启动连续研究'}</QuantButton></div>
    </fieldset></QuantModal>;
}
