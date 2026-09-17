import type {ChapterDigest, ReadingNode, SourceEvidence} from '../../types/bookAnalysis';
import {nodeLabels} from '../../utils/readingGraph';
import BiographyChapterContext from './BiographyChapterContext';

interface Props {title: string; digest: ChapterDigest; nodes: ReadingNode[]; mode?: 'story' | 'knowledge' | 'biography'; onSelect: (id: string) => void; onRead: (source: SourceEvidence) => void}
export default function GuideDigest({title, digest, nodes, mode, onSelect, onRead}: Props) {
    const names = new Map(nodes.map(node => [node.id, node]));
    const refs = (ids: string[]) => <div className="mt-2 flex flex-wrap gap-1.5">{ids.map((id, index) => <button key={id} onClick={() => onSelect(id)} className="rounded-md border border-orange-100 bg-orange-50 px-2 py-1 text-[11px] text-orange-700 hover:bg-orange-100">{names.get(id)?.name || `关联重点 ${index + 1}`}</button>)}</div>;
    return <article className="space-y-7 rounded-xl border border-slate-200 bg-white p-5 sm:p-7">
        <div><p className="text-[10px] font-semibold tracking-[.18em] text-orange-600">CHAPTER NOTES</p><h2 className="mt-2 font-serif text-xl font-bold text-slate-800">{title}</h2><p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-600">{digest.summary}</p></div>
        <section><h3 className="mb-3 text-sm font-bold text-slate-800">本章重点</h3><div className="space-y-3">{digest.points.map((point, index) => <div key={index} className="border-l-2 border-orange-200 pl-3"><p className="text-sm leading-6 text-slate-600">{point.text}</p>{refs(point.nodeIds)}</div>)}</div></section>
        {!!digest.qa.length && <section><h3 className="mb-3 text-sm font-bold text-slate-800">重点问答</h3><div className="space-y-3">{digest.qa.map((item, index) => <details key={index} className="rounded-lg border border-slate-100 p-3"><summary className="cursor-pointer text-sm font-medium text-slate-700">{item.question}</summary><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-500">{item.answer}</p>{refs(item.nodeIds)}</details>)}</div></section>}
        {!!digest.inspiration.length && <section className="rounded-lg border border-lime-100 bg-lime-50/60 p-4"><h3 className="text-sm font-bold text-slate-800">学习启发 <span className="ml-2 text-[10px] font-normal text-lime-700">AI 延伸建议</span></h3>{digest.inspiration.map((item, index) => <div key={index} className="mt-4 text-sm leading-6 text-slate-600"><p className="font-medium">{item.question}</p><p className="mt-1">应用场景：{item.application}</p><p>试一试：{item.exercise}</p></div>)}</section>}
        {mode === 'biography' && <BiographyChapterContext digest={digest} onRead={onRead}/>}
        {!!nodes.length && <section><h3 className="mb-3 text-sm font-bold text-slate-800">相关内容与原文</h3><div className="space-y-2">{nodes.slice(0, 12).map(node => <div key={node.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2"><button onClick={() => onSelect(node.id)} className="text-left text-sm text-slate-700 hover:text-orange-600"><span className="mr-2 text-[10px] text-slate-400">{nodeLabels[node.kind]}</span>{node.name}</button>{node.facts[0]?.evidence && <button onClick={() => onRead(node.facts[0].evidence!)} className="text-xs text-orange-600">查看原文</button>}</div>)}</div></section>}
    </article>;
}
