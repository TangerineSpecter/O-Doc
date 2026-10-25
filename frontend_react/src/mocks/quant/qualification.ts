/** Local declaration checks only. No uploaded code or market data is executed. */
import type {QuantFactorCandidate} from '../../types/api/quant';
import type {PortableQualification, QuantVerificationSummary} from '../../types/api/quantVerification';
import {validateMockComparisonExpression} from './comparisonValidation';
import {checkParameterDomains} from '../../utils/quantParameterDomain';
import {isParameterText} from '../../utils/quantParameterValues';
const kinds = new Map(Object.entries({int: 'int', integer: 'int', float: 'number', double: 'number', number: 'number', bool: 'bool', boolean: 'bool', string: 'string', str: 'string'}));
export function mockQualification(candidate: QuantFactorCandidate): PortableQualification {
    const data = candidate.data, parameters = data.parameters;
    const checks: PortableQualification['checks'] = [], nodes: PortableQualification['nodes'] = [];
    const placeholders = Object.create(null) as Record<string, number | boolean | string>;
    let configuration: PortableQualification['configuration'] = {status: 'needs_values', missing: parameters.filter(row => !row.defaultValue.trim()).map(row => row.name)};
    if (!data.expression) checks.push({code: 'expression', status: 'missing', message: '没有受控表达式，原平台片段仍待补齐计算语义。'});
    else try {
        for (const parameter of parameters) {
            const kind = kinds.get(parameter.type.trim().toLowerCase());
            placeholders[parameter.name] = kind === 'bool' ? true : kind === 'string' ? String(parameter.domain?.choices[0] ?? '') : 1;
        }
        validateMockComparisonExpression(data, placeholders);
        checks.push({code: 'references', status: 'passed', message: '本地声明引用完整；未加载外部库或运行源码。'});
        const visit = (node: Record<string, unknown>, path = 'root'): string => {
            const children = ((node.args || []) as Record<string, unknown>[]).map((child, index) => visit(child, path + '.' + index));
            const op = String(node.op), name = String(node.name || '');
            if (op === 'parameter') {
                const parameter = parameters.find(row => row.name === name)!;
                const category = kinds.get(parameter.type.trim().toLowerCase());
                if (!category) throw new Error('参数类型尚未识别');
                if (category === 'string' && (!parameter.domain || ![3, 4].includes(parameter.domain.version) || !parameter.domain.choices.length)) throw new Error('文字参数缺少声明式枚举');
            }
            if (['lag', 'sma', 'sum', 'std', 'highest', 'lowest', 'ts_rank'].includes(op)) {
                const window = (node.args as Record<string, unknown>[])[1];
                if (window.op === 'parameter' && kinds.get(parameters.find(row => row.name === window.name)!.type.trim().toLowerCase()) !== 'int') throw new Error('窗口参数须明确声明为整数');
            }
            const kind = op === 'parameter' ? typeof placeholders[name] : op === 'constant' ? typeof node.value : ['eq', 'gt', 'lt', 'and', 'or'].includes(op) ? 'boolean' : ['lag', 'gate'].includes(op) ? children[0] : 'number';
            nodes.push({id: path, op, name, kind, dependencies: children.map((_, index) => path + '.' + index)});
            return kind;
        };
        if (!['numeric_series', 'boolean_series'].includes(data.outputType)) throw new Error('尚不支持声明的输出形式');
        visit(data.expression);
        checks.push({code: 'types', status: 'passed', message: '本地受控表达式声明类型一致，不证明原平台语义等价。'});
    } catch (error) {nodes.length = 0; checks.push({code: 'types', status: 'blocked', message: error instanceof Error ? error.message : '受控表达式类型不一致'});}
    if (!configuration.missing.length) try {
        const values = Object.fromEntries(parameters.map(row => [row.name, JSON.parse(row.defaultValue) as number | boolean | string]));
        for (const parameter of parameters) {
            const kind = kinds.get(parameter.type.trim().toLowerCase()), value = values[parameter.name];
            if (!kind || (kind === 'int' ? typeof value !== 'number' || !Number.isInteger(value) : kind === 'number' ? typeof value !== 'number' || !Number.isFinite(value) : kind === 'bool' ? typeof value !== 'boolean' : !isParameterText(value))) throw new Error('声明默认值类型不一致');
        }
        checkParameterDomains(parameters, values);
        if (data.expression) validateMockComparisonExpression(data, values);
        configuration = {status: 'declared_defaults_valid', missing: []};
    } catch {configuration = {status: 'invalid_declared_defaults', missing: []};}
    const blockers = checks.filter(row => row.status !== 'passed').map(row => row.code);
    const unbound = data.inputs.filter(row => !['open', 'high', 'low', 'close', 'volume'].includes(row.name.toLowerCase())).map(row => row.name);
    return {version: 1, candidate_hash: candidate.contentHash, scope: 'portable_expression_declared_contract_only', reuse_status: blockers.length ? 'candidate' : 'reusable',
        checks, blockers, nodes, configuration, automatic_ohlcv_mapping: !unbound.length, inputs_requiring_mapping: unbound,
        automatic_experiment_ready: !blockers.length && !unbound.length && configuration.status === 'declared_defaults_valid' && ['factor', 'signal', 'filter'].includes(data.role),
        inputs: data.inputs.map(row => ({name: row.name, used: nodes.some(node => node.op === 'input' && node.name === row.name), availability: row.availability, missing_policy: row.missingPolicy})),
        parameters: parameters.map(row => ({name: row.name, used: nodes.some(node => node.op === 'parameter' && node.name === row.name), kind: kinds.get(row.type.trim().toLowerCase()) || 'unknown'})),
        external_dependencies: data.dependencies.map(name => ({name, status: 'declared_unverified_original_context'})), platform_equivalence: 'unverified', economic_effectiveness: 'unassessed'};
}
export function mockQualificationSummary(candidate: QuantFactorCandidate, unchecked = false): QuantVerificationSummary {
    const data = mockQualification(candidate);
    return {policyVersion: 1, qualificationId: unchecked ? '' : 'local-qualification-' + candidate.id, reuseStatus: unchecked ? 'unchecked' : data.reuse_status,
        automaticExperimentReady: !unchecked && data.automatic_experiment_ready, blockers: unchecked ? [] : data.blockers, scope: 'portable_expression_declared_contract_only'};
}
