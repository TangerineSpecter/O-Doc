import type {QuantSourceEvidenceImpact, QuantSourceImpact, QuantSourceLineRange} from '../../../types/api/quantSourceImpact';
import {sourceImpactLabels, sourceQuoteLabels} from '../../../utils/quantSourceImpact';

const changes = {added: '新增', removed: '删除', changed: '原文变化', moved: '位置变化', identical: '原文相同'};
const lines = (range: QuantSourceLineRange | null) => range ? `${range.start_line}${range.end_line !== range.start_line ? `–${range.end_line}` : ''} 行` : '无对应范围';
const ranges = (value: QuantSourceLineRange[]) => value.map(lines).join('、') || '无定位';
const statusClass = (status: string) => status === 'direct' ? 'bg-orange-50 text-orange-800' : 'bg-slate-100 text-slate-600';

function EvidenceGroup({title, items, omitted, impact}: {title: string; items: QuantSourceEvidenceImpact[]; omitted: number; impact: QuantSourceImpact}) {
    return <details className="rounded-xl border border-slate-200 p-4" open={items.some(item => item.status === 'direct' || item.status === 'potential')}>
        <summary className="cursor-pointer text-sm font-semibold text-slate-800">{title} · {items.length + omitted} 项</summary>
        {!items.length && <p className="mt-3 text-xs leading-6 text-slate-500">基准报告未提供可核对的结构化条目。历史解释报告可能只有正文。</p>}
        <div className="mt-3 divide-y divide-slate-100">{items.map(item => <details key={item.index} className="py-3">
            <summary className="cursor-pointer text-sm leading-7"><span className="mr-2 break-words font-medium text-slate-800">{item.name || `条目 ${item.index + 1}`}</span><span className={`inline-block rounded-full px-2 py-0.5 text-xs ${statusClass(item.status)}`}>{sourceImpactLabels[item.status]}</span></summary>
            <div className="mt-3 space-y-3 text-xs leading-6 text-slate-600">
                {!item.quotes.length && <p>旧报告没有可逐字定位的引文，影响仍待完整分析确认。</p>}
                {item.quotes.map((quote, index) => <div key={index} className="space-y-2 rounded-lg bg-slate-50 p-3">
                    <p className="break-words font-medium">{quote.field} · {sourceQuoteLabels[quote.status]}{quote.truncated ? ' · 定位展示受限' : ''}</p>
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono scrollbar-hide">{quote.quote || '（空引文）'}</pre>
                    <p>基准：{quote.old_occurrences} 处 · {ranges(quote.old_lines)}<br/>目标：{quote.new_occurrences} 处 · {ranges(quote.new_lines)}</p>
                </div>)}
                {item.node_ids.length > 0 && <div><p className="font-medium">关联的语法节点</p>{item.node_ids.map(id => {
                    const node = impact.structure.nodes.find(row => row.id === id);
                    return <p key={id} className="break-words">{node ? `${node.name} · ${sourceImpactLabels[node.impact]} · 基准 ${lines(node.old_range)} → 目标 ${lines(node.new_range)}` : `${id} · 本次未展开节点明细`}</p>;
                })}</div>}
                {item.limitations.map((text, index) => <p key={index}>{text}</p>)}
            </div>
        </details>)}</div>
        {omitted > 0 && <p className="mt-3 text-xs text-orange-700">还有 {omitted} 项未展开，不代表这些条目没有变化。</p>}
    </details>;
}

export function SourceImpactDependencies({impact}: {impact: QuantSourceImpact}) {
    const structure = impact.structure;
    return <div className="space-y-4">
        <details className="rounded-xl border border-slate-200 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-slate-800">潜在结构依赖 · {structure.total_nodes} 个语法节点</summary>
            <p className="mt-3 text-xs leading-6 text-slate-500">仅检查语法中的候选读取与调用关系，尚未证明运行时依赖。原文相同、位置变化或未观测到线索，都不表示可安全复用。</p>
            <p className="mt-2 break-words text-xs leading-6 text-slate-500">基准解析：{structure.old_parser} / {structure.old_status}；目标解析：{structure.new_parser} / {structure.new_status}<br/>直接变化 {structure.counts.direct} · 潜在影响 {structure.counts.potential} · 影响未知 {structure.counts.unknown} · 新增 {structure.counts.added} · 删除 {structure.counts.removed} · 原文变化 {structure.counts.changed} · 位置变化 {structure.counts.moved} · 原文相同 {structure.counts.identical}</p>
            {!structure.nodes.length && <p className="mt-3 text-xs leading-6 text-slate-500">本次没有可展示的结构节点；请结合解析状态和受限原因判断覆盖范围。</p>}
            <div className="mt-3 divide-y divide-slate-100">{structure.nodes.map(node => <details key={node.id} className="py-3">
                <summary className="cursor-pointer text-sm leading-7"><span className="mr-2 break-words font-medium">{node.name}</span><span className="mr-2 text-xs text-slate-500">{node.kind} · {changes[node.change]}</span><span className={`inline-block rounded-full px-2 py-0.5 text-xs ${statusClass(node.impact)}`}>{sourceImpactLabels[node.impact]}</span></summary>
                <div className="mt-2 space-y-1 text-xs leading-6 text-slate-600"><p>基准 {lines(node.old_range)} → 目标 {lines(node.new_range)}</p>{node.reasons.map((text, index) => <p key={index}>{text}</p>)}<p className="break-all text-slate-400">节点：{node.id}</p></div>
            </details>)}</div>
            {structure.omitted_nodes > 0 && <p className="mt-3 text-xs text-orange-700">另有 {structure.omitted_nodes} 个节点未展开。</p>}
            {structure.limitations.map((text, index) => <p key={index} className="mt-2 text-xs leading-6 text-slate-500">{text}</p>)}
        </details>
        <EvidenceGroup title="旧报告参数的引文与依赖" items={impact.parameters} omitted={impact.omitted.parameters} impact={impact}/>
        <EvidenceGroup title="旧报告候选的引文与依赖" items={impact.factors} omitted={impact.omitted.factors} impact={impact}/>
    </div>;
}
