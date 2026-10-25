import type {QuantLibraryRetrieval} from '../../../types/api/quantLibraryResearch';
import {QuantButton} from '../ui';

export function LibraryResearchContext({value, openFactor}: {value?: QuantLibraryRetrieval | null; openFactor: (id: string, name: string) => void}) {
    if (!value) return null;
    return <details className="rounded-xl border border-slate-200 bg-white p-4" aria-label="跨来源研究依据">
        <summary className="cursor-pointer text-sm font-semibold text-slate-700">本次解读参考了 {value.candidates.length} 个跨来源候选</summary>
        <p className="mt-3 text-xs leading-6 text-slate-500">从最近最多 {value.scanLimit} 条其他来源候选中扫描 {value.scanned} 条，找到 {value.eligible} 条可计算、可组合且去重后的候选；{value.omittedForSize ? `${value.omittedForSize} 条因上下文大小未提供给 AI。` : ''}下列是当时固定的检索结果，AI 是否采用以方案为准。</p>
        <p className="mt-2 text-xs leading-6 text-slate-500">标签、机制类别和语义相似只用于寻找研究线索，未证明收益、相关性或组合有效性。新增候选基线使用来源声明默认值。</p>
        {!value.candidates.length && <p className="mt-3 text-sm text-slate-600">本次没有可提供的跨来源候选，继续基于原始父代与衍生结果分析。</p>}
        <div className="mt-3 space-y-3">{value.candidates.map(row => <div key={row.candidateId} className="border-t border-slate-100 pt-3">
            <h5 className="text-sm font-semibold">{row.name}</h5><p className="mt-1 text-xs leading-6 text-slate-500">来源：{row.entryTitle}</p>
            <p className="text-xs leading-6 text-slate-600">{row.selection === 'diversity' ? '不同机制探索' : '相关候选'} · {row.reason.sameFamily ? '相同机制类别；' : ''}{row.reason.sharedTags.length ? `共享标签：${row.reason.sharedTags.join('、')}；` : ''}{row.reason.semantic ? `语义相似度 ${(row.reason.semantic.similarity * 100).toFixed(1)}%；` : ''}输入与类型满足当前组合规则。</p>
            <QuantButton onClick={() => openFactor(row.candidateId, row.name)}>查看候选及出处</QuantButton>
        </div>)}</div>
    </details>;
}
