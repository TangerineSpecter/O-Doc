import {memo} from 'react';
import type {QuantReportReading} from '../../../types/api/quantReading';
import { logicReportBody } from '../../../utils/quantLogicReport';
import { factorReadingNotes } from '../../../utils/quantFactorReading';
import { ReportMarkdown } from '../ReportMarkdown';
import { SourceFindings } from '../SourceFindings';
import { ReportScore } from './ReportScore';
import { ExtractedFactors } from './ExtractedFactors';

export const StaticLogicReport = memo(function StaticLogicReport({ report, draft, revised, openFactors, twoColumn }: {
    report: QuantReportReading; draft: string; revised: boolean; openFactors: () => void; twoColumn: boolean;
}) {
    const hasScore = !!report.data.scores?.length;
    const hasFactors = report.data.extractionVersion === 1;
    const reading = factorReadingNotes(draft);
    const jump = (id: string) => document.getElementById(id)?.scrollIntoView({behavior: 'smooth', block: 'start'});
    return <div className="space-y-4">
        {(hasScore || hasFactors) && <nav aria-label="报告快速跳转" className={`flex flex-wrap items-center gap-2 ${twoColumn ? 'xl:hidden' : ''}`}>
            {hasScore && <button type="button" onClick={() => jump('quant-sec-score')} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-orange-300 hover:text-orange-700">
                研究评分 {report.data.totalScore ?? '未评估'} {report.data.totalScore != null && ' / 100'} ↓
            </button>}
            {hasFactors && <button type="button" onClick={() => jump(`quant-report-factors-${report.id}`)} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-orange-300 hover:text-orange-700">
                提取的因子与信号 {report.data.factors?.length || 0} ↓
            </button>}
        </nav>}
        <div className={`grid min-w-0 items-start gap-5 ${twoColumn ? 'xl:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]' : ''}`}>
            <div className="min-w-0 space-y-4">
                <div className="rounded-2xl border border-slate-200/70 bg-white p-4 sm:p-6">
                    <div className="max-w-[90ch]">
                        <ReportMarkdown text={logicReportBody(reading.body, revised)} stripTitle={report.data.title}/>
                    </div>
                </div>
                <details className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-600 hover:text-orange-600">查看原稿中的检查记录</summary>
                    <div className="mt-4 space-y-4">
                        <SourceFindings version={report.data.sourceFindingsVersion} findings={report.data.sourceFindings} note={report.data.sourceFindingsNote}/>
                    </div>
                </details>
            </div>
            {(hasScore || hasFactors) && <aside aria-label="评分与提取结果" className={`min-w-0 space-y-4 ${twoColumn ? 'xl:sticky xl:top-0 xl:max-h-screen xl:overflow-y-auto scrollbar-hide' : ''}`}>
                {hasScore && <ReportScore report={report}/>}
                <ExtractedFactors key={report.id} report={report} openFactors={openFactors} notes={reading.notes}/>
            </aside>}
        </div>
    </div>;
});
