import {memo, useMemo, useState} from 'react';
import {ChevronDown} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {planningMissingItems, planningNoteParagraphs, planningNoteReading, planningReadingText} from './planningNoteReading';

const markdownComponents = {
    p: ({children}: {children?: React.ReactNode}) => <p className="whitespace-pre-wrap">{children}</p>,
    ul: ({children}: {children?: React.ReactNode}) => <ul className="list-disc space-y-2 pl-5">{children}</ul>,
    ol: ({children}: {children?: React.ReactNode}) => <ol className="list-decimal space-y-2 pl-5">{children}</ol>,
    pre: ({children}: {children?: React.ReactNode}) => <pre className="overflow-x-auto rounded-lg bg-slate-100 p-3 text-xs scrollbar-hide">{children}</pre>,
    table: ({children}: {children?: React.ReactNode}) => <div className="overflow-x-auto scrollbar-hide"><table className="w-full text-left text-xs">{children}</table></div>,
    th: ({children}: {children?: React.ReactNode}) => <th className="border-b border-slate-200 p-2 font-semibold">{children}</th>,
    td: ({children}: {children?: React.ReactNode}) => <td className="border-b border-slate-200 p-2 align-top">{children}</td>,
};

const NoteText = memo(function NoteText({text}: {text: string}) {
    // Plain prose has no Markdown parsing cost. Render rich syntax only when the note uses it.
    const rich = /(?:^|\n)\s*(?:#{1,6}\s|[-*>]\s|\d+\.\s|\|)|`|\*\*|\[[^\]]+\]\(/.test(text);
    return <div className="space-y-3 text-sm leading-7 text-slate-700 [overflow-wrap:anywhere]">
        {planningNoteParagraphs(text).map((paragraph, index) => rich
            ? <ReactMarkdown key={index} remarkPlugins={[remarkGfm]} components={markdownComponents}>{paragraph}</ReactMarkdown>
            : <p key={index} className="whitespace-pre-wrap">{paragraph}</p>)}
    </div>;
});

export const PlanningNote = memo(function PlanningNote({note}: {note: string}) {
    const {primary, evidence} = useMemo(() => planningNoteReading(note), [note]);
    const [evidenceOpen, setEvidenceOpen] = useState(false);
    const [originalOpen, setOriginalOpen] = useState(false);
    if (!note.trim()) return null;
    return <section className="min-w-0 space-y-5" aria-label="实验规划说明">
        {primary.map((row, index) => <section key={index} aria-label={row.title}>
            <h4 className="mb-3 text-sm font-semibold text-slate-900">{row.title}</h4>
            {row.title === '需要补齐' ? <ul className="space-y-2.5">
                {planningMissingItems(row.text).map((item, i) => <li key={i} className="flex items-start gap-3 rounded-lg bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700 [overflow-wrap:anywhere]">
                    <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-400"/>
                    <span className="min-w-0">{item}</span>
                </li>)}
            </ul> : <NoteText text={row.text}/>}
        </section>)}
        {!primary.length && <p className="text-sm text-slate-500">这份说明未单独列出研究结论，可展开技术依据查看。</p>}
        <div className="space-y-3 border-t border-slate-100 pt-3">
            {!!evidence.length && <details onToggle={event => setEvidenceOpen(event.currentTarget.open)} className="group">
                <summary className="flex w-fit cursor-pointer list-none items-center gap-2 rounded text-xs font-medium text-slate-500 hover:text-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 [&::-webkit-details-marker]:hidden">
                    <ChevronDown size={14} className="shrink-0 group-open:rotate-180"/>技术依据 · 来源、参数与平台检查
                </summary>
                {evidenceOpen && <div className="mt-4 space-y-5 rounded-xl bg-slate-50/70 p-4">
                    {evidence.map((row, index) => <section key={index}><h5 className="mb-2 text-sm font-semibold text-slate-800">{row.title}</h5><NoteText text={planningReadingText(row.text)}/></section>)}
                </div>}
            </details>}
            <details onToggle={event => setOriginalOpen(event.currentTarget.open)} className="group">
                <summary className="flex w-fit cursor-pointer list-none items-center gap-2 rounded text-xs font-medium text-slate-500 hover:text-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 [&::-webkit-details-marker]:hidden">
                    <ChevronDown size={14} className="shrink-0 group-open:rotate-180"/>查看完整原文
                </summary>
                {originalOpen && <p className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-xs leading-6 text-slate-600 [overflow-wrap:anywhere]" tabIndex={0} aria-label="完整原文">{note}</p>}
            </details>
        </div>
    </section>;
});
