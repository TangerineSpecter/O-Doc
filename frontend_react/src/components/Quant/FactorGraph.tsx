import {factorName} from '../../utils/quantFactorName';
import {useEffect, useState} from 'react';
import {ArrowLeft, Network, RefreshCw} from 'lucide-react';
import {graphRelations, graphViews, type GraphView} from '../../utils/quantGraphView';
import {useQuantGraph} from '../../hooks/useQuantGraph';
import type {QuantGraphNode} from '../../types/api/quantGraph';
import {QuantButton, QuantEmpty, cardClass} from './ui';
import {FactorGraphCanvas} from './FactorGraphCanvas';
import {FactorVerification} from './verification/FactorVerification';
import {ResearchRelation} from './graph/ResearchRelation';
import {factorFamilies} from './factorPresentation';
import type {QuantFactorFamily} from '../../types/api/quant';

const axes: Record<string, string> = {mechanism: '计算机制', calculation: '计算结构', inputs: '数据输入', output: '输出类型与单位', parameters: '参数'};
export function FactorGraph({collection, initialFocus, close, openSource, openComparison, openExperiment, onFocusChange}: {collection: string; initialFocus: string; close: () => void; openSource: (node: QuantGraphNode) => void; openComparison?: (id: string) => void; openExperiment: (id: string) => void; onFocusChange?: (id: string) => void}) {
    const [focus, setFocus] = useState(initialFocus);
    const [view, setView] = useState<GraphView>('algorithms');
    const controller = useQuantGraph(collection, focus);
    const graph = controller.data;
    useEffect(() => {if (graph?.focusId) onFocusChange?.(graph.focusId);}, [graph?.focusId, onFocusChange]);
    const center = graph?.nodes.find(node => node.id === `factor:${graph.focusId}`);
    const profile = center?.algorithmProfile;
    const relations = graphRelations(graph, view);
    const counts = {algorithms: graphRelations(graph, 'algorithms').length, records: graphRelations(graph, 'records').length, all: graphRelations(graph, 'all').length};
    return <div className="min-h-0 flex-1 overflow-auto p-4 scrollbar-hide sm:p-6"><div className="mx-auto max-w-6xl space-y-5">
        <section className={cardClass}><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900"><Network size={20}/>因子算法图谱</h2><p className="mt-2 text-sm leading-7 text-slate-600">按计算机制、输入、计算结构、输出和参数关联算法，展示每条相似关系的计算依据。</p></div><div className="flex gap-2"><QuantButton onClick={close}><ArrowLeft size={14}/>返回因子库</QuantButton><QuantButton aria-label="刷新关系图谱" onClick={controller.reload} disabled={controller.loading}><RefreshCw size={15}/></QuantButton></div></div></section>
        {controller.loading ? <div role="status" className={`${cardClass} text-sm text-slate-500`}>正在整理算法属性…</div> : controller.error ? <div role="alert" className={`${cardClass} space-y-3 text-sm text-red-600`}><p>{controller.error}</p><QuantButton onClick={controller.reload}>重试</QuantButton></div> : graph && (!center ? <QuantEmpty title="还没有提取的算法" description="分析源码后，计算算法及其属性会出现在这里。"/> : <>
            <section className={cardClass}>
                <div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><h3 className="break-words text-lg font-semibold text-slate-900">{factorName(center.label, center.originalName).title}</h3>{factorName(center.label, center.originalName).identifier && <p className="break-all font-mono text-xs text-slate-500">{factorName(center.label, center.originalName).identifier}</p>}</div><QuantButton onClick={() => openSource(center)}>查看来源报告</QuantButton></div>
                {profile && <dl className="mt-5 grid gap-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
                    <div><dt className="mb-1 text-slate-500">计算机制</dt><dd className="font-medium text-slate-800">{factorFamilies[profile.family as QuantFactorFamily] || profile.family}</dd></div>
                    <div><dt className="mb-1 text-slate-500">数据输入</dt><dd className="break-words font-medium text-slate-800">{profile.inputs.join('、')}</dd></div>
                    <div><dt className="mb-1 text-slate-500">市场与周期</dt><dd className="leading-6 text-slate-700">{profile.marketScope}<br/>{profile.timeframe}</dd></div>
                    <div><dt className="mb-1 text-slate-500">定义完整度</dt><dd className="font-medium tabular-nums text-slate-800" title={profile.scoreMeaning}>{profile.definitionScore}/100</dd></div>
                </dl>}
                <div role="group" aria-label="关系分类" className="mt-5 flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">{(Object.keys(graphViews) as GraphView[]).map(kind => <button key={kind} type="button" aria-pressed={view === kind} onClick={() => setView(kind)} className={`rounded-lg px-3 py-2 text-xs font-medium transition focus-visible:outline-orange-500 ${view === kind ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>{graphViews[kind]} · {counts[kind]}</button>)}</div>
                {relations.some(edge => !['extracted_from', 'analyzed_from', 'origin_context'].includes(edge.kind)) ? <FactorGraphCanvas graph={{...graph, edges: relations}} focus={setFocus}/> : <p className="my-6 text-sm leading-7 text-slate-600">{view === 'algorithms' ? '本次范围内没有匹配的其他算法。继续入库后会按同一属性规则建立关联。' : '本分类没有额外的计算记录。'}</p>}
                <p className="text-xs leading-6 text-slate-500">属性相似度 = 机制30% + 计算结构25% + 输入20% + 输出15% + 参数10%。共用上游计算会提高属性相似度；连线不表示计算依赖、输出相关性或可互相替换。收益表现由实际评价记录提供。</p>
                {graph.limited && <p className="mt-2 text-xs leading-6 text-slate-500">本次展示有界范围内的关联算法；图形最多展示8个邻居，完整名称和依据见下方。</p>}
            </section>
            <section className={cardClass}><h3 className="mb-4 text-sm font-semibold">{graphViews[view]} · {relations.length}</h3><div className="divide-y divide-slate-100">{relations.map(edge => {
                const target = graph.nodes.find(node => node.id === (edge.from === center.id ? edge.to : edge.from));
                return target && <div key={edge.id} className="flex flex-wrap items-start gap-3 py-4"><div className="min-w-0 flex-1"><h4 className="break-words text-sm font-medium text-slate-900">{factorName(target.label, target.originalName).title}</h4>{factorName(target.label, target.originalName).identifier && <p className="mt-1 break-all font-mono text-xs text-slate-500">{factorName(target.label, target.originalName).identifier}</p>}<p className="mt-2 text-xs text-slate-600">{edge.label}{edge.similarity !== null ? ` · 相似度 ${(edge.similarity * 100).toFixed(1)}%` : ''}</p><p className="mt-2 text-xs leading-6 text-slate-500">{edge.detail}</p>
                    {edge.attributes && <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-600">{Object.entries(edge.attributes.axes).map(([key, value]) => <div key={key}><dt className="inline">{axes[key] || key} </dt><dd className="inline tabular-nums">{Math.round(value.similarity * 100)}% × {value.weight}%</dd></div>)}</dl>}
                    {edge.researchJson && <ResearchRelation json={edge.researchJson} current={graph.focusId} focus={setFocus} available={graph.nodes.filter(node => node.kind === 'factor').map(node => node.id.slice(7))}/>}
                </div><div className="flex flex-wrap gap-2">{target.kind === 'factor' && <QuantButton onClick={() => setFocus(target.id.slice(7))}>查看此算法</QuantButton>}{target.reportId && <QuantButton onClick={() => openSource(target)}>来源报告</QuantButton>}{edge.requestId && <QuantButton onClick={() => openExperiment(edge.requestId!)}>查看计算实验</QuantButton>}{edge.comparisonId && openComparison && <QuantButton onClick={() => openComparison(edge.comparisonId!)}>查看固定对照</QuantButton>}</div></div>;
            })}{!relations.length && <p className="text-sm text-slate-500">本分类暂无关联。</p>}</div></section>
            <section className={cardClass}><details><summary className="cursor-pointer text-sm font-semibold">当前算法的历史计算与参数记录</summary><div className="mt-4"><FactorVerification key={graph.focusId} collection={collection} candidate={graph.focusId} openExperiment={openExperiment} openComparison={openComparison}/></div></details></section>
        </>)}
    </div></div>;
}
