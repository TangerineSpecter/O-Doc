import {useEffect, useState} from 'react';
import {quantApi} from '../../../api/quant';
import type {QuantAIRun} from '../../../types/api/quant';
import type {QuantStageEvidence, ResearchStage, ResearchStageState} from '../../../types/api/quantWorkflow';
import {Select} from '../../common/Select';
import {SourceStructure} from './SourceStructure';
import {LocalReading} from './LocalReading';
import {QuantButton, cardClass} from '../ui';

const labels: Record<ResearchStageState['status'], string> = {waiting: '待开始', running: '进行中', completed: '已完成', reused: '沿用已完成结果', failed: '失败', interrupted: '已中断'};

function Evidence({collection, entryId, runId, stage}: {collection: string; entryId: string; runId: string; stage: ResearchStageState}) {
    const [data, setData] = useState<QuantStageEvidence | null>(null);
    const [error, setError] = useState('');
    const [retry, setRetry] = useState(0);
    useEffect(() => {
        const abort = new AbortController();
        void quantApi.workflowEvidence(collection, entryId, runId, stage.stage, abort.signal).then(value => {
            if (!abort.signal.aborted) setData(value);
        }).catch(cause => {if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : '阶段记录读取失败');});
        return () => abort.abort();
    }, [collection, entryId, runId, stage.stage, stage.outcomeId, retry]);
    if (error) return <div role="alert" className="mt-4 text-sm text-red-700">{error}<QuantButton onClick={() => {setData(null); setError(''); setRetry(value => value + 1);}}>重新读取</QuantButton></div>;
    if (!data) return <p role="status" className="mt-4 text-sm text-slate-500">正在读取阶段记录…</p>;
    return <div className="mt-4 space-y-3 rounded-xl bg-slate-50 p-4 text-sm">
        <h4 className="font-semibold">{data.name} · 阶段依据</h4>
        <p className="text-slate-600">{stage.modelName || '本机规则'} · {stage.elapsedMs === null ? '耗时未记录' : `${(stage.elapsedMs / 1000).toFixed(1)} 秒`} · {stage.usage?.totalTokens == null ? 'Token 用量未知' : `${stage.usage.totalTokens.toLocaleString()} tokens`}</p>
        {stage.reusedFrom && <p className="text-slate-600">本阶段沿用此前成功结果，没有再次调用模型。</p>}
        {data.structure && <SourceStructure value={data.structure} code={data.sourceCode || ''}/>}
        {data.localReadingJson && <LocalReading json={data.localReadingJson}/>}
        <details><summary className="cursor-pointer">输入来源与依赖</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs leading-6 scrollbar-hide">{data.inputJson}</pre></details>
        <details open={!data.structure && !data.localReadingJson}><summary className="cursor-pointer">阶段输出与记录</summary><pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all text-xs leading-6 scrollbar-hide">{data.outcomeJson || '步骤已开始，但没有保存完整结果。继续研究时会重新执行此步骤。'}</pre></details>
    </div>;
}

export function ResearchWorkflow({run, collection, busy, resume}: {run: QuantAIRun; collection: string; busy: boolean; resume: (stage?: ResearchStage) => void}) {
    const [selected, setSelected] = useState('');
    const [restart, setRestart] = useState<ResearchStage | ''>('');
    const workflow = run.workflow;
    if (!workflow) return null;
    const finished = workflow.stages.filter(row => ['completed', 'reused'].includes(row.status)).length;
    const canResume = ['failed', 'cancelled', 'interrupted'].includes(run.status);
    const canRestart = canResume || run.status === 'completed';
    const stage = workflow.stages.find(row => row.stage === selected && row.stepId);
    return <section className={cardClass} aria-label="研究分析进度">
        <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">研究进度 · {finished} / {workflow.stages.length}</h3>
            {canResume && <QuantButton primary disabled={busy} onClick={() => resume()}>从未完成阶段继续</QuantButton>}</div>
        <p className="mt-2 text-sm leading-6 text-slate-500">每次最多 {workflow.maxModelCalls} 次模型调用，执行最长 {workflow.maxSeconds / 60} 分钟。成功阶段保留；继续时核对来源、模型和依赖后复用。</p>
        {workflow.version >= 12 && <p className="mt-2 text-xs leading-6 text-slate-500">检索比对会冻结相关的历史实验、固定验证与使用反馈，AI 在评价和规划中说明采用、放弃或继续核查的理由。历史观察用于新假设，不提高当前源码的静态证据等级。</p>}
        {[8, 9, 10, 11, 12, 13].includes(workflow.version) && <p className="mt-2 text-xs leading-6 text-slate-500">发现受控定义或默认配置缺项时，AI 最多修订4个候选，另存有原文依据的独立版本；无法补齐则保留原因。没有修订目标时跳过额外模型调用。结构检查不代表原平台依赖已修复或实证通过。</p>}
        {workflow.restartStage && <p className="mt-2 text-sm text-slate-600">本次从“{workflow.stages.find(row => row.stage === workflow.restartStage)?.name}”重新执行，原报告和修订仍保留。</p>}
        {workflow.vocabularyReference && <p className="mt-2 text-sm leading-6 text-slate-500">本次 AI 分类使用已冻结的{workflow.vocabularyReference.revisionId ? '自定义词表版本' : '内置词表 v1'}。同源续跑沿用该词表；从“整理来源”重跑可读取当前词表，原报告仍保留。</p>}
        {[3, 5, 7, 9, 11, 13, 15, 17, 18, 20, 22, 24, 26, 27].includes(workflow.version) && <p className="mt-2 text-sm leading-6 text-slate-600">{workflow.localReading ? `${workflow.version===27?'组件依赖':'局部解读'}计划：${workflow.localReading.selected} 个${workflow.version===27?'组件':'不同片段'}，${workflow.localReading.reused} 个符合沿用条件，${workflow.localReading.omitted} 个超出片段预算。` : '片段解读计划将在来源整理完成后生成。'} {workflow.version===27?'依赖或未知范围改变时重新分析对应组件；':''}参数、全局结论、评分与实验设计仍重新核对。点击“片段静态解读”查看新源码行号和原解读出处。</p>}
        <ol className="mt-4 grid gap-x-5 gap-y-2 lg:grid-cols-2 2xl:grid-cols-3">{workflow.stages.map(row => <li key={row.stage}>
            <button disabled={!row.stepId} aria-expanded={selected === row.stage} onClick={() => setSelected(selected === row.stage ? '' : row.stage)}
                className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm disabled:cursor-default ${selected === row.stage ? 'bg-orange-50' : 'hover:bg-slate-50'} ${row.status === 'failed' ? 'text-red-700' : row.status === 'running' ? 'text-orange-700' : 'text-slate-700'}`}>
                <span>{row.name}</span><span className="shrink-0 text-xs">{labels[row.status]}</span>
            </button>{row.error && <p className="px-3 pb-2 text-xs leading-5 text-red-700">{row.error}</p>}
        </li>)}</ol>
        {canRestart && workflow.stages.some(row => row.stepId) && <details className="mt-4 border-t border-slate-100 pt-4">
            <summary className="cursor-pointer text-sm text-slate-600">指定阶段重新执行</summary>
            <p className="my-3 text-sm leading-6 text-slate-500">针对最近一次资料研究，所选阶段及后续步骤会重新执行，前序结果核对后复用。沿用原任务的模型与要求；模型配置变化会重算受影响步骤。从评价或实验设计开始时沿用原比对快照，要更新库比对请从“检索比对”开始。</p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <label className="min-w-0 flex-1 space-y-2 text-sm text-slate-600"><span className="block">重新执行的起点</span>
                    <Select<ResearchStage | ''> value={restart} onChange={setRestart} disabled={busy} placeholder="选择已开始的阶段"
                        options={workflow.stages.filter(row => row.stepId).map(row => ({value: row.stage, label: row.name}))}/></label>
                <QuantButton disabled={busy || !restart} onClick={() => {if (restart) resume(restart);}}>从此阶段重新执行</QuantButton>
            </div>
        </details>}
        {stage && <Evidence key={`${run.id}-${stage.stage}-${stage.outcomeId}`} collection={collection} entryId={run.entryId} runId={run.id} stage={stage}/>}
    </section>;
}
