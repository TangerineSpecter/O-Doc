import { scoreEvidenceLabels, scoreReasonLabels, scoreSections } from '../../../utils/quantScoreExplanation';

export function ScoreExplanation({ reason, evidence }: { reason: string; evidence: string }) {
    const reasons = scoreSections(reason, scoreReasonLabels);
    const sources = scoreSections(evidence, scoreEvidenceLabels);
    return (
        <div className="mt-3 space-y-3 border-t border-slate-700/70 pt-3 text-sm leading-6 text-slate-300">
            <dl className="space-y-3 rounded-xl bg-slate-900/60 p-3 sm:p-4">
                {(reasons ? scoreReasonLabels : ['评分说明']).map(label => (
                    <div key={label} className="grid gap-1 sm:grid-cols-[6rem_1fr] sm:gap-4">
                        <dt className="font-semibold text-slate-100">{label}</dt>
                        <dd className="whitespace-pre-wrap break-words">{reasons?.[label] ?? (reason || '本项尚未提供评分说明。')}</dd>
                    </div>
                ))}
            </dl>
            {sources && <div className="px-1 text-xs leading-5 text-slate-400">
                <strong className="mr-2 font-medium text-slate-300">验证情况</strong>{sources['验证情况']}
            </div>}
            <details className="rounded-lg border border-slate-700/60 px-3 py-2">
                <summary className="cursor-pointer text-xs font-medium text-slate-400 hover:text-slate-200">查看源码依据{sources ? '' : '与原始记录'}</summary>
                <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-6 text-slate-400">
                    {sources?.['源码依据'] ?? (evidence || '本项尚未提供源码依据。')}
                </p>
            </details>
        </div>
    );
}
