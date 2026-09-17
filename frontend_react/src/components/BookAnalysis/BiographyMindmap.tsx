import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Maximize2, Minus, Plus} from 'lucide-react';
import type {BiographyMap} from '../../types/bookAnalysis';
import {connector, layoutThemes, mapWidth, rootX} from '../../utils/biographyMindmapLayout';
import BiographyMindmapFocus from './BiographyMindmapFocus';

interface Props {subjectName: string; mindmap?: BiographyMap; covered: number; total: number; scopeLimited?: boolean}
type Selection = {title: string; summary: string; chapters?: number[]};

export default function BiographyMindmap({subjectName, mindmap, covered, total, scopeLimited}: Props) {
    const themes = useMemo(() => mindmap?.themes || [], [mindmap?.themes]);
    const map = useMemo(() => layoutThemes(themes), [themes]);
    const viewport = useRef<HTMLDivElement>(null);
    const initialized = useRef(false);
    const [zoom, setZoom] = useState(1);
    const [selected, setSelected] = useState<Selection | null>(null);
    const closeSelection = useCallback(() => setSelected(null), []);
    const fit = () => Math.min(1, Math.max(.65, ((viewport.current?.clientWidth || mapWidth) - 24) / mapWidth));
    useEffect(() => {
        if (!viewport.current || !themes.length) return;
        const observer = new ResizeObserver(() => {
            if (!initialized.current) {
                const scale = fit();
                setZoom(scale);
                initialized.current = true;
                requestAnimationFrame(() => {
                    if (viewport.current) viewport.current.scrollLeft = (mapWidth * scale - viewport.current.clientWidth) / 2;
                });
            }
        });
        observer.observe(viewport.current);
        return () => observer.disconnect();
    }, [themes.length]);
    const changeZoom = (next: number) => setZoom(Math.min(1.6, Math.max(.65, Math.round(next * 10) / 10)));

    return <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
        <p className="text-[10px] font-semibold tracking-[.18em] text-orange-600">BIOGRAPHY MAP</p>
        <h2 className="mt-1 font-serif text-xl font-semibold text-slate-800">人生与思想导图</h2>
        <p className="mt-2 text-xs leading-5 text-slate-500">这是当前版本已分析章节的总览，不按左侧选中章节筛选；点击左侧章节将进入该章的人生轨迹。内容为 AI 解读，连线只表示主题归属，不代表因果。</p>
        {scopeLimited ? <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-5 py-6 text-sm text-amber-800">此导图根据当前版本全部已分析章节生成。请选择“全部已分析内容”查看，避免提前显示范围外内容。</div> : !themes.length ? <div className="mt-5 rounded-xl border border-dashed border-slate-200 px-5 py-8 text-center text-sm text-slate-500">当前分析版本尚无总结性导图。重新分析后生成；已有章节内容仍可在其他页面阅读。</div> : <>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3"><p className="text-xs text-slate-500">{themes.length} 条主题脉络 · 已分析 {covered} / {total || covered} 章 <span className="ml-2 text-slate-400">点击节点查看归纳；可横向滚动查看画布</span></p><div className="flex items-center gap-1"><button type="button" aria-label="缩小导图" onClick={() => changeZoom(zoom - .2)} className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-orange-50"><Minus className="h-4 w-4"/></button><span className="min-w-12 text-center text-xs text-slate-500">{Math.round(zoom * 100)}%</span><button type="button" aria-label="放大导图" onClick={() => changeZoom(zoom + .2)} className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-orange-50"><Plus className="h-4 w-4"/></button><button type="button" aria-label="适应画布宽度" onClick={() => {const next = fit(); changeZoom(next); requestAnimationFrame(() => {if (viewport.current) viewport.current.scrollLeft = (mapWidth * next - viewport.current.clientWidth) / 2;});}} className="ml-1 rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-orange-50"><Maximize2 className="h-4 w-4"/></button></div></div>
            <div className="relative mt-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-50/60">
                <div ref={viewport} className="max-h-[720px] overflow-auto touch-pan-x bg-[radial-gradient(#dbe4ee_1px,transparent_1px)] [background-size:22px_22px]" aria-label="人生与思想思维导图画布">
                    <div style={{width: mapWidth * zoom, height: map.height * zoom, position: 'relative'}}>
                        <div style={{width: mapWidth, height: map.height, transform: `scale(${zoom})`, transformOrigin: 'top left', position: 'relative'}}>
                            <svg width={mapWidth} height={map.height} className="absolute inset-0" aria-hidden="true">
                                {map.items.map(item => <g key={item.index}>
                                    <path d={connector(rootX + (item.side === 'left' ? -94 : 94), map.rootY, item.x + (item.side === 'left' ? 110 : -110), item.y)} fill="none" stroke="#fdba74" strokeWidth="2"/>
                                    {item.leaves.map((leaf, index) => <path key={index} d={connector(item.x + (item.side === 'left' ? -110 : 110), item.y, leaf.x + (item.side === 'left' ? 125 : -125), leaf.y)} fill="none" stroke="#cbd5e1" strokeWidth="1.7"/>)}
                                </g>)}
                            </svg>
                            <button type="button" onClick={closeSelection} style={{left: rootX - 94, top: map.rootY - 49, width: 188, height: 98}} className="absolute flex flex-col items-center justify-center rounded-[28px] border-2 border-orange-400 bg-orange-50 px-3 text-center shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"><span className="font-serif text-xl font-semibold text-slate-800">{subjectName || '传主'}</span><span className="mt-1 text-[11px] text-orange-800">人生 · 思想</span></button>
                            {map.items.map(item => <div key={item.index}>
                                <button type="button" onClick={() => setSelected({title: item.theme.title, summary: item.theme.summary})} style={{left: item.x - 110, top: item.y - 38, width: 220, height: 76}} className={`absolute flex items-center justify-center rounded-2xl border-2 bg-white px-3 text-center font-serif text-base font-semibold leading-6 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${selected?.title === item.theme.title ? 'border-orange-500 text-orange-800' : 'border-orange-200 text-slate-800 hover:border-orange-400'}`}>{item.theme.title}</button>
                                {item.leaves.map((leaf, index) => <button key={index} type="button" onClick={() => setSelected(leaf)} style={{left: leaf.x - 125, top: leaf.y - 29, width: 250, height: 58}} className={`absolute flex items-center justify-center rounded-xl border bg-white px-3 text-center text-sm font-medium leading-5 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${selected?.title === leaf.title ? 'border-orange-400 bg-orange-50 text-orange-800' : 'border-slate-200 text-slate-700 hover:border-orange-300'}`}>{leaf.title}</button>)}
                            </div>)}
                        </div>
                    </div>
                </div>
            </div>
        </>}
        {selected && <BiographyMindmapFocus selection={selected} onClose={closeSelection}/>}
    </section>;
}
