import type {DecisionProcessGuide} from './decisionProcessTypes';

/** Render the supplied sequence verbatim; never infer links or decisions from step indexes (including hourly replenishment). */
export function DecisionProcessSteps({guide}: {guide: DecisionProcessGuide}) {
    return <div className="space-y-5">
        <p className="text-sm leading-6 text-slate-600">{guide.introduction}</p>
        <div className="flex flex-wrap gap-2 text-xs text-slate-500">
            <span className="rounded-full bg-orange-50 px-3 py-1 text-orange-700">模型选择：有限选项或内容生成</span>
            <span className="rounded-full bg-slate-100 px-3 py-1">系统判断 / 执行：过滤、验证与业务结算</span>
        </div>
        <ol aria-label="执行步骤" className="space-y-3">
            {guide.steps.map((step, index) => <li key={`${index}-${step.title}`} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-start gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold tabular-nums text-slate-600">{index + 1}</span>
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-bold text-slate-800">{step.title}</h3>
                            <span className={`rounded-md px-2 py-0.5 text-xs ${step.role === '模型选择' ? 'bg-orange-50 text-orange-700' : 'bg-slate-100 text-slate-600'}`}>{step.role}</span>
                        </div>
                        <p className="mt-2 text-xs leading-6 text-slate-600">{step.detail}</p>
                        {(step.input || step.options || step.repeat || step.branch) && <dl className="mt-3 space-y-2 border-t border-slate-100 pt-3 text-xs leading-5">
                            {([['本步输入', step.input], ['合法选项', step.options], ['重复与结束', step.repeat], ['条件分支', step.branch]] as const).map(([label, value]) => value && <div key={label} className="grid gap-1 sm:grid-cols-[5rem_minmax(0,1fr)]"><dt className="font-medium text-slate-500">{label}</dt><dd className="min-w-0 break-words text-slate-600">{value}</dd></div>)}
                        </dl>}
                    </div>
                </div>
            </li>)}
        </ol>
        {guide.loop && <p className="rounded-xl border border-orange-100 bg-orange-50 p-3 text-xs leading-6 text-orange-800">循环与接续：{guide.loop}</p>}
        <section aria-label="执行边界" className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-bold text-slate-800">执行边界与恢复</h3>
            {guide.notes.map(note => <div key={note.title}><h4 className="text-xs font-semibold text-slate-700">{note.title}</h4><p className="mt-1 text-xs leading-6 text-slate-600">{note.detail}</p></div>)}
            {guide.upcoming && <p className="border-t border-slate-200 pt-3 text-xs leading-6 text-slate-600">当前限制：{guide.upcoming}</p>}
        </section>
        <p className="text-xs text-slate-500">流程按代码核对：2026-10-24。每次模型选择独立列出；系统自动执行、跳过条件与循环上限按对应步骤说明。</p>
    </div>;
}
