import {useMemo} from 'react';
import {useQuantVerification} from '../../../hooks/useQuantVerification';
import {readQualification, readVerification, reuseLabels, verificationLevelLabels} from '../../../utils/quantVerification';
import type {PortableQualification} from '../../../types/api/quantVerification';
import {QuantButton} from '../ui';
import {VerificationEvidence} from './VerificationEvidence';

function Qualification({value}: {value: PortableQualification}) {
    return <div className="space-y-3 text-xs leading-6 text-slate-600">
        <ul className="space-y-2">{value.checks.map(row => <li key={row.code} className={row.status === 'passed' ? '' : 'text-orange-700'}>{row.status === 'passed' ? '通过' : row.status === 'missing' ? '缺失' : '阻断'} · {row.message}</li>)}</ul>
        <p>输入可得时点、缺失规则和单位仍按定义声明保留；量纲含义、实际数据可得性及跨平台语义需另行核对。</p>
        <p>声明默认配置：{{declared_defaults_valid: '符合已识别的声明约束', needs_values: '缺少值，运行时需明确提供', invalid_declared_defaults: '不满足已识别约束，需要修订'}[value.configuration.status]}{value.configuration.missing.length > 0 && `（${value.configuration.missing.join('、')}）`}。</p>
        {value.inputs_requiring_mapping.length > 0 && <p>需明确数据映射：{value.inputs_requiring_mapping.join('、')}。不会自动用收盘价替代这些输入。</p>}
        <details><summary className="cursor-pointer">声明依赖、数据时点与表达式结构</summary><div className="mt-3 space-y-3">
            {value.inputs.map(row => <p key={row.name}><strong className="font-mono font-medium">{row.name}</strong> · {row.used ? '表达式已引用' : '本表达式未引用'}<br/>可得时点声明：{row.availability}<br/>缺失处理声明：{row.missing_policy}</p>)}
            <p>原平台或资料中的外部依赖：{value.external_dependencies.map(row => row.name).join('；') || '未列出'}。这些文字声明仍待核实；结构检查不加载外部库或验证其语义。</p>
            <ol className="max-h-60 space-y-1 overflow-auto rounded-lg bg-slate-50 p-3 font-mono scrollbar-hide">{value.nodes.map(node => <li key={node.id}>{node.id} · {node.op}{node.name ? `(${node.name})` : ''} → {node.kind}{node.dependencies.length ? ` ← ${node.dependencies.join(', ')}` : ''}</li>)}</ol>
        </div></details>
    </div>;
}
export function FactorVerification({collection, candidate, openExperiment, openComparison, openVersions}: {collection: string; candidate: string; openExperiment: (id: string) => void; openComparison?: (id: string) => void; openVersions?: () => void}) {
    const state = useQuantVerification(collection, candidate);
    const decoded = useMemo(() => {
        const value = state.data;
        try {return value ? {qualification: value.qualificationJson ? readQualification(value.qualificationJson) : null,
            items: value.items.map(row => ({...row, parsed: readVerification(row.dataJson)})), error: ''} : null;}
        catch (error) {return {qualification: null, items: [], error: error instanceof Error ? error.message : '验证记录格式不完整'};}
    }, [state.data]);
    const value = state.data;
    const qualification = decoded?.qualification;
    const content = value && decoded && <>
                <p className="text-sm font-medium text-slate-800">{reuseLabels[value.reuseStatus]}</p>
                {!!value.aiRevisions?.length && <div className="space-y-2 rounded-lg bg-orange-50 p-3 text-xs leading-6 text-slate-600"><p>AI 已为此原始候选生成独立修订，原版继续保留。</p>{value.aiRevisions.map(row => <p key={row.candidateId}>{row.name} · {row.summary}</p>)}{openVersions && <QuantButton onClick={openVersions}>查看 AI 修订与原版</QuantButton>}</div>}
                {value.aiRevision && <div className="space-y-2 rounded-lg bg-orange-50 p-3 text-xs leading-6 text-slate-600"><p>{value.aiRevision.summary}</p><p>变更字段：{value.aiRevision.changedFields.join('、')}。结构通过不证明平台等价或盈利。</p>{value.aiRevision.remainingUnknowns.map((text, i) => <p key={i}>仍待核对：{text}</p>)}{value.aiRevision.evidence.map((row, i) => <blockquote key={i} className="whitespace-pre-wrap break-words border-l-2 border-orange-200 pl-3">{row.quote}</blockquote>)}</div>}
                {qualification ? <Qualification value={qualification}/> : <p className="text-xs leading-6 text-slate-500">旧记录尚未归集此项结构检查，可用下方按钮补齐；不会启动模型或行情计算。</p>}
                <div className="flex flex-wrap gap-2">{value.levels.map(level => <span key={level} className="rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-600">{verificationLevelLabels[level] || '其他证据记录'}</span>)}</div>
                <p className="text-xs leading-6 text-slate-500">原平台等价性尚未验证，经济有效性仍需按具体实验判断。留出观察的既往使用情况未核实，模拟/实盘用户报告单独标注。</p>
                {value.items.length ? <div className="space-y-3">{decoded.items.map(row => <VerificationEvidence key={row.id} value={row.parsed} createdAt={row.createdAt} openExperiment={openExperiment} openComparison={openComparison}/>)}</div> : <p className="text-xs text-slate-500">暂无已归集的直接验证记录；已有历史实验、对照或反馈可继续归集。</p>}
                {value.total > 20 && <div className="flex items-center justify-end gap-2 text-xs text-slate-400"><span>{state.offset + 1}–{state.offset + value.items.length} / {value.total}</span><QuantButton disabled={state.offset === 0} onClick={() => state.setOffset(Math.max(0, state.offset - 20))}>上一页</QuantButton><QuantButton disabled={state.offset + value.items.length >= value.total} onClick={() => state.setOffset(state.offset + 20)}>下一页</QuantButton></div>}
            </>;
    return <div className="space-y-4 rounded-xl border border-slate-200 p-4" aria-label="结构检查与验证证据">
        <div><h4 className="text-sm font-semibold">结构检查与验证证据</h4><p className="mt-1 text-xs leading-6 text-slate-500">新候选自动检查，实验、对照和明确关联的反馈自动积累。记录只属于当前公式版本与当时配置，保留失败和反例。</p></div>
        {state.loading ? <p role="status" className="text-xs text-slate-500">正在读取结构检查与验证依据…</p> : state.error || decoded?.error ? <div role="alert" className="space-y-2 text-xs text-red-600"><p>{state.error || decoded?.error}</p><QuantButton onClick={state.reload}>重试</QuantButton></div> : content}
        <div className="flex flex-wrap items-center gap-2"><QuantButton disabled={state.indexing.busy} onClick={() => void state.index()}>归集已有证据与结构检查</QuantButton>{state.indexing.busy && <QuantButton onClick={state.stop}>停止归集</QuantButton>}<span role="status" className="text-xs leading-6 text-slate-500">{state.indexing.progress}</span></div>
        {state.indexing.error && <p role="alert" className="text-xs text-red-600">{state.indexing.error}</p>}
    </div>;
}
