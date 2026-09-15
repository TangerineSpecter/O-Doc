import {useId} from 'react';
import {Clock3, GitBranch, Grip, Minus, Plus, RotateCcw} from 'lucide-react';
import type {ReadingGraph} from '../../types/bookAnalysis';
import {useStoryCanvas} from '../../hooks/useStoryCanvas';
import {STORY_CARD_HEIGHT, STORY_CARD_WIDTH, storyCanvasLayout, storyCanvasLinks, storyLinkPath} from '../../utils/storyCanvas';

interface Props {graph: ReadingGraph; order: 'narrative' | 'time'; selectedId: string; onSelect: (id: string) => void}
export default function StoryFlowCanvas({graph, order, selectedId, onSelect}: Props) {
    const canvas = useStoryCanvas();
    const marker = useId().replace(/:/g, '');
    const columns = Math.max(1, Math.floor((canvas.width - 72 + 80) / (STORY_CARD_WIDTH + 80)));
    const layout = storyCanvasLayout(graph.nodes, order, columns);
    const points = Object.fromEntries(layout.map(item => [item.node.id, canvas.positions[item.node.id] || {x: item.x, y: item.y}]));
    const width = Math.max(canvas.width, ...Object.values(points).map(p => p.x + STORY_CARD_WIDTH + 36));
    const height = Math.max(560, ...Object.values(points).map(p => p.y + STORY_CARD_HEIGHT + 36));
    return <section aria-label="故事情节画布" className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3"><div><h2 className="text-sm font-semibold text-slate-800">情节流程 <span className="ml-2 text-[10px] font-normal text-slate-400">{graph.total} 个情节</span></h2><p className="mt-1 text-[10px] text-slate-400">按{order === 'time' ? '故事时间' : '叙述顺序'}排列 · 虚线表示顺序，橙线表示有证据的因果</p></div><div className="flex items-center gap-1 text-slate-500"><button aria-label="缩小情节画布" onClick={() => canvas.zoom(1 / 1.2)} className="rounded-md p-1.5 hover:bg-slate-50"><Minus className="h-3.5 w-3.5"/></button><span className="w-10 text-center font-mono text-[10px]">{Math.round(canvas.transform.scale * 100)}%</span><button aria-label="放大情节画布" onClick={() => canvas.zoom(1.2)} className="rounded-md p-1.5 hover:bg-slate-50"><Plus className="h-3.5 w-3.5"/></button><button onClick={canvas.reset} className="ml-1 inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[10px] hover:bg-slate-50"><RotateCcw className="h-3 w-3"/>重置画布</button></div></header>
        <div ref={canvas.root} className="relative h-[640px] w-full touch-none overflow-hidden bg-slate-50/50 bg-[radial-gradient(#dbe3ec_1px,transparent_1px)] [background-size:20px_20px]" onPointerDown={event => canvas.pointerDown(event, points)} onPointerMove={canvas.pointerMove} onPointerUp={canvas.pointerUp} onPointerCancel={canvas.pointerUp} onClickCapture={event => {if (canvas.suppressClick.current && event.detail > 0) {event.preventDefault(); event.stopPropagation();}}}>
            <div className="absolute left-0 top-0 origin-top-left" style={{width, height, transform: `translate(${canvas.transform.x}px, ${canvas.transform.y}px) scale(${canvas.transform.scale})`}}>
                <svg width={width} height={height} className="pointer-events-none absolute inset-0" aria-hidden="true"><defs><marker id={marker + '-next'} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8"/></marker><marker id={marker + '-cause'} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#f97316"/></marker></defs>{storyCanvasLinks(graph, layout.map(item => item.node.id)).map(edge => <g key={edge.id}><path d={storyLinkPath(points[edge.source], points[edge.target])} fill="none" stroke={edge.kind === 'causes' ? '#f97316' : '#94a3b8'} strokeWidth={edge.kind === 'causes' ? 2 : 1.5} strokeDasharray={edge.kind === 'next' ? '5 5' : undefined} markerEnd={`url(#${marker}-${edge.kind === 'causes' ? 'cause' : 'next'})`}/>{edge.kind === 'causes' && <text x={(points[edge.source].x + points[edge.target].x + STORY_CARD_WIDTH) / 2} y={(points[edge.source].y + points[edge.target].y + STORY_CARD_HEIGHT) / 2 - 8} textAnchor="middle" fill="#ea580c" fontSize="10">导致</text>}</g>)}</svg>
                {layout.map(({node}) => {
                    const evidence = node.facts.find(fact => fact.evidence)?.evidence;
                    return <div key={node.id} data-flow-node={node.id} className={`absolute overflow-hidden rounded-xl border bg-white shadow-sm ${selectedId === node.id ? 'border-orange-400 ring-2 ring-orange-100' : 'border-slate-200 hover:border-orange-300 hover:shadow-md'}`} style={{left: points[node.id].x, top: points[node.id].y, width: STORY_CARD_WIDTH, height: STORY_CARD_HEIGHT}}>
                        <div className="flex h-12 cursor-grab items-center gap-2 border-b border-slate-100 bg-orange-50/40 px-3 active:cursor-grabbing"><h3 title={node.name} className="min-w-0 flex-1 text-xs font-semibold leading-5 text-slate-800"><button onClick={() => onSelect(node.id)} className="line-clamp-2 w-full cursor-grab text-left focus-visible:outline-orange-300">{node.name}</button></h3><Grip className="h-3 w-3 shrink-0 text-orange-400"/></div>
                        <button aria-label={`查看情节：${node.name}`} onClick={() => onSelect(node.id)} className="block h-[136px] w-full px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-300"><p title={node.facts[0]?.description} className="line-clamp-2 text-[11px] leading-5 text-slate-500">{node.facts[0]?.description || '点击查看人物、线索与原文。'}</p><div className="mt-2 flex items-center gap-2 text-[9px] text-slate-400"><span className="min-w-0 flex-1 truncate">{evidence?.chapterTitle || '章节来源见详情'}</span>{node.thread && <span title={node.thread} className="flex max-w-20 items-center gap-1 truncate"><GitBranch className="h-2.5 w-2.5 shrink-0"/>{node.thread}</span>}</div><p title={node.timeLabel} className="mt-1 flex items-center gap-1 truncate text-[9px] text-slate-400"><Clock3 className="h-2.5 w-2.5 shrink-0"/>{node.timeLabel || '时间未明确'}</p></button>
                    </div>;
                })}
            </div>
            <p className="pointer-events-none absolute bottom-3 left-4 rounded bg-white/80 px-2 py-1 text-[10px] text-slate-400">拖动空白平移 · 拖动卡片调整位置 · 滚轮缩放 · 点击查看详情</p>
        </div>
    </section>;
}
