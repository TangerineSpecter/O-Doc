import {ResearchRelation} from './graph/ResearchRelation';
import {useEffect, useState} from 'react';
import {ArrowLeft, Network, RefreshCw} from 'lucide-react';
import {useQuantGraph} from '../../hooks/useQuantGraph';
import type {QuantGraphNode} from '../../types/api/quantGraph';
import {QuantButton, QuantEmpty, cardClass} from './ui';
import {FactorGraphCanvas} from './FactorGraphCanvas';
import {FactorVerification} from './verification/FactorVerification';
const jobLabels = {pending: '排队中', running: '建立索引中', completed: '已完成', cancelled: '已停止', failed: '失败', interrupted: '已中断'};

export function FactorGraph({collection, initialFocus, close, openSource, openComparison, openExperiment, onFocusChange}: {collection: string; initialFocus: string; close: () => void; openSource: (node: QuantGraphNode) => void; openComparison?: (id: string) => void; openExperiment: (id: string) => void; onFocusChange?: (id: string) => void}) {
    const [focus, setFocus] = useState(initialFocus);
    const controller = useQuantGraph(collection, focus);
    const graph = controller.data;
    useEffect(() => {
        if (graph?.focusId) onFocusChange?.(graph.focusId);
    }, [graph?.focusId, onFocusChange]);
    const center = graph?.nodes.find(node => node.id === `factor:${graph.focusId}`);
    const derived = graph?.edges.some(edge => edge.kind === 'origin_context' && edge.to === center?.id);
    const relations = graph?.edges.filter(edge => edge.from === center?.id || (['derived_from', 'sample_equivalent', 'merged_group', 'reported_support', 'reported_counterexample'].includes(edge.kind) && edge.to === center?.id)) || [];
    return <div className="min-h-0 flex-1 overflow-auto p-4 scrollbar-hide sm:p-6"><div className="mx-auto max-w-6xl space-y-5">
        <section className={cardClass}><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900"><Network size={20} />因子关系图谱</h2><p className="mt-2 text-sm leading-7 text-slate-500">从一个候选出发，查看父代谱系、组合假设、增量对照、反馈正反主张和用途条件；每条保留原报告与实际参数。</p></div><div className="flex gap-2"><QuantButton onClick={close}><ArrowLeft size={14} />返回因子库</QuantButton><QuantButton aria-label="刷新关系图谱" onClick={controller.reload} disabled={controller.loading}><RefreshCw size={15} /></QuantButton></div></div></section>
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
                    {relations.length ? <FactorGraphCanvas graph={graph} focus={setFocus} /> : <p className="my-8 text-center text-sm text-slate-500">尚无邻居或直接证据记录。后续研究会继续积累。</p>}
                    <p className="text-xs leading-6 text-slate-500">实线：来源、谱系、样本统计或直接观察，普通观察连线不代表支持或通过。组合支持/反例仅针对下方固定描述规则。主动逻辑合并可撤销，样本事实保留。橙色虚线是语义相近，紫色虚线是未验证假设，点线是未核实反馈主张；它们不触发合并，也不代表收益或独立验证。</p>
                    {(relations.length > 8 || graph.limited) && <p className="mt-2 text-xs leading-6 text-amber-700">图形仅展示前 8 个邻居；下方列出本次查询关系。关系较多时只展示部分，可切换研究中心继续查看。</p>}
                </section>
                <section className={cardClass}><h3 className="mb-4 text-sm font-semibold">关联依据 · {relations.length}</h3><div className="divide-y divide-slate-100">{relations.map(edge => {
                    const target = graph.nodes.find(node => node.id === (edge.from === center?.id ? edge.to : edge.from));
                    return target && <div key={edge.id} className="flex flex-wrap items-start gap-3 py-4"><div className="min-w-0 flex-1"><h4 className="break-words text-sm font-medium">{target.label}</h4><p className="mt-2 text-xs text-slate-500">{edge.label}{edge.similarity !== null ? ` · 余弦相似度 ${edge.similarity.toFixed(3)}` : ''}</p><p className="mt-2 text-xs leading-6 text-slate-500">{edge.detail}</p>{target.evidence&&<details className="mt-2 text-xs leading-6 text-slate-500"><summary className="cursor-pointer">观察对象与版本指纹</summary><p className="mt-2 break-all">目标：{target.evidence.targetId}<br/>目标指纹：{target.evidence.targetHash}<br/>公式指纹：{target.evidence.candidateHash}<br/>记录时间：{target.evidence.createdAt}</p></details>}{edge.researchJson && <ResearchRelation json={edge.researchJson} current={graph.focusId} focus={setFocus} available={graph.nodes.filter(node => node.kind === 'factor').map(node => node.id.slice(7))}/>} {edge.historical && <p className="mt-1 text-xs leading-6 text-amber-700">模型或候选描述已有变化，这条关系保留的是历史分析依据。</p>}</div><div className="flex flex-wrap gap-2">{target.kind === 'factor' && <QuantButton onClick={() => setFocus(target.id.slice(7))}>以此为中心</QuantButton>}{(target.reportId||target.kind==='strategy')&&<QuantButton onClick={() => openSource(target)}>{target.kind === 'strategy' ? '归档研究与代码' : target.kind==='feedback'?'反馈解读报告':target.kind==='hypothesis'?'AI方案原稿':target.kind==='scenario'?'用途条件原稿':target.kind==='assessment'?'关联解读报告':'来源报告'}</QuantButton>}{edge.requestId && <QuantButton onClick={() => openExperiment(edge.requestId!)}>查看完整实验</QuantButton>}{edge.comparisonId && openComparison && <QuantButton onClick={() => openComparison(edge.comparisonId!)}>{edge.kind==='statistical_correlation'?'统计范围与固定对照':'固定样本证据与撤销'}</QuantButton>}</div></div>;
                })}{!relations.length && <p className="text-sm text-slate-500">暂无关联记录。</p>}</div></section>
                <section className={cardClass}><details><summary className="cursor-pointer text-sm font-semibold">查看当前公式的完整直接证据与参数</summary><div className="mt-4"><FactorVerification key={graph.focusId} collection={collection} candidate={graph.focusId} openExperiment={openExperiment} openComparison={openComparison}/></div></details></section>
            </>}
        </>}
    </div></div>;
}
