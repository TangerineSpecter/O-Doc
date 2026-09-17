import {BookOpen, Lightbulb} from 'lucide-react';
import type {BiographyFlowStep, BiographyQuote, ChapterDigest, ReadingNode, SourceEvidence} from '../../types/bookAnalysis';
import {claimContext, sameSourcePassage} from '../../utils/biographyClaimContext';

interface Props {claim: ReadingNode; digest: ChapterDigest | null; quotes: BiographyQuote[]; onRead: (source: SourceEvidence) => void}

export default function BiographyClaimNotes({claim, digest, quotes, onRead}: Props) {
    const {backgrounds, reflections} = claimContext(digest, claim);
    const details = claim.facts.slice(1).filter(fact => fact.description && fact.description !== claim.facts[0]?.description);
    const relatedQuotes = quotes.filter(quote => claim.facts.some(fact => sameSourcePassage(fact.evidence, quote.attributionEvidence)));
    if (!backgrounds.length && !reflections.length && !details.length && !relatedQuotes.length) return null;
    return <div className="mt-6 space-y-4 border-t border-slate-100 pt-5">
        {details.length > 0 && <section><h4 className="text-xs font-semibold text-slate-700">原文补充</h4>{details.map((fact, index) => <div key={`${fact.description}:${index}`} className="mt-2 rounded-lg bg-slate-50 px-3 py-2"><p className="text-xs leading-6 text-slate-600">{fact.description}</p>{fact.evidence && <SourceButton evidence={fact.evidence} onRead={onRead} label="核对原文"/>}</div>)}</section>}
        {backgrounds.length > 0 && <section><h4 className="text-xs font-semibold text-slate-700">这一观点的原文背景</h4><p className="mt-1 text-[11px] text-slate-400">仅展示与观点证据明确相连的外部事件，不把他人的经历写成传主经历。</p><div className="mt-3 space-y-3">{backgrounds.map((step: BiographyFlowStep, index) => <div key={`${step.title}:${index}`} className="rounded-lg border border-orange-100 bg-orange-50/40 p-3"><p className="text-xs font-semibold text-slate-800">{step.title}</p><p className="mt-1 text-xs leading-5 text-slate-600">{step.detail}</p><SourceButton evidence={step.evidence} onRead={onRead} label="核对背景"/>{step.impactEvidence && <div className="mt-3 border-t border-orange-100 pt-2"><p className="text-[11px] font-semibold text-orange-800">原文交代的传主反应</p><p className="mt-1 text-xs leading-5 text-slate-600">{step.impactEvidence.quote}</p><SourceButton evidence={step.impactEvidence} onRead={onRead} label="核对影响"/></div>}</div>)}</div></section>}
        {relatedQuotes.length > 0 && <section><h4 className="text-xs font-semibold text-slate-700">传主相关原话</h4>{relatedQuotes.map(quote => <div key={quote.id} className="mt-2 border-l-2 border-orange-200 bg-orange-50/30 px-3 py-2"><p className="font-serif text-sm leading-6 text-slate-700">“{quote.text}”</p><SourceButton evidence={quote.attributionEvidence} onRead={onRead} label="核对原话与说话人"/></div>)}</section>}
        {reflections.length > 0 && <section className="rounded-lg border border-lime-100 bg-lime-50/70 p-4"><h4 className="flex items-center gap-2 text-xs font-semibold text-lime-800"><Lightbulb className="h-4 w-4"/>从这条观点继续思考 <span className="font-normal">· AI 解读，非传主原话</span></h4>{reflections.map((reflection, index) => <div key={`${reflection.text}:${index}`} className="mt-3 border-t border-lime-100 pt-3 first:border-0 first:pt-0"><p className="text-xs leading-6 text-slate-600">{reflection.text}</p><SourceButton evidence={reflection.evidence} onRead={onRead} label="核对触发思考的原文"/></div>)}</section>}
    </div>;
}

function SourceButton({evidence, onRead, label}: {evidence: SourceEvidence; onRead: (source: SourceEvidence) => void; label: string}) {
    return <button type="button" onClick={() => onRead(evidence)} className="mt-2 inline-flex items-center gap-1 text-[11px] text-orange-700 hover:underline"><BookOpen className="h-3 w-3"/>{label}</button>;
}
