import type {GraphView, ReadingGraph} from '../../types/bookAnalysis';
import {nodeColors} from '../../utils/readingGraph';
import {orderedEvents} from '../../utils/readingChartOptions';

interface Props {graph: ReadingGraph; view: GraphView; order: 'narrative' | 'time'; selectedId: string; page: number; onPage: (page: number) => void; onSelect: (id: string) => void}
export default function ReadingResults({graph, view, order, selectedId, page, onPage, onSelect}: Props) {
    if (view === 'flow' && graph.nodes.length && graph.total <= graph.limit) return null;
    return <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between text-[11px] text-slate-400"><span>{view === 'timeline' ? '故事事件记录' : '本视图内容'} · {graph.total} 项</span><span>第 {graph.page} 页 · 按需展示</span></div>
        {!graph.nodes.length && <p className="py-8 text-center text-xs text-slate-400">当前范围没有匹配内容。</p>}
        {view !== 'flow' && <div className={`grid max-h-[440px] gap-2 overflow-y-auto overscroll-contain ${view === 'timeline' ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>{orderedEvents(graph.nodes, order).map(node => <button key={node.id} onClick={() => onSelect(node.id)} className={`flex items-start gap-2 rounded-lg border p-3 text-left transition ${selectedId === node.id ? 'border-orange-300 bg-orange-50/60' : 'border-slate-100 hover:border-orange-200'}`}><i className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{background: nodeColors[node.kind]}}/><span className="min-w-0"><span className="block text-xs font-semibold text-slate-700">{node.name}</span>{view === 'timeline' && <span className="mt-1 block text-[10px] text-slate-400">{node.timeLabel || '时间未明确（按叙述顺序）'}</span>}<span className="mt-1 line-clamp-2 block text-[11px] leading-5 text-slate-400">{node.facts[0]?.description}</span></span></button>)}</div>}
        {graph.total > graph.limit && <div className="mt-3 flex items-center justify-between text-xs text-slate-400"><button disabled={page === 1} onClick={() => onPage(page - 1)} className="disabled:opacity-30">上一页</button><span>{page} / {Math.ceil(graph.total / graph.limit)}</span><button disabled={page * graph.limit >= graph.total} onClick={() => onPage(page + 1)} className="disabled:opacity-30">下一页</button></div>}
    </div>;
}
