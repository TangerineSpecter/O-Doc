import {useEffect, useRef, useState} from 'react';
import * as echarts from 'echarts';
import type {NovelController} from '../../hooks/useNovel';
import {Evidence} from './Evidence';
import {describeNovelState} from '../../utils/novelState';
import type {Change, Memory} from '../../types/api/novel';
import {novelApi} from '../../api/novel';
import {Select} from '../common/Select';
import {Field, labels, options} from './ui';
import {nodeColors} from '../../utils/readingGraph';

const colors: Record<string, string> = {person: nodeColors.person, event: nodeColors.event, place: nodeColors.place, organization: nodeColors.concept, item: nodeColors.clue, clue: nodeColors.clue};
export function StoryMap({c, timeline = false}: {c: NovelController; timeline?: boolean}) {
    const n = c.novel!, root = useRef<HTMLDivElement>(null);
    const [through, setThrough] = useState('plan'), [kind, setKind] = useState('all'), [query, setQuery] = useState('');
    const [memory, setMemory] = useState<Memory>(n.memory), [focus, setFocus] = useState('');
    const [order, setOrder] = useState('narrative');
    const [evidence, setEvidence] = useState<Change | null>(null);
    useEffect(() => {let active = true; if (through === 'plan') setMemory(n.memory); else void novelApi.memory(n.id, Number(through)).then(m => {if (active) setMemory(m);}).catch(() => {});return () => {active = false;};}, [through, n.id, n.memory]);
    useEffect(() => {
        if (!root.current || timeline) return;
        const chart = echarts.init(root.current);
        const visible = n.entities.filter(e => !e.hidden && (through === 'plan' || memory.visibleEntityIds.includes(e.id)) && (kind === 'all' || e.kind === kind) && (!query || [e.name, ...e.aliases].some(v => v.includes(query))));
        const nodes: {id: string; name: string; category: number; symbolSize: number; itemStyle: {color: string}; description?: string}[] = visible.map(e => ({id: e.id, name: e.name, category: 0, symbolSize: e.importance === 'protagonist' ? 35 : e.importance === 'core' ? 28 : 18, itemStyle: {color: colors[e.kind]}, description: e.biography}));
        const ids = new Set(nodes.map(e => e.id));
        const links: {source: string; target: string; value: string; evidence?: string; fact?: Change}[] = memory.relations.filter(r => ids.has(r.entityId || '') && ids.has(r.targetId || '')).map(r => ({source: r.entityId!, target: r.targetId!, value: r.description, evidence: `${r.chapterTitle || ''}：${r.quote}`, fact: r}));
        if (through === 'plan') {
            for (const r of n.relations) if (ids.has(r.sourceId) && ids.has(r.targetId)) links.push({source: r.sourceId, target: r.targetId, value: r.description + (r.secret ? '（作者秘密）' : '')});
            for (const t of n.threads.filter(t => (kind === 'all' || kind === 'clue') && (!query || t.title.includes(query)))) {nodes.push({id: t.id, name: t.title, category: 0, symbolSize: 18, itemStyle: {color: colors.clue}, description: t.description});for (const eid of t.entityIds) if (ids.has(eid)) links.push({source: eid, target: t.id, value: '关联线索'});}
            for (const o of n.outlines.filter(o => (kind === 'all' || kind === 'event') && (!query || o.title.includes(query)))) {nodes.push({id: o.id, name: o.title, category: 0, symbolSize: 22, itemStyle: {color: colors.event}, description: o.content});for (const eid of o.entityIds) if (ids.has(eid)) links.push({source: eid, target: o.id, value: '规划出场'});}
        }
        chart.setOption({animationDuration: 300, tooltip: {trigger: 'item', renderMode: 'richText', formatter: (p: {data: {name?: string; value?: string; evidence?: string}}) => p.data.evidence || p.data.value || p.data.name || ''}, series: [{type: 'graph', layout: 'force', roam: true, draggable: true, data: nodes, links, edgeSymbol: ['none', 'arrow'], edgeSymbolSize: 7, label: {show: true, position: 'bottom', color: '#64748b', fontSize: 12}, lineStyle: {color: '#d4dde7', curveness: .1}, emphasis: {focus: 'adjacency'}, force: {repulsion: 300, edgeLength: [65, 130], gravity: .06}}]});
        chart.on('click', p => {const data = p.data as {id?: string; fact?: Change} | undefined;if (data?.fact) setEvidence(data.fact);else setFocus(data?.id || '');});
        const observer = new ResizeObserver(() => chart.resize());observer.observe(root.current);
        return () => {observer.disconnect();chart.dispose();};
    }, [n.entities, n.threads, n.outlines, n.relations, memory, query, kind, through, timeline]);
    const entity = n.entities.find(e => e.id === focus);
    const events = order === 'story' ? [...memory.timeline].sort((a, b) => (a.timeOrder ?? Number.MAX_SAFE_INTEGER) - (b.timeOrder ?? Number.MAX_SAFE_INTEGER)) : memory.timeline;
    return <div className="flex h-full min-h-0 flex-col p-5"><div className="flex shrink-0 flex-wrap items-end gap-3"><div className="min-w-48"><p className="mb-2 text-xs text-slate-500">{timeline ? '故事时间线' : '关系图谱'}</p><Select value={through} options={[{value: 'plan', label: '全书规划与已发生事实'}, ...n.chapters.map(ch => ({value: String(ch.position), label: `截至 ${ch.title}`}))]} onChange={setThrough}/></div><Select value={kind} options={[{value: 'all', label: '全部类型'}, ...options(['person', 'event', 'place', 'organization', 'item', 'clue'])]} onChange={setKind}/>{timeline && <Select value={order} options={[{value: 'narrative', label: '叙述顺序'}, {value: 'story', label: '故事时间（未知单列）'}]} onChange={setOrder}/>}<Field label="搜索名称 / 别名" value={query} onChange={setQuery}/></div>{timeline ? <div className="mt-5 min-h-0 flex-1 space-y-4 overflow-auto scrollbar-hide">{events.filter(t => !query || t.description.includes(query) || t.quote.includes(query)).map((t, i) => <article className="rounded-2xl border border-slate-200 bg-white p-5" key={i}><p className="text-xs text-orange-600">{t.chapterTitle} · {t.storyTime || '故事时间未知'} · {t.sceneMode === 'flashback' ? '回忆 · ' : t.sceneMode === 'flashforward' ? '前瞻 · ' : ''}{labels[t.kind]}</p><p className="mt-2 text-sm text-slate-700">{t.description}</p><q className="mt-2 block text-xs leading-6 text-slate-400">{t.quote}</q><p className="mt-2 text-[11px] text-slate-400"><button className="text-orange-600" onClick={() => setEvidence(t)}>查看原文证据</button></p></article>)}{memory.timeline.length === 0 && <p className="p-10 text-center text-sm text-slate-400">采用章节后，带正文证据的事件会出现在这里。</p>}</div> : <><div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-400">{Object.entries(colors).map(([key, color]) => <span key={key}><i className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{background: color}}/>{labels[key]}</span>)}<span>滚轮缩放 · 拖动画布与节点 · 点击聚焦</span></div><div ref={root} className="mt-3 min-h-72 flex-1 rounded-2xl border border-slate-200 bg-[radial-gradient(#dfe8f0_1px,transparent_1px)] [background-size:18px_18px]"/>{entity && <div className="mt-3 max-h-32 overflow-auto rounded-xl border border-slate-100 bg-white p-4 text-xs leading-6 scrollbar-hide"><b>{entity.name}</b><p>{through === 'plan' ? entity.biography : describeNovelState(memory.states[entity.id] || {}, n.entities)}</p></div>}</>}{evidence && <Evidence id={n.id} fact={evidence} close={() => setEvidence(null)}/>}</div>;
}
