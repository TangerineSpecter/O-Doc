import {useState} from 'react';
import {ArrowLeft, Network, RefreshCw} from 'lucide-react';
import {useQuantGraph} from '../../hooks/useQuantGraph';
import type {QuantGraphNode} from '../../types/api/quantGraph';
import {QuantButton, QuantEmpty, cardClass} from './ui';
import {FactorGraphCanvas} from './FactorGraphCanvas';
const jobLabels = {pending: '排队中', running: '建立索引中', completed: '已完成', cancelled: '已停止', failed: '失败', interrupted: '已中断'};

export function FactorGraph({collection, initialFocus, close, openSource, openComparison}: {collection: string; initialFocus: string; close: () => void; openSource: (node: QuantGraphNode) => void; openComparison?: (id: string) => void}) {
    const [focus, setFocus] = useState(initialFocus);
    const controller = useQuantGraph(collection, focus);
    const graph = controller.data;
    const center = graph?.nodes.find(node => node.id === `factor:${graph.focusId}`);
    const derived = graph?.edges.some(edge => edge.kind === 'origin_context' && edge.to === center?.id);
    const relations = graph?.edges.filter(edge => edge.from === center?.id || (['derived_from', 'sample_equivalent', 'merged_group'].includes(edge.kind) && edge.to === center?.id)) || [];
    return <div className="min-h-0 flex-1 overflow-auto p-4 scrollbar-hide sm:p-6"><div className="mx-auto max-w-6xl space-y-5">
        <section className={cardClass}><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900"><Network size={20} />因子关系图谱</h2><p className="mt-2 text-sm leading-7 text-slate-500">从一个候选出发，查看父代谱系、共同来源、相同公式与值得继续研究的语义联系。</p></div><div className="flex gap-2"><QuantButton onClick={close}><ArrowLeft size={14} />返回因子库</QuantButton><QuantButton aria-label="刷新关系图谱" onClick={controller.reload} disabled={controller.loading}><RefreshCw size={15} /></QuantButton></div></div></section>
        {controller.loading ? <div role="status" className={`${cardClass} text-sm text-slate-500`}>正在整理关系图谱…</div> : controller.error ? <div role="alert" className={`${cardClass} space-y-3 text-sm text-red-600`}><p>{controller.error}</p><QuantButton onClick={controller.reload}>重试</QuantButton></div> : graph && <>
            <section className={cardClass}><div className="flex flex-wrap items-center justify-between gap-4"><div><h3 className="text-sm font-semibold">语义索引 · {graph.index.ready} / {graph.index.total}</h3><p className="mt-2 text-xs leading-6 text-slate-500">{graph.index.configured ? `当前模型：${graph.index.modelName}。新报告会自动建立本机索引；更换设备后可在这里重建。` : '尚未配置默认向量模型。来源与公式关系仍可查看；配置后可建立语义索引。'}</p></div><QuantButton disabled={controller.busy || !graph.index.configured || !graph.index.missing} onClick={() => void controller.act()}>建立剩余索引（{graph.index.missing}）</QuantButton></div>
                {graph.index.missing > graph.index.batchLimit && <p className="mt-3 text-xs text-slate-500">每次最多处理 {graph.index.batchLimit} 项，完成后可继续剩余候选。</p>}
                {graph.index.oversized > 0 && <p className="mt-3 text-xs text-amber-700">{graph.index.oversized} 项描述超出索引长度上限，暂未建立语义索引。</p>}
                {controller.actionError && <p role="alert" className="mt-3 text-sm text-red-600">{controller.actionError}</p>}
                {graph.index.jobs.slice(0, 3).map(job => <div key={job.id} className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3 text-xs text-slate-500"><span>{jobLabels[job.status]} · {job.processed}/{job.total}</span>{job.error && <span className="min-w-0 flex-1 break-words">{job.error}</span>}{['pending', 'running'].includes(job.status) && <QuantButton disabled={controller.busy} onClick={() => void controller.act(job.id)}>停止索引</QuantButton>}</div>)}
            </section>
            {!center ? <QuantEmpty title="还没有可关联的因子" description="收集代码并生成 AI 研究报告后，提取的候选和来源会出现在这里。" /> : <>
                <section className={cardClass}><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs text-slate-400">当前研究中心</p><h3 className="mt-2 text-lg font-semibold">{center.label}</h3></div><QuantButton onClick={() => openSource(center)}>{derived ? '查看祖先来源报告' : '打开来源报告'}</QuantButton></div>
                    {derived ? <p className="mt-4 text-xs leading-6 text-slate-500">当前公式由实验衍生；祖先报告保留原始研究上下文，直接父代见下方谱系。</p> : <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500"><span className="rounded-lg bg-slate-50 px-3 py-2">来源材料</span><span className="py-2">→</span><span className="rounded-lg bg-slate-50 px-3 py-2">AI 研究报告</span><span className="py-2">→</span><span className="rounded-lg bg-orange-50 px-3 py-2 text-orange-700">{center.label}</span></div>}
                    {relations.length ? <FactorGraphCanvas graph={graph} focus={setFocus} /> : <p className="my-8 text-center text-sm text-slate-500">尚未发现与其他候选的关系。后续收集更多材料后继续积累。</p>}
                    <p className="text-xs leading-6 text-slate-500">实线：来源、相同契约、实验衍生或直接样本证据，具体含义逐条列于下方。主动逻辑合并可撤销，样本对照事实继续保留。虚线是模型语义相近，不触发合并，也不代表收益或统计相关。</p>
                    {(relations.length > 8 || graph.limited) && <p className="mt-2 text-xs leading-6 text-amber-700">图形仅展示前 8 个邻居；下方列出本次查询关系。关系较多时只展示部分，可切换研究中心继续查看。</p>}
                </section>
                <section className={cardClass}><h3 className="mb-4 text-sm font-semibold">关联依据 · {relations.length}</h3><div className="divide-y divide-slate-100">{relations.map(edge => {
                    const target = graph.nodes.find(node => node.id === (edge.from === center?.id ? edge.to : edge.from));
                    return target && <div key={edge.id} className="flex flex-wrap items-start gap-3 py-4"><div className="min-w-0 flex-1"><h4 className="break-words text-sm font-medium">{target.label}</h4><p className="mt-2 text-xs text-slate-500">{edge.label}{edge.similarity !== null ? ` · 余弦相似度 ${edge.similarity.toFixed(3)}` : ''}</p><p className="mt-2 text-xs leading-6 text-slate-500">{edge.detail}</p>{edge.historical && <p className="mt-1 text-xs leading-6 text-amber-700">模型或候选描述已有变化，这条关系保留的是历史分析依据。</p>}</div><div className="flex flex-wrap gap-2">{target.kind === 'factor' && <QuantButton onClick={() => setFocus(target.id.slice(7))}>以此为中心</QuantButton>}<QuantButton onClick={() => openSource(target)}>{target.kind === 'strategy' ? '归档研究与代码' : '来源报告'}</QuantButton>{edge.comparisonId && openComparison && <QuantButton onClick={() => openComparison(edge.comparisonId!)}>固定样本证据与撤销</QuantButton>}</div></div>;
                })}{!relations.length && <p className="text-sm text-slate-500">暂无关联记录。</p>}</div></section>
            </>}
        </>}
    </div></div>;
}
