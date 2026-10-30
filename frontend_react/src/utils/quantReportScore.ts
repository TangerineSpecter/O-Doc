import type { QuantReport } from '../types/api/quant';

/** Matches the report panel's default: latest source report, otherwise latest report. */
export function defaultResearchReport(reports: QuantReport[] = []): QuantReport | undefined {
    return reports.find(report => report.schemaVersion !== 4 && report.schemaVersion !== 5) || reports[0];
}

export function researchReportScore(reports: QuantReport[] = []): number | null {
    const score = defaultResearchReport(reports)?.data.totalScore;
    return typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 100 ? score : null;
}
