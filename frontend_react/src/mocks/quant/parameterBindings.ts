/** Presentation fixtures only. This module never parses user source. */
import type {QuantAnalysis} from '../../types/api/quant';
import type {QuantParameterSourceBinding} from '../../types/api/quantParameters';

export function mockParameterBindings(analysis: QuantAnalysis, preset = false, version: 1 | 2 = 1) {
    if (preset) {
        // Reusable local flows use a fixed artificial corpus. It deliberately
        // identifies itself instead of claiming to parse the pasted source.
        const originals = analysis.factors?.[0]?.parameters || analysis.parameters;
        const parameters = originals.map((row, index) => {
            let value: unknown;
            try {value = JSON.parse(row.defaultValue);} catch {value = null;}
            const kind = typeof value === 'boolean' ? 'bool' : typeof value === 'string' ? 'string' : typeof value === 'number' ? Number.isInteger(value) ? 'int' : 'float' : 'unknown';
            return {...row, evidence: analysis.parameters.find(parameter => parameter.name === row.name)?.evidence || row.evidence,
                sourceBinding: {version: 1, status: 'resolved', sourceHash: '0'.repeat(64), sourceName: row.name,
                id: `parameter-binding:${index.toString(16).padStart(24, '0')}`, file: row.domain?.version === 5 ? '人工流程参数表.txt' : '人工流程样例.py', scope: row.domain?.version === 5 ? '<external_parameters:description>' : '<module>', kind: row.domain?.version === 5 ? 'external_parameter' : 'module_assignment', ordinal: 1,
                type: row.type, defaultRaw: row.defaultValue, literal: {kind, value: kind === 'unknown' ? null : value}, line: index + 1, endLine: index + 1,
                quote: `${row.name}=${row.defaultValue} # 人工预制语料，与粘贴源码不保证对应`, conditional: false} as QuantParameterSourceBinding};
        });
        analysis.parameters = parameters;
        for (const factor of analysis.factors || []) factor.parameters = factor.parameters.map(row =>
            parameters.find(parameter => parameter.name === row.name) || row);
        analysis.parameterBindingVersion = version;
        analysis.parameterInventoryJson = JSON.stringify({version, parser: 'local-artificial-corpus', status: 'partial',
            declarations: parameters.map(row => row.sourceBinding), limitations: ['人工预制语料，只演示来源展示与工作流，不解析或核实当前粘贴源码。']});
        return;
    }
    const parameters = analysis.parameters.map(row => ({...row, sourceBinding: {version: 1 as const, status: 'unresolved' as const,
        sourceHash: '0'.repeat(64), sourceName: row.name, reason: '人工 local 样例未解析本次源码声明，待真实分析定位。'}}));
    analysis.parameters = parameters;
    for (const parameter of parameters) delete parameter.domain;
    analysis.parameterBindingVersion = 1;
    analysis.parameterInventoryJson = JSON.stringify({version: 1, parser: 'local-presentation-only', status: 'unsupported', declarations: [],
        limitations: ['人工样例没有运行参数解析器，不把演示值视为当前源码默认值。']});
    for (const factor of analysis.factors || []) {
        factor.parameters = factor.parameters.map(row => ({...row, sourceBinding: parameters.find(parameter => parameter.name === row.name)?.sourceBinding || {
            version: 1, status: 'unresolved', sourceHash: '0'.repeat(64), sourceName: row.name, reason: '人工样例尚未定位声明。'}}));
        for (const parameter of factor.parameters) delete parameter.domain;
        factor.expression = null;
    }
}

export function parameterSourceFixture(file: string, scope = '<module>', value = 20): QuantParameterSourceBinding {
    return {version: 1, status: 'resolved', sourceHash: '0'.repeat(64), sourceName: 'N', id: `parameter-binding:${'1'.repeat(24)}`,
        file, scope, kind: 'module_assignment', ordinal: 1, type: 'int', defaultRaw: String(value), literal: {kind: 'int', value},
        line: 2, endLine: 2, quote: `N=${value}`, conditional: false};
}
