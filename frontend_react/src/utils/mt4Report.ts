import type {MT4Report} from '../types/api/mt4Archive';

export function reportMetric(report: MT4Report, labels: string[]): string {
    const wanted = labels.map(label => label.toLowerCase());
    for (const row of report.metrics || []) {
        for (let index = 0; index < row.length - 1; index++) {
            if (wanted.includes(row[index].toLowerCase())) return row[index + 1];
        }
    }
    return '';
}
