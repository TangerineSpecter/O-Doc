import type {FactorClassification} from '../../../types/api/quantVocabulary';
import {classificationBasis, vocabularyDimensions} from './presentation';

export function Classification({value}: {value?: FactorClassification}) {
    if (!value) return <p className="text-xs text-slate-500">分类尚未加载，可刷新候选查看。</p>;
    return <div className="space-y-3 rounded-xl border border-slate-200 p-4">
        <div><h4 className="text-sm font-semibold">统一分类</h4><p className="mt-1 text-xs leading-6 text-slate-500">按标签、定义字段与来源声明整理；分类仍需结合材料判断，实验与验证记录另行积累。</p></div>
        {Object.entries(vocabularyDimensions).filter(([dimension]) => dimension !== 'evidence').map(([dimension, label]) => {
            const terms = value.terms.filter(term => term.dimension === dimension);
            return terms.length > 0 && <div key={dimension} className="flex flex-wrap items-start gap-2 text-xs leading-6"><span className="w-20 shrink-0 text-slate-400">{label}</span>{terms.map(term => <span key={term.id} title={term.definition} className="rounded-md bg-slate-50 px-2 text-slate-700">{term.label}{!term.active && '（已停用）'}</span>)}</div>;
        })}
        {value.unresolved.length > 0 && <details className="text-xs leading-6 text-slate-600"><summary className="cursor-pointer">{value.unresolved.filter(row => row.status === 'ambiguous').length > 0 ? '有分类歧义 · ' : ''}{value.unresolved.length} 个词待整理</summary><ul className="mt-2 space-y-2">{value.unresolved.map((row, index) => <li key={index} className="break-words">{row.raw} · {row.status === 'ambiguous' ? `存在歧义：${row.codes.map(code => value.terms.find(term => term.id === code)?.label || code).join(' / ')}` : row.status === 'protected' ? '标签不能改变证据状态' : '未映射，保留原词'}<span className="text-slate-400"> · {classificationBasis[row.basis] || row.basis}</span></li>)}</ul></details>}
        <details className="text-xs leading-6 text-slate-500"><summary className="cursor-pointer">原词、匹配依据与词表版本</summary><p className="mt-2">原始标签：{value.originalTags.join(' / ') || '未声明'}</p>{value.terms.filter(term => term.dimension !== 'evidence').map(term => <p key={term.id}>{term.label} ← {term.basis.map(row => `${classificationBasis[row.kind] || row.kind}：${row.raw}`).join('；')}</p>)}<p>验证证据集中在上方展示；词表中的记录来源标记仅描述提取、修订或实验衍生方式。</p><p className="mt-2 break-all">词表：{value.reference.revisionId || '内置 v1'}<br/>快照：{value.reference.contentHash}</p></details>
    </div>;
}
