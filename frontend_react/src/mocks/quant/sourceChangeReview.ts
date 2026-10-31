/** Artificial report contract only: no Python binding solver or model runs here. */
import type {QuantAIRun, QuantAnalysis, QuantEntryDetail} from '../../types/api/quant';

export function mockSourceChangeReview(run: QuantAIRun, entry: QuantEntryDetail): Pick<QuantAnalysis, 'sourceChangeReviewVersion' | 'sourceChangeFactsJson' | 'sourceChangeAssessment'> {
    let baseline = entry.runs.find(row => row.id === run.workflow?.resumeRunId);
    const seen = new Set<string>();
    while (baseline && baseline.sourceId === run.sourceId && !seen.has(baseline.id)) {
        seen.add(baseline.id);
        const parentId = baseline.workflow?.resumeRunId;
        baseline = entry.runs.find(row => row.id === parentId);
    }
    const limits = ['人工 local 样例没有运行后端词法作用域/赋值链解析；零展示节点不表示代码没有变化或未受影响。', '仍需真实源码分析、AI逐项复核及独立验证；不继承基准评分。'];
    const version = [20, 22, 24, 26, 27, 28, 30, 32, 34, 36, 38, 40, 42].includes(run.workflow?.version || 0) ? 2 : 1;
    return {sourceChangeReviewVersion: version,
        sourceChangeFactsJson: JSON.stringify({version, method: `bounded-source-change-review-v${version}`,
            baseline: {run_id: baseline?.id || 'local-baseline', source_id: baseline?.sourceId || 'local-source', source_hash: '0'.repeat(64), outcome_id: ''},
            target_source_hash: '0'.repeat(64), change_hash: '0'.repeat(64), status: 'changed', changed_fields: ['code'],
            old_parser: 'local-presentation-only', new_parser: 'local-presentation-only',
            counts: {added: 0, removed: 0, changed: 0, moved: 0, identical: 0, direct: 0, potential: 0, unknown: 0},
            total_nodes: 0, eligible_nodes: 0, omitted_nodes: 0, nodes: [], limitations: limits}),
        sourceChangeAssessment: {summary: '人工 local 源码变化影响复核，仅展示新报告章节，没有调用模型或推断实际依赖。', nodes: [], limitations: limits}};
}

export function mockSourceChangeMarkdown(data: Pick<QuantAnalysis, 'sourceChangeReviewVersion' | 'sourceChangeAssessment'>): string {
    if (![1, 2].includes(data.sourceChangeReviewVersion || 0) || !data.sourceChangeAssessment) return '';
    return '\n\n## 源码变化影响复核\n\n' + data.sourceChangeAssessment.summary + '\n\n### 复核范围与未验证项\n\n' + data.sourceChangeAssessment.limitations.join('\n\n');
}
