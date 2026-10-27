import type {StudyGeneration as Generation, ValidStudyCandidate} from '../../../types/api/quantStudy';
import {hasStudyDefinition, readStudyGeneration} from '../../../utils/quantStudy';
import {QuantButton} from '../ui';

const operations: Record<string, string> = {mutation: '变异', combination: '组合', crossover: '交叉', parameter_variant: '参数变体', simplification: '简化'};

export function StudyGeneration({generation, openFactor, connect}: {
    generation: Generation; openFactor: (id: string) => void; connect: (row: ValidStudyCandidate) => void;
}) {
    let data;
    try { data = readStudyGeneration(generation); }
    catch (cause) {
        return <div className="space-y-2"><p role="alert" className="text-sm text-red-600">{cause instanceof Error ? cause.message : '代次记录无法读取'}</p>
            <details className="text-xs text-slate-500"><summary>查看原稿</summary><pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-all scrollbar-hide">{generation.dataJson}</pre></details></div>;
    }
    return <section className="space-y-4" aria-label={`第${generation.number}代研究结果`}><h3 className="text-base font-semibold">第 {generation.number} 代</h3><p className="whitespace-pre-wrap text-sm leading-7 text-slate-600">{data.result?.summary || data.error}</p>
        {data.result?.candidates.map(row => {
            const valid = hasStudyDefinition(row);
            return <article key={row.index} className="space-y-3 rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h4 className="break-words font-semibold">{valid ? row.definition.name : `未通过校验的候选 ${row.index + 1}`}</h4><p className="mt-2 text-xs text-slate-500">{operations[row.operation] || row.operation} · {row.selected ? '已保留并回库' : '未保留'} · 实证未评估</p></div><strong className="text-orange-700">{row.total_score ?? '—'}<span className="ml-1 text-xs font-normal text-slate-500">/100 研究分</span></strong></div>
                {valid ? <><p className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-600">{row.definition.summary}</p><p className="break-words rounded-lg bg-slate-50 p-3 font-mono text-xs leading-6">{row.definition.formula}</p></> :
                    <details className="text-xs text-slate-600"><summary className="cursor-pointer">查看未通过校验的原始定义</summary><pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-slate-50 p-3 scrollbar-hide">{JSON.stringify(row.definition ?? null, null, 2)}</pre></details>}
                <p className="whitespace-pre-wrap text-sm leading-7 text-slate-600">{row.rationale}</p>{row.validation_error && <p className="text-xs leading-6 text-orange-700">{row.validation_error}</p>}
                <details><summary className="cursor-pointer text-xs text-orange-700">参数、评分依据与父代</summary><div className="mt-3 space-y-3 text-xs leading-6 text-slate-600">{valid && row.definition.parameters.map((p, i) => <p key={i} className="break-words"><strong>{p.name}={p.default_value || '未知'}</strong> · {p.meaning}<br/>影响：{p.effect}<br/>约束：{p.constraints}<br/>候选建议：{p.suggestion}</p>)}{row.scores.map(score => <p key={score.dimension}><strong>{score.dimension} {score.score ?? '未知'}/5</strong><br/>{score.reason}<br/>依据：{score.evidence}</p>)}<p className="break-all">父代：{row.parents.join('、')}</p><p>风险：{row.risks.join('；')}</p>{valid && <p>{row.definition.limitations}</p>}</div></details>
                <div className="flex flex-wrap gap-2">{row.candidate_id && <QuantButton onClick={() => openFactor(row.candidate_id!)}>查看候选谱系</QuantButton>}{valid && !row.validation_error && <QuantButton onClick={() => connect(row)}>可选：发送到回测连接器</QuantButton>}</div>
            </article>;
        })}
        <details className="text-xs text-slate-500"><summary className="cursor-pointer">冻结输入与 AI 原稿</summary><pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-slate-50 p-3 scrollbar-hide">{JSON.stringify(data, null, 2)}</pre></details>
    </section>;
}
