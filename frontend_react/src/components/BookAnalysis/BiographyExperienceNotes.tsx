import {BookOpen, Lightbulb} from 'lucide-react';
import type {BiographyInsight, ChapterDigest, SourceEvidence} from '../../types/bookAnalysis';

interface Props {nodeId: string; summary?: string; digest: ChapterDigest | null; onRead: (source: SourceEvidence) => void}

const labels: Record<BiographyInsight['kind'], string> = {
    motivation: '为什么', decision: '做出的选择', cause: '原文交代的起因', conversation: '谈了什么',
    outcome: '发生的结果', lesson: '书中提到的经验', turning_point: '后续影响',
};

const compact = (value: string) => value.replace(/[\s，。；：、,.!:;“”"‘’]/g, '');

export default function BiographyExperienceNotes({nodeId, summary = '', digest, onRead}: Props) {
    const seen = new Set<string>([compact(summary)]);
    const insights = (digest?.insights || []).filter(item => {
        if (item.eventId !== nodeId) return false;
        const detail = compact(item.text);
        if (!detail || seen.has(detail)) return false;
        seen.add(detail);
        return true;
    });
    const reflections = digest?.reflections || [];
    const reflection = reflections.find(item => item.eventId === nodeId);
    return <>
        {insights.length > 0 && <section className="mt-7 border-t border-slate-100 pt-5">
            <h4 className="text-xs font-semibold text-slate-700">书中还交代了</h4>
            <div className="mt-3 space-y-3">{insights.map((item, index) => <div key={`${item.kind}:${index}`} className="border-l-2 border-orange-200 pl-3">
                <p className="text-xs font-semibold text-orange-700">{labels[item.kind]}</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">{item.text}</p>
                <button onClick={() => onRead(item.evidence)} className="mt-1 inline-flex items-center gap-1 text-xs text-orange-700 hover:underline"><BookOpen className="h-3.5 w-3.5"/>核对原文 · {item.evidence.chapterTitle}</button>
            </div>)}</div>
        </section>}
        {reflection && <section className="mt-6 rounded-lg border border-lime-100 bg-lime-50/70 p-4">
            <h4 className="flex flex-wrap items-center gap-2 text-xs font-semibold text-lime-800"><Lightbulb className="h-4 w-4"/>这段经历的思考引子<span className="font-normal">· AI 解读，非传主原话</span></h4>
            <p className="mt-2 text-sm leading-6 text-slate-600">{reflection.text}</p>
            <button onClick={() => onRead(reflection.evidence)} className="mt-2 inline-flex items-center gap-1 text-xs text-orange-700 hover:underline"><BookOpen className="h-3.5 w-3.5"/>查看触发思考的原文 · {reflection.evidence.chapterTitle}</button>
        </section>}
    </>;
}
