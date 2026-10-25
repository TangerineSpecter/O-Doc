/** Non-executing artificial native-export fixture. It does not transpile or run source. */
import {HttpResponse} from 'msw';
import type {QuantStrategyArtifact} from '../../types/api/quantStrategyExport';
import {strategySnapshot} from '../../utils/quantStrategy';
import {newImplementation} from './runs';
import {collectMockFactors} from './factors';
import {persistQuantState, quantState} from './state';
const fail = (status: number, msg: string) => HttpResponse.json({code: status, msg, data: null}, {status});
export async function resolveStrategyExport(request: Request, collection: string, id?: string) {
    const record = quantState().experiments.find(row => row.collection === collection && row.data.id === id);
    if (!record) return fail(404, '实验不存在');
    const body = request.method === 'POST' ? await request.json() as {attemptId?: string} : undefined;
    const envelope = record.data.resultJson && JSON.parse(record.data.resultJson);
    const attemptId = body?.attemptId || new URL(request.url).searchParams.get('attemptId') || envelope?.output.selected_id;
    const attempt = envelope?.output.attempts.find((row: {id: string}) => row.id === attemptId);
    const policy = record.input.config.strategy;
    if (!policy || !attempt || attempt.status !== 'evaluated' || !['completed', 'partial'].includes(record.data.status)) return fail(400, '需要明确策略规则与已评价通过的公式，指标不能直接作为EA');
    const artifactId = `ea-local-${record.data.id.slice(-12)}-${attemptId}`;
    record.strategyArtifacts ||= [];
    const manifest = {version: 1, local_demo: true, exporter_version: 'artificial-local-native-export-not-a-transpiler', artifact_id: artifactId, artifact_kind: 'mt4_tester_strategy_candidate', verification: 'native_compile_run_and_equivalence_pending', code_sha256: '0'.repeat(64),
        context: {request_id: record.data.id, attempt_id: attemptId, fold: attempt.fold || null, config: {...JSON.parse(record.data.planJson!).config, strategy: strategySnapshot(policy)}, recipe: {parameters: attempt.requested_parameters || {}}},
        parameter_mapping: Object.fromEntries(Object.keys(attempt.requested_parameters || {}).map(name => [name, name])), native_inputs: {QExpectedSymbol: 'SYNTHETIC-UI', QExpectedPeriod: 1440, QMaxDeviationPoints: 0, QPositionFraction: policy.positionFraction}, reference_only_config: {fee_bps: record.input.config.feeBps, slippage_bps: record.input.config.slippageBps, short_borrow_bps_per_bar: policy.shortBorrowBpsPerBar},
        limitations: ['这是人工本地接口样例，不转换公式、不编译或运行平台代码。下载内容明确为不执行的样例。', '真实生成器使用实际公式与配置；原生手数、tick路径、点差、手续费与Swap须单独验证。'],
        required_validation: ['使用真实后端生成候选后，再在MetaEditor和MT4策略测试器验证；本地样例不能用于交易。'], feedback_adapter: 'standard-execution-json-v1', native_output: 'tester/files/odoc-<artifact>-<server-time>-<tick-count>.json'};
    const code = '// NON-EXECUTING ARTIFICIAL LOCAL UI FIXTURE. No strategy transpilation or native validation.\n#property strict\nint OnInit() { Print("Artificial O-Doc local fixture; no trading"); return INIT_FAILED; }\n';
    if (request.method === 'GET') return {filename: `strategy-${artifactId}.mq4`, code, manifestJson: JSON.stringify(manifest), artifacts: record.strategyArtifacts};
    if (request.method !== 'POST') return fail(405, '不支持此操作');
    const existing = record.strategyArtifacts.find(row => row.id === artifactId);
    if (existing) return existing;
    const factor = collectMockFactors(quantState().entries.filter(row => row.collId === collection && row.isValid)).find(row => row.id === record.input.seeds[0].candidateId);
    const entry = quantState().entries.find(row => row.id === factor?.entryId && row.isValid);
    if (!entry) return fail(400, '来源研究已不可用，不能新增归档');
    const implementation = newImplementation(entry, {name: `MQ4 EA候选 · ${record.data.name}`, language: 'mql4', languageVersion: '本地人工样例', dependencies: '不执行；真实生成需后端', parameters: JSON.stringify(manifest.native_inputs), code, note: '人工本地归档样例，未编译或运行。'});
    const version = implementation.versions[0]; version.strategyArtifactId = artifactId;
    const artifact: QuantStrategyArtifact = {id: artifactId, requestId: record.data.id, entryId: entry.id, implementationId: implementation.id, versionId: version.id, attemptId, createdAt: new Date().toISOString(), verification: 'native_compile_run_and_equivalence_pending', contentHash: 'local-demo-only'};
    record.strategyArtifacts.push(artifact); persistQuantState(); return artifact;
}
