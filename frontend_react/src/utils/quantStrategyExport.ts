import {readStrategy} from './quantStrategy';
import type {StrategyExportManifest} from '../types/api/quantStrategyExport';
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 30 && v.every(row => typeof row === 'string');
export function readStrategyExport(text: string): StrategyExportManifest {
    if (text.length > 600000) throw new Error('策略来源清单超过上限');
    const v: unknown = JSON.parse(text);
    if (!object(v) || v.version !== 1 || v.artifact_kind !== 'mt4_tester_strategy_candidate' || v.verification !== 'native_compile_run_and_equivalence_pending' || v.feedback_adapter !== 'standard-execution-json-v1' || typeof v.artifact_id !== 'string' || !v.artifact_id || typeof v.code_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(v.code_sha256) || typeof v.exporter_version !== 'string' || typeof v.native_output !== 'string') throw new Error('策略候选版本或验证状态无效');
    if (!object(v.context) || typeof v.context.request_id !== 'string' || typeof v.context.attempt_id !== 'string' || !object(v.context.config) || !object(v.context.recipe) || !object(v.context.recipe.parameters) || !object(v.parameter_mapping) || !Object.values(v.parameter_mapping).every(value => typeof value === 'string') || !object(v.native_inputs) || !object(v.reference_only_config) || !strings(v.limitations) || !strings(v.required_validation)) throw new Error('策略实际参数、配置或平台边界不完整');
    if (!Object.values(v.native_inputs).every(value => typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) || !Object.values(v.reference_only_config).every(value => typeof value === 'number' && Number.isFinite(value))) throw new Error('平台输入或成本字段无效');
    if (typeof v.context.config.threshold !== 'number' || !Number.isFinite(v.context.config.threshold) || !Object.values(v.context.recipe.parameters).every(value => typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) || v.context.fold !== null && (!Number.isInteger(v.context.fold) || Number(v.context.fold) < 1 || Number(v.context.fold) > 5)) throw new Error('实际信号、折号或阈值无效');
    readStrategy(v.context.config.strategy, v.context.config.threshold);
    if (typeof v.native_inputs.QExpectedSymbol !== 'string' || typeof v.native_inputs.QExpectedPeriod !== 'number' || !Number.isInteger(v.native_inputs.QExpectedPeriod) || typeof v.native_inputs.QMaxDeviationPoints !== 'number' || !Number.isInteger(v.native_inputs.QMaxDeviationPoints)) throw new Error('MT4映射与最大偏离点数无效');
    return v as unknown as StrategyExportManifest;
}
