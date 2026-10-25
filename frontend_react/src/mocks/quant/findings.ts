import type {QuantSource, QuantAnalysis} from '../../types/api/quant';

export function mockSourceFindings(source?: QuantSource): Pick<QuantAnalysis, 'sourceFindingsVersion' | 'sourceFindingsNote' | 'sourceFindings'> {
    const marker = 'LOCAL_CRITICAL_FINDING';
    const quote = source?.payload.code?.split('\n').find(line => line.includes(marker));
    return {sourceFindingsVersion: 1, sourceFindingsNote: '纯 local 演示：没有调用模型或运行源码。本样例只演示问题清单，不判断真实代码质量。',
        sourceFindings: quote ? [{title: '演示：最终计算包含未来数据', severity: 'critical', category: 'temporal_leakage', certainty: 'hypothesis',
            impact: '这是人工预设的本地样例。若最终输出依赖未来值，就不能将其作为当时可用信号；须分开历史特征和事后标签。',
            recommendation: '核对引用和时点，在独立数据中检验可分离的历史特征；此样例没有执行验证。',
            affectedDimensions: ['数据与时序可靠性'], evidence: [{field: 'code', quote}]}] : []};
}

export function mockFindingsMarkdown(data: QuantAnalysis): string {
    if (data.sourceFindingsVersion !== 1) return '';
    return '\n\n## 问题清单与严重度\n\n' + data.sourceFindingsNote + '\n\n' + (data.sourceFindings?.map(row =>
        `### ${row.severity === 'critical' ? '严重' : row.severity} · ${row.title}\n\n${row.impact}\n\n建议：${row.recommendation}\n\n${row.evidence.map(e => e.quote).join('\n')}`).join('\n\n') || '本次样例未列出问题，不证明源码没有缺陷。');
}
