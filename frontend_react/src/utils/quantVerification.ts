import {readStrategy} from './quantStrategy';
import {readStrategyExecution} from './quantStrategyExecution';
import {readCriteria,readCriteriaAssessment} from './quantValidationCriteria';
import {readNativeComparison} from './quantNativePython';
import type {DirectVerification, PortableQualification} from '../types/api/quantVerification';
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string');
const rows = (value: unknown, fields: string[]) => Array.isArray(value) && value.every(row => object(row) && fields.every(key => key in row));
const textFields = (value: unknown, fields: string[]) => object(value) && fields.every(key => typeof value[key] === 'string');
const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value);
const scalar = (value: unknown) => finite(value) || typeof value === 'boolean' || typeof value === 'string';
const parameters = (value: unknown) => Array.isArray(value) && value.every(row => textFields(row, ['name']) && object(row) && scalar(row.value));
const bindings = (value: unknown) => Array.isArray(value) && value.every(row => textFields(row, ['name', 'column']));
const metric = (value: unknown, baseline = false) => {
    if (!object(value)) return false;
    if (value.execution !== undefined) {try {readStrategyExecution(value.execution, Number(value.entries), false, baseline);} catch {return false;}}
    return Object.entries(value).every(([key, item]) => key === 'execution' || (['start', 'end'].includes(key) ? finite(item) || typeof item === 'string' : finite(item)));
};
function decode(text: string): Record<string, unknown> {
    if (text.length > 4000000) throw new Error('验证依据超过读取上限');
    const value: unknown = JSON.parse(text);
    if (!object(value) || value.version !== 1 || typeof value.candidate_hash !== 'string') throw new Error('验证依据版本或公式身份无效');
    return value;
}
export function readQualification(text: string): PortableQualification {
    const value = decode(text);
    if (!['reusable', 'candidate'].includes(String(value.reuse_status)) || !strings(value.blockers) || !object(value.configuration)
        || !strings(value.configuration.missing) || !strings(value.inputs_requiring_mapping) || typeof value.automatic_experiment_ready !== 'boolean'
        || !rows(value.checks, ['code', 'status', 'message']) || !rows(value.nodes, ['id', 'op', 'kind', 'dependencies'])
        || !rows(value.inputs, ['name', 'used', 'availability', 'missing_policy']) || !rows(value.parameters, ['name', 'used', 'kind'])
        || !rows(value.external_dependencies, ['name', 'status']) || value.platform_equivalence !== 'unverified' || value.economic_effectiveness !== 'unassessed') throw new Error('结构检查记录不完整');
    if (value.scope !== 'portable_expression_declared_contract_only' || !['needs_values', 'declared_defaults_valid', 'invalid_declared_defaults'].includes(String(value.configuration.status))
        || !(value.checks as unknown[]).every(row => textFields(row, ['code', 'status', 'message']) && object(row) && ['passed', 'blocked', 'missing'].includes(String(row.status)))
        || !(value.nodes as unknown[]).every(row => textFields(row, ['id', 'op', 'name', 'kind']) && object(row) && strings(row.dependencies))
        || !(value.inputs as unknown[]).every(row => textFields(row, ['name', 'availability', 'missing_policy']) && object(row) && typeof row.used === 'boolean')
        || !(value.parameters as unknown[]).every(row => textFields(row, ['name', 'kind']) && object(row) && typeof row.used === 'boolean')
        || !(value.external_dependencies as unknown[]).every(row => textFields(row, ['name', 'status']))) throw new Error('结构检查字段类型或范围不一致');
    return value as unknown as PortableQualification;
}
export function readVerification(text: string): DirectVerification {
    const value = decode(text);
    if (!strings(value.levels) || value.levels.some(level => !Object.prototype.hasOwnProperty.call(verificationLevelLabels, level)) || !textFields(value, ['target_id', 'target_hash', 'scope', 'claim'])) throw new Error('验证对象与范围不完整');
    if (value.kind!=='fixed_validation' && value.levels.includes('registered_criteria_met')) throw new Error('登记标准层级只能属于对应固定验证');
    if (value.kind!=='native_python'&&value.levels.some(row=>row.startsWith('native_python_')))throw new Error('Python验证层级只能属于当前版本的原始函数对照');
    if (value.kind === 'native_python') {
        if (value.independent_validation!==false||value.platform_equivalence!=='unverified'||value.economic_effectiveness!=='unassessed'
            ||!object(value.parameters)||!object(value.bindings)||!object(value.dataset)||!object(value.native)||!object(value.environment)
            ||!object(value.environment.runtime)||!textFields(value.environment.runtime,['python','numpy','pandas'])||!textFields(value,['status','reason']))throw new Error('Python验证事实或证据边界无效');
        if (value.status==='completed')readNativeComparison(value.comparison);
        else if (value.comparison!==null||value.verdict!==null||value.levels.length)throw new Error('Python运行失败不能补加验证层级');
        if (value.levels.includes('native_python_fixed_match')!==(value.status==='completed'&&value.verdict==='pass'))throw new Error('Python一致性层级与计算判定不一致');
    } else if (value.kind === 'experiment') {
        if (!object(value.market) || !object(value.config) || typeof value.request_id !== 'string' || !rows(value.attempts, ['id', 'status', 'parameters', 'bindings', 'metrics'])
            || !(value.attempts as Record<string, unknown>[]).every(row => rows(row.parameters, ['name', 'original_name', 'value']) && rows(row.bindings, ['name', 'column']) && object(row.metrics))
            || !rows(value.heldout, ['attempt_id', 'partitions', 'metrics', 'prior_usage']) || value.independent_validation !== false) throw new Error('实验验证依据不完整或夸大独立性');
        if (!textFields(value.market, ['symbol', 'timeframe']) || !['threshold', 'fee_bps', 'slippage_bps', 'gap'].every(key => object(value.config) && finite(value.config[key]))
            || !textFields(value, ['result_status', 'error', 'engine_version', 'dataset_hash'])
            || !(value.attempts as Record<string, unknown>[]).every(row => textFields(row, ['id', 'status', 'reason', 'operation']) && parameters(row.parameters) && bindings(row.bindings)
                && object(row.metrics) && Object.values(row.metrics).every(value => metric(value)))
            || !(value.heldout as Record<string, unknown>[]).every(row => textFields(row, ['attempt_id', 'status']) && metric(row.metrics) && row.prior_usage === 'unattested' && object(row.partitions))) throw new Error('实验指标、参数或输入字段不完整');
        if (object(value.config) && value.config.strategy !== undefined) {
            readStrategy(value.config.strategy, Number(value.config.threshold));
            if (!['quant-local-search-5', 'quant-local-search-6', 'quant-local-search-8'].includes(String(value.engine_version))) throw new Error('策略执行证据与引擎版本不一致');
        }
    } else if (value.kind === 'fixed_validation') {
        if (!textFields(value,['source_request_id','source_attempt_id','dataset_hash']) || !object(value.market) || !textFields(value.market,['symbol','timeframe']) || !object(value.config) || !['threshold','fee_bps','slippage_bps'].every(k=>object(value.config) && finite(value.config[k])) || !object(value.recipe) || !object(value.recipe.parameters) || !object(value.bounds) || !textFields(value.bounds,['start_timestamp','end_timestamp']) || !metric(value.metrics) || !metric(value.baseline,true) || !['fresh','replication'].includes(String(value.mode)) || value.independent_validation!==false || (value.result_status===undefined||value.result_status==='completed'? !object(value.publication_audit)||value.publication_audit.global_independent_validation!==false||!finite(value.publication_audit.conflict_count):value.publication_audit!==null)) throw new Error('固定验证直接证据不完整或夸大独立性');
        if(value.result_status!==undefined&&!['completed','failed','cancelled'].includes(String(value.result_status)))throw new Error('固定评价状态无效');
        if(value.result_status&&value.result_status!=='completed'&&(Object.keys(value.metrics as Record<string,unknown>).length||Object.keys(value.baseline as Record<string,unknown>).length||value.levels.length))throw new Error('未完成固定评价不能补造指标或层级');
        if (value.config.strategy!==undefined) readStrategy(value.config.strategy,Number(value.config.threshold));
        if (value.registered_criteria!==undefined) {
            const criteria=readCriteria(value.registered_criteria);
            if (!object(value.criteria_context) || value.criteria_context.mode!==value.mode || typeof value.criteria_context.imported_after_registration!=='boolean' || !object(value.criteria_context.audit)) throw new Error('登记标准的授权范围缺失');
            const assessment=readCriteriaAssessment(value.criteria_assessment,criteria,String(value.result_status||'completed'),value.result_status&&value.result_status!=='completed'?null:{final:value.metrics,baseline:value.baseline},value.criteria_context,value.publication_audit);
            if (value.levels.includes('registered_criteria_met')!==(assessment.eligibility==='fresh_scope_criteria_met')) throw new Error('登记标准层级与发布时限定资格不一致');
        } else if (value.criteria_assessment!==undefined || value.criteria_context!==undefined || value.levels.includes('registered_criteria_met')) throw new Error('历史观察不能补加事后达标层级');
    } else if (value.kind === 'comparison') {
        if (!object(value.market) || !object(value.policy) || !object(value.counts) || !rows(value.sides, ['side', 'parameters', 'bindings']) || !['pass', 'fail', 'inconclusive'].includes(String(value.verdict))) throw new Error('对照验证依据不完整');
        if (!textFields(value.market, ['symbol', 'timeframe']) || !['absolute_tolerance', 'relative_tolerance', 'warmup_bars'].every(key => object(value.policy) && finite(value.policy[key]))
            || !Object.values(value.counts).every(item => item === null || finite(item))
            || !(value.sides as Record<string, unknown>[]).every(row => textFields(row, ['side']) && parameters(row.parameters) && bindings(row.bindings))) throw new Error('对照参数与计数字段无效');
    } else if (value.kind === 'feedback') {
        if (typeof value.title !== 'string' || typeof value.mode !== 'string' || typeof value.accounting_status !== 'string' || value.platform_authenticated !== false) throw new Error('用户报告不能冒充平台认证');
    } else throw new Error('未知验证依据类型');
    return value as unknown as DirectVerification;
}
export const reuseLabels = {reusable: '受控表达式结构可复用', candidate: '结构检查有待补齐', unchecked: '尚未归集结构检查'};
export const verificationLevelLabels: Record<string, string> = {native_python_fixed_observation:'有原始Python函数固定观察',native_python_fixed_match:'本次原始Python输出一致',registered_criteria_met:'发布时曾满足本次登记标准及已知新数据条件',fixed_observation: '有登记后的固定验证观察', calculation: '有可复现计算记录', historical_experiment: '有历史实验', heldout_observation: '有留出观察', rolling_observation: '有滚动观察', sample_comparison: '有固定样本对照', user_reported_backtest: '用户回测报告', user_reported_paper: '用户模拟记录', user_reported_live: '用户实盘声明', user_reported_other: '用户补充资料'};
