import {useState} from 'react';
import {BookOpen, ChevronDown, Lightbulb} from 'lucide-react';
import type {ChapterDigest, SourceEvidence} from '../../types/bookAnalysis';

interface Props {digest: ChapterDigest | null; onRead: (source: SourceEvidence) => void}

export default function BiographyChapterContext({digest, onRead}: Props) {
    const [openIndex, setOpenIndex] = useState<number | null>(null);
    const backgrounds = (digest?.flow || []).filter(step => step.kind === 'background' && step.impactEvidence);
    const reflections = digest?.reflections || [];
    if (!backgrounds.length && !reflections.length) return null;

    return <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5" aria-label="本章背景与思考">
        <h4 className="text-xs font-semibold text-slate-700">本章背景与思考</h4>
        <p className="mt-1 text-xs leading-5 text-slate-500">这里汇集本章背景与 AI 解读；它们不等同于传主原话，也不自动构成因果关系。</p>
        {!!backgrounds.length && <div className="mt-4">
            <p className="text-[11px] font-semibold text-slate-500">原文交代影响传主的外部事件</p>
            <div className="mt-2 flex flex-wrap gap-2">{backgrounds.map((step, index) => <button key={`${step.title}:${index}`} type="button" aria-expanded={openIndex === index} onClick={() => setOpenIndex(openIndex === index ? null : index)} className={`inline-flex max-w-full items-center gap-1 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 ${openIndex === index ? 'border-orange-300 bg-orange-50 text-orange-800' : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-orange-200'}`}><span className="truncate">{step.title}</span><ChevronDown className={`h-3 w-3 shrink-0 transition-transform ${openIndex === index ? 'rotate-180' : ''}`}/></button>)}</div>
            {openIndex !== null && backgrounds[openIndex] && <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-sm leading-6 text-slate-600">
                <p className="font-medium text-slate-700">{backgrounds[openIndex].title}</p>
                <p className="mt-1">{backgrounds[openIndex].detail}</p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    <button type="button" onClick={() => onRead(backgrounds[openIndex].evidence)} className="inline-flex items-center gap-1 text-orange-700 hover:underline"><BookOpen className="h-3.5 w-3.5"/>核对背景原文</button>
                    <button type="button" onClick={() => onRead(backgrounds[openIndex].impactEvidence!)} className="inline-flex items-center gap-1 text-orange-700 hover:underline"><BookOpen className="h-3.5 w-3.5"/>核对影响传主的原文</button>
                </div>
            </div>}
        </div>}
        {!!reflections.length && <details className="mt-4 rounded-lg border border-lime-100 bg-lime-50/60 p-3"><summary className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-lime-800"><Lightbulb className="h-4 w-4"/>本章思考引子 <span className="font-normal">· AI 解读，非传主原话</span></summary><div className="mt-3 space-y-3">{reflections.map((reflection, index) => <div key={`${reflection.text}:${index}`} className="border-t border-lime-100 pt-3 first:border-0 first:pt-0"><p className="text-xs leading-6 text-slate-600">{reflection.text}</p><button type="button" onClick={() => onRead(reflection.evidence)} className="mt-1 inline-flex items-center gap-1 text-xs text-orange-700 hover:underline"><BookOpen className="h-3.5 w-3.5"/>核对触发思考的原文</button></div>)}</div></details>}
    </section>;
}
