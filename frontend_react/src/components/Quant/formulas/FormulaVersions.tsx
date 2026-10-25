import {useCallback, useState} from 'react';
import type {QuantFactorCandidate} from '../../../types/api/quant';
import type {QuantFormulaHistory} from '../../../types/api/quantFormulaVersion';
import {useQuantFormulaVersions} from '../../../hooks/useQuantFormulaVersions';
import {useQuantDraftRegistration, type QuantRegisterDraft} from '../../../hooks/useQuantNavigation';
import {quantDate} from '../../../utils/quant';
import {QuantButton, QuantField, QuantModal} from '../ui';

function DefinitionEditor({data, busy, save, register}: {data: QuantFormulaHistory; busy: boolean;
    save: (json: string, reason: string) => Promise<boolean>; register: QuantRegisterDraft}) {
    const [json, setJson] = useState(data.definitionJson), [reason, setReason] = useState('');
    const submit = useCallback(() => save(json, reason), [json, reason, save]);
    const reset = useCallback(() => {setJson(data.definitionJson); setReason('');}, [data.definitionJson]);
    useQuantDraftRegistration('factor-formula-definition', json !== data.definitionJson || !!reason, submit, register, reset);
    return <div className="space-y-4 border-t border-slate-200 pt-4">
        <details><summary className="cursor-pointer text-sm font-semibold text-slate-700">修订这份定义并创建新版本</summary>
            <p className="my-3 text-xs leading-6 text-slate-500">保留人工修订入口。编辑声明式表达式、输入、参数和限制；这里保存的是你定义的研究产物，不能填入原文引证或把改动说成实测最优。参数名和表达式名须相互对应。保存后可从因子库进行本机实验与候选指标导出。</p>
            <label className="block text-sm text-slate-600">完整公式定义 JSON<textarea aria-label="完整公式定义 JSON" rows={18} value={json} onChange={event => setJson(event.target.value)} className="mt-2 w-full resize-none rounded-xl border border-slate-200 p-3 font-mono text-xs leading-6 outline-none focus:border-orange-400 scrollbar-hide"/></label>
            <div className="mt-3"><QuantField label="修订理由" value={reason} onChange={setReason} multiline rows={3}/></div>
            <div className="mt-3 flex justify-end"><QuantButton primary disabled={busy || json === data.definitionJson || !reason.trim()} onClick={() => void submit()}>保存为独立公式版本</QuantButton></div>
        </details>
    </div>;
}

export function FormulaVersions({collection, candidate, register, request, close, saved}: {collection: string; candidate: QuantFactorCandidate;
    register: QuantRegisterDraft; request: (action: () => void) => void; close: () => void; saved: (candidate: QuantFactorCandidate) => void}) {
    const [selectedId, setSelectedId] = useState(candidate.id), [offset, setOffset] = useState(0);
    const [selectionReason, setSelectionReason] = useState(''), [comparison, setComparison] = useState<QuantFormulaHistory>();
    const state = useQuantFormulaVersions(collection, selectedId, offset);
    const data = state.data;
    const {save: saveDefinition} = state;
    const save = useCallback(async (json: string, reason: string) => {
        const result = await saveDefinition(json, reason);
        if (result) {saved(result); return true;}
        return false;
    }, [saveDefinition, saved]);
    return <QuantModal title="公式版本与当前研究版" close={close} busy={state.busy} wide>
        <p className="text-sm leading-7 text-slate-500">AI 定义修订、实验生成的变体与人工修订分别留存。当前研究版只是工作选择，原始报告、参数实测值和研究评分仍绑定各自对象；旧结论不会随版本切换转移。</p>
        {state.error && <div role="alert" className="space-y-2 text-sm text-red-700"><p>{state.error}</p><QuantButton onClick={() => request(state.reload)}>重新读取</QuantButton></div>}
        {state.loading ? <p role="status" className="text-sm text-slate-500">正在读取版本、父代和选择记录…</p> : data && <>
            <div className="rounded-xl bg-slate-50 p-4 text-sm leading-7 text-slate-600"><p>当前研究版：<strong className="font-medium text-slate-900">{data.currentName}</strong></p><p className="text-xs">正在查看：{data.candidateName} · 共 {data.versionsTotal} 个版本</p><details className="mt-2 text-xs text-slate-500"><summary className="cursor-pointer">谱系与版本身份</summary><p className="mt-2 break-all leading-6">稳定根：{data.rootCandidateId}<br/>当前候选：{data.currentCandidateId}<br/>查看候选：{data.candidateId}</p></details></div>
            <div className="space-y-3">{data.versions.map(row => <div key={row.candidateId} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3"><h4 className="text-sm font-semibold">{row.name}{row.candidateId === data.currentCandidateId ? ' · 当前研究版' : ''}</h4><span className="text-xs text-slate-500">{row.origin === 'ai_repair' ? 'AI 定义修订' : row.origin === 'authored' ? '人工修订' : row.origin === 'experiment' ? '实验生成' : '来源提取'} · {quantDate(row.createdAt)}</span></div>
                <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap break-words text-xs leading-6 text-slate-600 scrollbar-hide">{row.formula}</pre><p className="mt-2 text-xs leading-6 text-slate-500">{row.reason}</p>
                <div className="mt-3 flex flex-wrap gap-2"><QuantButton disabled={state.busy} onClick={() => void state.inspect(row.candidateId).then(value => {if (value) saved(value);})}>查看此版本</QuantButton><QuantButton disabled={state.busy || row.candidateId === selectedId} onClick={() => request(() => {setComparison(data); setSelectedId(row.candidateId);})}>对照并以此版本编辑</QuantButton><QuantButton disabled={state.busy || row.candidateId === data.currentCandidateId || !selectionReason.trim()} onClick={() => void state.select(row.candidateId, selectionReason)}>设为当前研究版</QuantButton></div>
                <details className="mt-2 text-xs text-slate-500"><summary>父代与版本指纹</summary><p className="mt-2 break-all leading-6">候选：{row.candidateId}<br/>父代：{row.parentCandidateIds.join('、') || '谱系起点'}<br/>内容：{row.candidateHash}<br/>表达式：{row.expressionHash || '原平台片段'}</p></details>
            </div>)}</div>
            {!data.versions.length && <p className="text-sm text-slate-500">这一页没有版本。</p>}
            {Math.max(data.versionsTotal, data.selectionsTotal) > 20 && <div className="flex justify-end gap-3"><QuantButton disabled={!offset || state.busy} onClick={() => request(() => setOffset(value => Math.max(0, value - 20)))}>上一页</QuantButton><QuantButton disabled={offset + 20 >= Math.max(data.versionsTotal, data.selectionsTotal) || state.busy} onClick={() => request(() => setOffset(value => value + 20))}>下一页</QuantButton></div>}
            <QuantField label="当前研究版的选择理由" value={selectionReason} onChange={setSelectionReason} placeholder="用于什么研究；原始实证等级保持不变" multiline rows={2}/>
            {comparison && comparison.candidateId !== data.candidateId && <details className="rounded-xl bg-slate-50 p-4"><summary className="cursor-pointer text-sm font-medium">两份完整定义对照</summary><div className="mt-3 grid gap-4 lg:grid-cols-2">{[comparison, data].map(value => <div key={value.candidateId}><p className="mb-2 break-all text-xs text-slate-500">{value.candidateId}</p><pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs leading-6 scrollbar-hide">{value.definitionJson}</pre></div>)}</div></details>}
            <DefinitionEditor key={`${data.candidateId}-${offset}`} data={data} busy={state.busy} save={save} register={register}/>
            <details className="text-xs text-slate-500"><summary>当前研究版选择历史（{data.selectionsTotal}）</summary><div className="mt-3 space-y-3">{data.selections.map(row => <p key={row.id} className="break-all leading-6">{quantDate(row.createdAt)} · {row.candidateId}<br/>{row.reason}</p>)}</div></details>
        </>}
    </QuantModal>;
}
