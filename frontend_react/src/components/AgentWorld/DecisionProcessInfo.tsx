import {useState} from 'react';
import {ArrowDown, CornerDownLeft, GitBranch, Info} from 'lucide-react';
import WorldDialog from './WorldDialog';
import {decisionProcessGuides} from './decisionProcessGuides';
import type {DecisionGuideKind} from './decisionProcessGuides';

export function DecisionProcessInfo({kind}: {kind: DecisionGuideKind}) {
    const [open, setOpen] = useState(false);
    const guide = decisionProcessGuides[kind];
    return <>
        <button type="button" aria-label={`查看${guide.title}`} title={guide.title}
            aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center whitespace-nowrap rounded-full text-slate-400 transition-colors hover:bg-orange-50 hover:text-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40">
            <Info className="h-4 w-4" aria-hidden="true" />
        </button>
        {open && <WorldDialog title={guide.title} description="按当前实现说明 · 模型选择与系统判断分开标注"
            onClose={() => setOpen(false)} size="default">
            <div className="space-y-4 text-xs leading-relaxed text-slate-600">
                <p className="rounded-xl border border-orange-100 bg-orange-50/60 p-3 text-orange-900">{guide.introduction}</p>
                <ol aria-label={`${guide.title}示意图`} className="mx-auto max-w-2xl">
                    {guide.steps.map((step, index) => <li key={step.title}>
                        {index > 0 && <div className="flex justify-center py-1.5" aria-hidden="true"><ArrowDown className="h-4 w-4 text-slate-300" /></div>}
                        <div className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[11px] font-bold text-slate-500">{index + 1}</span>
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="font-bold text-slate-800">{step.title}</h3>
                                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${step.role === '模型选择' ? 'bg-orange-50 text-orange-700' : 'bg-slate-100 text-slate-500'}`}>{step.role}</span>
                                </div>
                                <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{step.detail}</p>
                            </div>
                        </div>
                        {step.branch && <p className="ml-6 mt-1.5 flex gap-1.5 border-l border-dashed border-amber-200 py-1 pl-3 text-[11px] text-amber-700">
                            <GitBranch className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{step.branch}
                        </p>}
                    </li>)}
                </ol>
                {guide.loop && <p className="flex items-start gap-2 rounded-xl border border-orange-100 bg-orange-50/50 p-3 text-[11px] text-orange-800">
                    <CornerDownLeft className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{guide.loop}
                </p>}
                <div className="grid gap-3 sm:grid-cols-2">
                    {guide.notes.map(note => <section key={note.title} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                        <h3 className="font-semibold text-slate-700">{note.title}</h3>
                        <p className="mt-1 text-[11px] text-slate-500">{note.detail}</p>
                    </section>)}
                </div>
                {guide.upcoming && <p className="rounded-xl border border-dashed border-slate-200 p-3 text-[11px] text-slate-500">{guide.upcoming}</p>}
            </div>
        </WorldDialog>}
    </>;
}
