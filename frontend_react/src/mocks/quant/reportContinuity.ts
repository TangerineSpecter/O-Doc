import type {QuantAIRun, QuantEntryDetail, QuantReport} from '../../types/api/quant';
import {quantId} from './state';

export function preserveMockReading(entry: QuantEntryDetail, run: QuantAIRun, report: QuantReport) {
    const stage = run.workflow?.restartStage;
    if (!run.workflow?.resumeRunId || !stage || !['compare', 'review', 'plan', 'publish'].includes(stage)) return;
    const keys = ['title', 'kind', 'summary', 'principle', 'formula', 'usage', 'parameters', 'factors', 'factorRepair', 'assumptions', 'validationPlan'] as const;
    const previous = entry.reports?.filter(row => row.id !== report.id && row.sourceId === report.sourceId
        && [2, 3].includes(row.schemaVersion) && row.currentRevisionId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .find(row => keys.every(key => JSON.stringify(row.data[key]) === JSON.stringify(report.data[key])));
    if (!previous) return;
    const accepted = previous.revisions.find(row => row.id === previous.currentRevisionId);
    if (!accepted) return;
    const revision = {id: quantId('revision'), markdown: accepted.markdown, createdAt: new Date().toISOString()};
    report.revisions.push(revision);
    report.currentRevisionId = revision.id;
    report.markdown = revision.markdown;
}
