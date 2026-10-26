import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mockFactors} from '../../../mocks/quant/factors.ts';
import {buildSeed, initialSeed, numericValue} from './plan.ts';
import {readExperiment} from './readout.ts';
import {demoExperimentResult} from '../../../mocks/quant/experimentResult.ts';
import {checkParameterDomains} from '../../../utils/quantParameterDomain.ts';
import type {QuantFactorCandidate} from '../../../types/api/quant.ts';
import type {QuantExperimentInput, QuantExperiment} from '../../../types/api/quantExperiment.ts';
import type {QuantParameterPredicate, QuantParameterOperand} from '../../../types/api/quantParameters.ts';
const candidate = {id: 'fixture', curation: {name: '动量'}, data: mockFactors({payload: {code: 'fixture'}} as Parameters<typeof mockFactors>[0])[0]} as QuantFactorCandidate;

async function temporalParameterFixture() {
    const {demoTemporalResult} = await import('../../../mocks/quant/temporalResult.ts');
    const {mockTemporalSensitivity} = await import('../../../mocks/quant/temporalSensitivity.ts');
    const input: QuantExperimentInput = {requestKey:'all_inner_fixture_01',name:'跨窗口参数',datasetId:'fixture',seeds:[buildSeed(candidate,initialSeed(candidate),true)],
        config:{seed:42,maxCandidates:16,generations:2,threshold:0,feeBps:5,slippageBps:5,gap:1,seconds:30,walkForward:{version:2,mode:'expanding',folds:3,innerFolds:3,trainBars:40,validationBars:10,testBars:10,warmupBars:0}}};
    const demo=demoTemporalResult(input,'2024-01-01T00:00:00Z','2024-06-28T00:00:00Z',180,[]);
    const record={collection:'fixture',input,data:{name:input.name,attemptsJson:JSON.stringify(demo.attempts)}} as import('../../../mocks/quant/experiments.ts').MockExperiment;
    return JSON.parse(mockTemporalSensitivity(record)) as import('../../../types/api/quantTemporalSensitivity.ts').QuantTemporalSensitivity;
}

test('全部计划内层证据读取保留缺测失败，不能把最后一窗冒充共同支持',async()=>{
    const {readTemporalSensitivity}=await import('../../../utils/quantTemporalSensitivity.ts');
    const value=await temporalParameterFixture();
    assert.equal(readTemporalSensitivity(JSON.stringify(value))!.planned_windows,9);
    assert.equal(value.families[0].axes[0].windows.length,9);
    assert.equal(readTemporalSensitivity('null'),undefined);assert.equal(readTemporalSensitivity(),undefined);
    for(const corruption of ['count','missing','duplicate','baseline','region','interpolation']) {
        const bad=structuredClone(value),axis=bad.families[0].axes[0];
        if(corruption==='count')bad.planned_windows=8;
        if(corruption==='missing')axis.windows.pop();
        if(corruption==='duplicate')axis.windows[1].inner_fold=1;
        if(corruption==='baseline')axis.windows[0].baseline_attempt_id='unrelated-attempt';
        if(corruption==='region'||corruption==='interpolation') {axis.status='sampled_region';bad.status='sampled_region';axis.regions=[{[axis.parameter]:corruption==='interpolation'?[1,2,3]:axis.windows[0].points.map(point=>point.value as number)}];}
        assert.throws(()=>readTemporalSensitivity(JSON.stringify(bad)),corruption);
    }
});

test('共同离散区段要求逐窗全部支持，零收益和真实缺失分开读取',async()=>{
    const {readTemporalSensitivity}=await import('../../../utils/quantTemporalSensitivity.ts');
    const value=await temporalParameterFixture(),axis=value.families[0].axes[0];
    const region={[axis.parameter]:axis.windows[0].points.map(point=>point.value as number)};
    value.status='sampled_region';axis.status='sampled_region';axis.regions=[region];axis.comparison_regions=[region];
    for(const window of axis.windows) {
        window.baseline_attempt_id=`attempt-${window.outer_fold}-base`;window.supported_values=[region];
        window.points.forEach((point,index)=>Object.assign(point,{attempt_id:`attempt-${window.outer_fold}-${index}`,status:'evaluated',comparable:true,eligible:true,eligibility_reasons:[],metrics:{train:{total_return:.1,max_drawdown:.01},validation:{total_return:.1,max_drawdown:.01}}}));
        window.baseline_attempt_id=window.points.find(point=>point.value===axis.baseline_value)!.attempt_id;
    }
    assert.equal(readTemporalSensitivity(JSON.stringify(value))!.status,'sampled_region');
    const first=axis.windows[0].points[0];first.metrics.validation!.total_return=0;
    assert.throws(()=>readTemporalSensitivity(JSON.stringify(value)));
    first.eligible=false;first.eligibility_reasons=['验证段收益不为正'];axis.regions=[];axis.status='no_supported_region';value.status='no_supported_region';
    assert.equal(readTemporalSensitivity(JSON.stringify(value))!.families[0].axes[0].windows[0].points[0].metrics.validation!.total_return,0);
    first.metrics.validation=null;first.comparable=false;axis.comparison_regions=[];axis.status='insufficient_comparison';value.status='insufficient_comparison';
    assert.equal(readTemporalSensitivity(JSON.stringify(value))!.families[0].axes[0].windows[0].points[0].metrics.validation,null);
});

test('v4 条件算术按十进制有理数比较，覆盖符号、除法与数值/精度边界', async () => {
    const {evaluateParameterCondition, validateParameterCondition, describeParameterCondition} = await import('../../../utils/quantParameterConditions.ts');
    const binary = (operator: 'add' | 'sub' | 'mul' | 'div', left: QuantParameterOperand, right: QuantParameterOperand): QuantParameterOperand => ({operator, left, right});
    const equality = (left: QuantParameterOperand, value: number): QuantParameterPredicate => ({operator: 'eq', left, right: {value}});
    const value = (value: number): QuantParameterOperand => ({value});
    const parameter: QuantParameterOperand = {parameter: 'x'};
    assert.equal(evaluateParameterCondition(equality(binary('add', parameter, value(.2)), .3), {x: .1}, 4), true);
    assert.equal(evaluateParameterCondition(equality(binary('mul', binary('div', parameter, value(3)), value(3)), .1), {x: .1}, 4), true);
    assert.equal(evaluateParameterCondition(equality({operator: 'neg', argument: binary('sub', parameter, value(.2))}, .1), {x: .1}, 4), true);
    assert.equal(evaluateParameterCondition({operator: 'gt', left: binary('div', parameter, value(3)), right: value(.3333333333333333)}, {x: 1}, 4), true);
    assert.match(describeParameterCondition(equality(binary('div', {operator: 'neg', argument: parameter}, value(3)), -.1)), /−\(x\).*÷ 3/);
    assert.equal(evaluateParameterCondition(equality(parameter, Number.MAX_SAFE_INTEGER), {x: Number.MAX_SAFE_INTEGER}, 4), true);
    assert.equal(evaluateParameterCondition(equality(parameter, -Number.MAX_SAFE_INTEGER), {x: -Number.MAX_SAFE_INTEGER}, 4), true);
    for (const bad of [Number.MAX_SAFE_INTEGER + 1, -(Number.MAX_SAFE_INTEGER + 1), Infinity, NaN]) assert.throws(() => evaluateParameterCondition(equality(parameter, 0), {x: bad}, 4), /有限数值|类型无效/);
    assert.throws(() => evaluateParameterCondition(equality(binary('div', parameter, value(0)), 0), {x: .1}, 4), /除以零/);
    assert.throws(() => evaluateParameterCondition(equality(binary('mul', binary('div', parameter, value(1e-300)), value(1e15)), 0), {x: 1}, 4), /数值或精度预算/);
    let tiny: QuantParameterOperand = parameter;
    for (let index = 0; index < 3; index++) tiny = binary('mul', tiny, parameter);
    assert.throws(() => evaluateParameterCondition(equality(tiny, 0), {x: 5e-324}, 4), /数值或精度预算/);
    for (const scalar of [true, '0.1']) assert.throws(() => evaluateParameterCondition(equality(binary('add', parameter, value(.2)), .3), {x: scalar}, 4), /不可参与/);
    for (const version of [1, 2, 3]) assert.throws(() => validateParameterCondition(equality(binary('add', parameter, value(.2)), .3), version), /v4/);
    assert.equal(evaluateParameterCondition(equality(parameter, .3), {x: .1 + .2}, 3), false);
});

test('v4 参数依赖在 inactive require 仍校验，跳过算术求值且递归重命名保留全部引用', async () => {
    const {conditionReferences, renameParameterCondition, evaluateParameterCondition, describeParameterCondition, validateParameterCondition} = await import('../../../utils/quantParameterConditions.ts');
    const code = '// LOCAL_ARITHMETIC_PARAMETERS\n// enabled=true -> lookback*2+slow <= 80';
    const arithmetic = {...candidate, data: mockFactors({payload: {code}} as Parameters<typeof mockFactors>[0])[0]};
    const parameters = arithmetic.data.parameters;
    assert.deepEqual(parameters.map(row => row.name), ['lookback', 'slow', 'enabled']);
    assert.equal(parameters[0].domain?.version, 4);
    assert.equal(parameters[0].domain?.evidence[0].quote, code);
    const defaults = {lookback: 20, slow: 30, enabled: true};
    checkParameterDomains(parameters, defaults);
    checkParameterDomains(parameters, {...defaults, lookback: 25});
    assert.throws(() => checkParameterDomains(parameters, {...defaults, lookback: 30}), /条件约束/);
    checkParameterDomains(parameters, {...defaults, lookback: 30, enabled: false});
    const unknownDeclaration = structuredClone(parameters);
    unknownDeclaration.find(row => row.name === 'slow')!.type = 'period_custom';
    assert.throws(() => checkParameterDomains(unknownDeclaration, defaults), /已识别声明类型/);
    assert.throws(() => checkParameterDomains(unknownDeclaration, {...defaults, enabled: false}), /已识别声明类型/);
    const unknownBoolean = structuredClone(parameters);
    unknownBoolean.find(row => row.name === 'enabled')!.type = 'opaque_flag';
    assert.throws(() => checkParameterDomains(unknownBoolean, defaults), /已识别声明类型/);
    const legacyUnknown = structuredClone(unknownDeclaration);
    legacyUnknown[0].domain = {...legacyUnknown[0].domain!, version: 3, conditions: [{when: {operator: 'eq', left: {parameter: 'enabled'}, right: {value: true}}, require: {operator: 'lt', left: {parameter: 'lookback'}, right: {parameter: 'slow'}}}]};
    checkParameterDomains(legacyUnknown, defaults);
    const require = parameters[0].domain!.conditions![0].require;
    assert.deepEqual(conditionReferences(require).sort(), ['lookback', 'slow']);
    const renamed = renameParameterCondition(require, {lookback: 'a_p0', slow: 'a_p1', enabled: 'a_p2'});
    assert.deepEqual(conditionReferences(renamed).sort(), ['a_p0', 'a_p1']);
    assert.match(describeParameterCondition(renamed), /a_p0 × 2.*a_p1/);
    assert.equal(evaluateParameterCondition(renamed, {a_p0: 25, a_p1: 30}, 4), true);
    assert.deepEqual(conditionReferences(require).sort(), ['lookback', 'slow']);
    const inactive = structuredClone(parameters);
    inactive[0].domain!.conditions![0].require = {operator: 'lt', left: {operator: 'div', left: {parameter: 'slow'}, right: {value: 0}}, right: {value: 80}};
    checkParameterDomains(inactive, {...defaults, enabled: false});
    assert.throws(() => checkParameterDomains(inactive, {...defaults, enabled: false, slow: Number.MAX_SAFE_INTEGER + 1}), /9007199254740991/);
    assert.throws(() => checkParameterDomains(inactive, defaults), /除以零/);
    const deep = (depth: number): QuantParameterPredicate => depth === 1 ? {operator: 'eq', left: {parameter: 'enabled'}, right: {value: true}} : {operator: 'not', argument: deep(depth - 1)};
    validateParameterCondition(deep(7), 4); // comparison depth 7, operands depth 8
    assert.throws(() => validateParameterCondition(deep(8), 4), /8 层/);
    validateParameterCondition(deep(6), 3);
    assert.throws(() => validateParameterCondition(deep(7), 3), /6 层/);
    const many: QuantParameterPredicate = {operator: 'all', arguments: Array.from({length: 8}, () => ({operator: 'all', arguments: Array.from({length: 3}, () => deep(1))}))};
    assert.throws(() => validateParameterCondition(many, 4), /64 节点/);
    const exact64: QuantParameterPredicate = {operator: 'all', arguments: [8, 8, 4].map(length => ({operator: 'all', arguments: Array.from({length}, () => deep(1))}))};
    validateParameterCondition(exact64, 4);
    assert.throws(() => validateParameterCondition({operator: 'not', argument: exact64}, 4), /64 节点/);
    assert.deepEqual(buildSeed(arithmetic, initialSeed(arithmetic), true).variants.map(group => group.find(row => row.name === 'lookback')!.value), [15, 25]);
    const stringRow = {name: 'mode', type: 'string', defaultValue: '"trend"', category: 'signal', meaning: '模式', constraints: '', effect: '', suggestion: '', evidence: '',
        domain: {version: 4 as const, minimum: null, maximum: null, step: null, stepOrigin: null, choices: ['trend', 'reverse'], relations: [], conditions: [], evidence: [{field: 'code' as const, quote: 'mode'}]}};
    checkParameterDomains([stringRow], {mode: 'trend'});
    assert.throws(() => checkParameterDomains([stringRow], {mode: 'invalid'}), /枚举/);
});
test('声明参数约束校验范围、精确步长、布尔与关联关系，旧候选保持可用', () => {
    const constrained = {...candidate, data: mockFactors({payload: {code: '// LOCAL_PARAMETER_DOMAIN'}} as Parameters<typeof mockFactors>[0])[0]};
    const draft = initialSeed(constrained);
    buildSeed(constrained, draft, true);
    for (const value of ['31', '4', '21', 'true', '20.5']) {
        assert.throws(() => buildSeed(constrained, {...draft, parameters: {lookback: value}}, true), /参数/);
    }
    const row = {...constrained.data.parameters[0], type: 'float', domain: {...constrained.data.parameters[0].domain!, minimum: 0, maximum: 1, step: .1} as import('../../../types/api/quantParameters').QuantParameterDomain};
    checkParameterDomains([row], {lookback: .3});
    assert.throws(() => checkParameterDomains([row], {lookback: .31}), /步长/);
    row.domain.minimum = null; row.domain.maximum = null; row.domain.step = 1e-308;
    checkParameterDomains([row], {lookback: 1e308});
    row.domain.relations = [{operator: 'lt', parameter: 'slow'}];
    const other = {...constrained.data.parameters[0], name: 'slow'};
    assert.throws(() => checkParameterDomains([row, other], {lookback: 20, slow: 15}), /关系/);
    checkParameterDomains([row, other], {lookback: 10, slow: 20});
    const boolean = {...row, type: 'bool', domain: {...row.domain, step: null, stepOrigin: null, relations: [], choices: [true]}};
    checkParameterDomains([boolean], {lookback: true});
    assert.throws(() => checkParameterDomains([boolean], {lookback: 1}), /类型/);
    assert.throws(() => checkParameterDomains([boolean], {lookback: false}), /枚举/);
});
test('准备方案只绑定明确列和数值默认值，邻域只改变实际信号窗口', () => {
    const draft = initialSeed(candidate), value = buildSeed(candidate, draft, true);
    assert.deepEqual(value.bindings, [{name: 'close', column: 'close'}]);
    assert.deepEqual(value.parameters, [{name: 'lookback', value: 20}]);
    assert.deepEqual(value.variants, [[{name: 'lookback', value: 15}], [{name: 'lookback', value: 25}]]);
    const altered = structuredClone(candidate);
    altered.data.parameters[0].category = 'display';
    assert.equal(buildSeed(altered, initialSeed(altered), true).variants.length, 0);
    altered.data.inputs[0].name = 'undocumentedInput';
    assert.throws(() => buildSeed(altered, initialSeed(altered), true), /指定/);
    assert.equal(numericValue(''), undefined); assert.equal(numericValue('20 days'), undefined);
    assert.equal(numericValue('Infinity'), undefined); assert.equal(numericValue('false'), false);
    assert.equal(numericValue('0'), 0); assert.equal(numericValue('"20"'), undefined);
    const changed = initialSeed(candidate); changed.parameters.lookback = 'invalid';
    assert.throws(() => buildSeed(candidate, changed, true), /补充/);
});

test('公式交叉升级配置并保留两个父代片段路径，旧合同不接受新算子', async () => {
    const {buildEvolution, evolutionDraft, defaultEvolution, readEvolution, evolutionSnapshot, readTransformation, transformationSnapshot, transformationLabel} = await import('../../../utils/quantEvolution.ts');
    const policy = buildEvolution({...evolutionDraft(defaultEvolution), operators: ['crossover']})!;
    assert.equal(policy.version, 3);
    assert.deepEqual(readEvolution(evolutionSnapshot(policy)), policy);
    for (const version of [1, 2]) assert.throws(() => readEvolution({...evolutionSnapshot(policy), version}));
    const raw = {version: 3, operator: 'crossover', window: null, weight: null, recipient_path: [0, 1], donor_path: []};
    const value = readTransformation(raw, policy);
    assert.deepEqual(value.recipientPath, [0, 1]);
    assert.deepEqual(value.donorPath, []);
    assert.deepEqual(transformationSnapshot(value), raw);
    assert.match(transformationLabel(value), /父代一 第 1 项 → 第 2 项 ← 父代二 整式/);
    for (const path of [[], [true], [-1], [2], new Array(13).fill(0), '0']) assert.throws(() => readTransformation({...raw, recipient_path: path}, policy));
    assert.throws(() => readTransformation({...raw, window: 3}, policy));
});
test('实验解码保留大小写、缺失指标、失败尝试和模拟标记，拒绝未知结构', () => {
    const input: QuantExperimentInput = {requestKey: 'fixture_request_01', name: 'fixture', datasetId: 'fixture-data', seeds: [buildSeed(candidate, initialSeed(candidate), true)],
        config: {seed: 42, maxCandidates: 16, generations: 3, threshold: 0, feeBps: 5, slippageBps: 5, gap: 1, seconds: 30}};
    const demo = demoExperimentResult(input, '2024-01-01T00:00:00Z', '2024-04-01T00:00:00Z');
    const row: QuantExperiment = {id: 'experiment-fixture', datasetId: input.datasetId, name: input.name, createdAt: '2024-01-01T00:00:00Z', status: 'completed', cancelRequested: false, error: '', attemptCount: demo.attempts.length, contentHash: 'fixture',
        planJson: JSON.stringify({version: 1, engine_version: 'quant-local-search-1', name: 'fixture', seeds: [{id: 'fixture', candidate: {name: '动量'}, parameters: {LookBack_N: 20}}], config: {threshold: 0, fee_bps: 5}}), attemptsJson: JSON.stringify(demo.attempts), resultJson: JSON.stringify(demo.envelope)};
    const view = readExperiment(row);
    assert.equal(view.demo, true); assert.equal(view.seeds[0].parameters[0][0], 'LookBack_N');
    assert.equal(view.attempts[1].status, 'rejected'); assert.equal(view.attempts[1].train, undefined);
    assert.equal(view.final?.curve.length, 6); assert.equal(view.selectedId, 'attempt-1');
    assert.equal(readExperiment({...row, resultJson: null}).final, undefined);
    assert.throws(() => readExperiment({...row, planJson: '{"version":99}'}));
    assert.throws(() => readExperiment({...row, attemptsJson: '[{"id":"bad"}]'}));
});

test('AI 方案解码保留字面参数名和原始参数组，拒绝未知版本', async () => {
    const {readProposal} = await import('./proposal.ts');
    const data = {version: 1, status: 'unverified_requires_fresh_validation', name: '复核', hypothesis: '窗口稳定', falsification: '方向不一致', data_requirement: '新数据', evidence_refs: ['execution'],
        config: {seed: 42, max_candidates: 16, generations: 3, threshold: 0, fee_bps: 5, slippage_bps: 5, gap: 1, seconds: 30},
        seeds: [{id: 'fixture', bindings: {Close_Input: 'close'}, parameters: {LookBack_N: 20, Enabled: true}, variants: [{LookBack_N: 15, Enabled: true}]}]};
    const proposal = {id: 'proposal-fixture', contentHash: 'fixture', createdAt: '', dataJson: JSON.stringify(data), candidates: [candidate]};
    const parsed = readProposal(proposal);
    assert.deepEqual(parsed.drafts.fixture.parameters, {LookBack_N: '20', Enabled: 'true'});
    assert.deepEqual(parsed.seeds[0].variants, [[{name: 'LookBack_N', value: 15}, {name: 'Enabled', value: true}]]);
    assert.equal(parsed.config.feeBps, 5);
    assert.throws(() => readProposal({...proposal, dataJson: JSON.stringify({...data, version: 99})}));
    assert.throws(() => readProposal({...proposal, dataJson: JSON.stringify({...data, seeds: []})}));
});


test('参数敏感度保留大小写、失败与未执行值，拒绝未知版本和损坏指标', async () => {
    const {mockSensitivity} = await import('../../../mocks/quant/sensitivity.ts');
    const {readSensitivity} = await import('../../../utils/quantSensitivity.ts');
    const input: QuantExperimentInput = {requestKey: 'sensitivity_mock_001', name: '参数比较', datasetId: 'dataset', seeds: [{candidateId: 'candidate', bindings: [], parameters: [{name: 'Window_N', value: 20}], variants: [[{name: 'Window_N', value: 15}], [{name: 'Window_N', value: 25}]]}], config: {seed: 1, maxCandidates: 8, generations: 1, threshold: 0, feeBps: 5, slippageBps: 5, gap: 1, seconds: 30}};
    const demo = demoExperimentResult(input, '2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z');
    const json = mockSensitivity({collection: 'test', input, data: {id: 'experiment', name: '参数比较', attemptsJson: JSON.stringify(demo.attempts)} as QuantExperiment});
    const parsed = readSensitivity(json)!;
    const axis = parsed.families[0].axes[0];
    assert.equal(axis.parameter, 'Window_N');
    assert.deepEqual(axis.points.map(row => row.value), [0, 15, 20, 25]);
    assert.deepEqual(axis.points.map(row => row.status), ['rejected', 'evaluated', 'evaluated', 'not_run']);
    assert.equal(axis.compared_points, 2);
    assert.equal(axis.regions.length, 0);
    assert.equal(readSensitivity(), undefined);
    assert.throws(() => readSensitivity(JSON.stringify({...parsed, version: 2})), /结构/);
    const broken = structuredClone(parsed);
    broken.families[0].axes[0].points[1].metrics.validation!.total_return = 'fake' as unknown as number;
    assert.throws(() => readSensitivity(JSON.stringify(broken)), /结构/);
});

test('演化方案保留冻结算子，读取新引擎变换且拒绝版本和窗口错配', async () => {
    const {defaultEvolution, evolutionSnapshot, evolutionDraft, buildEvolution, readEvolution} = await import('../../../utils/quantEvolution.ts');
    const {readProposal} = await import('./proposal.ts');
    const policy = {...defaultEvolution, operators: ['lag'] as typeof defaultEvolution.operators};
    assert.deepEqual(buildEvolution(evolutionDraft(policy)), policy);
    assert.equal(buildEvolution(evolutionDraft(policy, false)), undefined);
    for (const fields of [{windows: [true]}, {weights: [0]}, {max_nodes: 129}, {operators: ['constructor']}]) assert.throws(() => readEvolution({...evolutionSnapshot(policy), ...fields}));
    const config = {seed: 42, max_candidates: 16, generations: 3, threshold: 0, fee_bps: 5, slippage_bps: 5, gap: 1, seconds: 30, evolution: evolutionSnapshot(policy)};
    const seeds = [{id: 'fixture', candidate: candidate.data, bindings: {close: 'close'}, parameters: {lookback: 20}, variants: []}];
    const data = {version: 1, status: 'unverified_requires_fresh_validation', name: '新公式', hypothesis: '滞后信号', falsification: '无增益', data_requirement: '新行情', evidence_refs: ['execution'], config, seeds};
    const parsed = readProposal({id: 'proposal', dataJson: JSON.stringify(data), contentHash: 'test', createdAt: '', candidates: [candidate]});
    assert.deepEqual(parsed.config.evolution, policy);
    const input: QuantExperimentInput = {requestKey: 'formula_test_key_001', name: data.name, datasetId: 'dataset', config: parsed.config, seeds: parsed.seeds};
    const result = demoExperimentResult(input, '2024-01-01T00:00:00Z', '2024-04-01T00:00:00Z', 'quant-local-search-3', seeds);
    const row: QuantExperiment = {id: 'new', name: data.name, datasetId: 'dataset', createdAt: '', status: 'completed', cancelRequested: false, error: '', contentHash: 'test', attemptCount: result.attempts.length,
        planJson: JSON.stringify({version: 1, engine_version: 'quant-local-search-3', name: data.name, seeds, config}), attemptsJson: JSON.stringify(result.attempts), resultJson: JSON.stringify(result.envelope)};
    const view = readExperiment(row);
    assert.deepEqual(view.evolution, policy);
    assert.equal(view.attempts[1].transformation?.operator, 'lag');
    assert.equal(JSON.parse(view.attempts[1].expression).args[1].value, 3);
    assert.ok(!view.config.some(([key]) => key === 'evolution'));
    const altered = structuredClone(result.attempts); altered[1].transformation!.window = 999;
    assert.throws(() => readExperiment({...row, attemptsJson: JSON.stringify(altered)}), /窗口/);
    assert.throws(() => readExperiment({...row, planJson: row.planJson!.replace('quant-local-search-3', 'quant-local-search-2')}), /版本/);
});

test('滚动窗口、总预算与逐折展示保持冻结策略，拒绝损坏折号', async () => {
    const {defaultWalkForward, buildTemporal, temporalDraft, temporalSnapshot, temporalWindows, validateTemporalBudget, readTemporal} = await import('../../../utils/quantTemporal.ts');
    const {demoTemporalResult} = await import('../../../mocks/quant/temporalResult.ts');
    assert.deepEqual(readTemporal(temporalSnapshot(defaultWalkForward)), defaultWalkForward);
    assert.equal(buildTemporal(temporalDraft()), undefined);
    assert.deepEqual(buildTemporal(temporalDraft(defaultWalkForward)), defaultWalkForward);
    assert.throws(() => buildTemporal({...temporalDraft(defaultWalkForward), warmupBars: ''}));
    assert.throws(() => readTemporal({...temporalSnapshot(defaultWalkForward), folds: true}));
    assert.throws(() => temporalWindows(85, defaultWalkForward, 1), /86/);
    for (const mode of ['rolling', 'expanding'] as const) {
        const windows = temporalWindows(180, {...defaultWalkForward, mode}, 1);
        assert.equal(windows[2].partitions.holdout[1], 179);
        assert.equal(windows[1].partitions.holdout[0], windows[0].partitions.holdout[1]);
        assert.equal(windows[2].partitions.train[1]-windows[2].partitions.train[0], mode === 'rolling' ? 40 : 60);
    }
    const input: QuantExperimentInput = {requestKey: 'temporal_fixture_001', name: '逐折复核', datasetId: 'fixture-data', seeds: [buildSeed(candidate, initialSeed(candidate), true)],
        config: {seed: 42, maxCandidates: 16, generations: 3, threshold: 0, feeBps: 5, slippageBps: 5, gap: 1, seconds: 30, walkForward: defaultWalkForward}};
    validateTemporalBudget(defaultWalkForward, input.seeds, input.config);
    assert.throws(() => validateTemporalBudget(defaultWalkForward, input.seeds, {...input.config, maxCandidates: 8}), /预算/);
    const demo = demoTemporalResult(input, '2024-01-01T00:00:00Z', '2024-06-28T00:00:00Z', 180, []);
    const experiment = {id: 'temporal', name: input.name, planJson: JSON.stringify({version: 1, engine_version: 'quant-local-search-4', name: input.name, seeds: [], config: {threshold: 0, walk_forward: temporalSnapshot(defaultWalkForward)}}),
        attemptsJson: JSON.stringify(demo.attempts), resultJson: JSON.stringify(demo.envelope)} as QuantExperiment;
    const value = readExperiment(experiment);
    assert.equal(value.temporal!.tested, 3);
    assert.equal(value.temporal!.folds[2].selectedId, value.selectedId);
    assert.equal(value.attempts.find(row => row.id === value.selectedId)!.fold, 3);
    assert.deepEqual(value.config, [['threshold', '0']]);
    demo.attempts[0].fold = 0;
    assert.throws(() => readExperiment({...experiment, attemptsJson: JSON.stringify(demo.attempts)}), /折号/);
});

test('多内层时序验证保留各窗口、均值与失败，拒绝错配或篡改汇总', async () => {
    const {defaultWalkForward, buildTemporal, temporalDraft, temporalSnapshot, temporalWindows, readTemporal} = await import('../../../utils/quantTemporal.ts');
    const {demoTemporalResult} = await import('../../../mocks/quant/temporalResult.ts');
    const policy = {...defaultWalkForward, version: 2 as const, innerFolds: 3};
    assert.deepEqual(readTemporal(temporalSnapshot(policy)), policy);
    assert.deepEqual(buildTemporal(temporalDraft(policy)), policy);
    for (const inner_folds of [1, 5, true, 2.5, null]) assert.throws(() => readTemporal({...temporalSnapshot(policy), inner_folds}));
    assert.throws(() => temporalWindows(105, policy, 1), /106/);
    for (const mode of ['rolling', 'expanding'] as const) {
        const folds = temporalWindows(180, {...policy, mode}, 1);
        assert.equal(folds[2].partitions.holdout[1], 179);
        for (const fold of folds) {
            assert.equal(fold.inner_windows!.length, 3);
            assert.deepEqual(fold.partitions.validation, fold.inner_windows![2].partitions.validation);
            assert.equal(fold.inner_windows![0].partitions.validation[1], fold.inner_windows![1].partitions.validation[0]);
        }
    }
    const input: QuantExperimentInput = {requestKey: 'nested_fixture_001', name: '嵌套验证', datasetId: 'fixture-data', seeds: [buildSeed(candidate, initialSeed(candidate), true)],
        config: {seed: 42, maxCandidates: 16, generations: 3, threshold: 0, feeBps: 5, slippageBps: 5, gap: 1, seconds: 30, walkForward: policy}};
    const demo = demoTemporalResult(input, '2024-01-01T00:00:00Z', '2024-06-28T00:00:00Z', 180, []);
    const row = {planJson: JSON.stringify({version: 1, engine_version: 'quant-local-search-7', name: input.name, seeds: [], config: {threshold: 0, walk_forward: temporalSnapshot(policy)}}), attemptsJson: JSON.stringify(demo.attempts), resultJson: JSON.stringify(demo.envelope)} as QuantExperiment;
    const view = readExperiment(row);
    assert.equal(view.attempts[0].inner!.folds.length, 3);
    assert.equal(view.attempts[0].inner!.summary!.validation.totalReturn, demo.attempts[0].inner_evaluation!.summary!.validation.total_return);
    assert.equal(view.attempts[1].inner!.summary, undefined);
    assert.equal(view.attempts[1].status, 'rejected');
    assert.equal(readExperiment({...row, resultJson: null}).temporal, undefined);
    for (const corruption of ['summary', 'fold', 'missing', 'engine']) {
        const bad = structuredClone(demo.attempts);
        if (corruption === 'summary') bad[0].inner_evaluation!.summary!.validation.total_return += .1;
        if (corruption === 'fold') bad[0].inner_evaluation!.folds[1].number = 3;
        if (corruption === 'missing') delete bad[0].inner_evaluation;
        assert.throws(() => readExperiment({...row, attemptsJson: JSON.stringify(bad), planJson: corruption === 'engine' ? row.planJson!.replace('search-7', 'search-4') : row.planJson}));
    }
});


test('条件参数按实际开关检查、保留依赖并显示完整条件', async () => {
    const {describeParameterDomain} = await import('../../../utils/quantParameterDomain.ts');
    const {renameParameterCondition, evaluateParameterCondition} = await import('../../../utils/quantParameterConditions.ts');
    const data = mockFactors({payload: {code: '// LOCAL_PARAMETER_CONDITION'}} as Parameters<typeof mockFactors>[0])[0];
    const constrained = {...candidate, data};
    const draft = initialSeed(constrained);
    buildSeed(constrained, draft, true);
    assert.throws(() => buildSeed(constrained, {...draft, parameters: {...draft.parameters, lookback: '35'}}, false), /条件约束/);
    buildSeed(constrained, {...draft, parameters: {...draft.parameters, lookback: '35', enabled: 'false'}}, false);
    assert.throws(() => checkParameterDomains(data.parameters, {lookback: 35, enabled: false}), /依赖参数/);
    assert.throws(() => checkParameterDomains(data.parameters, {lookback: 35, enabled: false, slow: true}), /类型/);
    assert.match(describeParameterDomain('lookback', data.parameters[0].domain!), /当 enabled = true 时，要求 lookback < slow/);
    const predicate: import('../../../types/api/quantParameters.ts').QuantParameterPredicate = {operator: 'all', arguments: [
        {operator: 'eq', left: {parameter: 'enabled'}, right: {value: true}},
        {operator: 'not', argument: {operator: 'any', arguments: [
            {operator: 'lt', left: {parameter: 'lookback'}, right: {parameter: 'slow'}},
            {operator: 'eq', left: {parameter: 'lookback'}, right: {value: 30}},
        ]}},
    ]};
    for (const enabled of [false, true]) for (const lookback of [10, 30, 40]) {
        assert.equal(evaluateParameterCondition(predicate, {enabled, lookback, slow: 20}), enabled && !(lookback < 20 || lookback === 30));
    }
    const renamed = renameParameterCondition(predicate, {enabled: 'a_p0', lookback: 'a_p1', slow: 'a_p2'});
    assert.equal(evaluateParameterCondition(renamed, {a_p0: true, a_p1: 40, a_p2: 20}), true);
    assert.equal(JSON.stringify(renamed).includes('lookback'), false);
});

test('排序与门控采用 v2，旧策略保持 v1，拒绝类型和冻结窗口不符', async () => {
    const {defaultEvolution, readEvolution, evolutionSnapshot, evolutionDraft, buildEvolution, readTransformation} = await import('../../../utils/quantEvolution.ts');
    const {mockFormulaEvolution} = await import('../../../mocks/quant/formulaEvolution.ts');
    const legacy = {...defaultEvolution, version: 1 as const, operators: ['lag' as const]};
    assert.deepEqual(buildEvolution(evolutionDraft(legacy)), legacy);
    assert.equal(buildEvolution({...evolutionDraft(legacy), operators: ['ts_rank']})!.version, 2);
    assert.throws(() => readEvolution({...evolutionSnapshot(legacy), operators: ['gate']}));
    assert.throws(() => readTransformation({version: 1, operator: 'gate', window: null, weight: null}, defaultEvolution));
    assert.throws(() => readTransformation({version: 2, operator: 'ts_rank', window: 2000, weight: null}, defaultEvolution));
    const input: QuantExperimentInput = {requestKey: 'new_operator_fixture', name: '新算子', datasetId: 'fixture',
        seeds: [buildSeed(candidate, initialSeed(candidate), false)], config: {seed: 42, maxCandidates: 8, generations: 2, threshold: 0, feeBps: 5, slippageBps: 5, gap: 1, seconds: 30, evolution: {...defaultEvolution, operators: ['ts_rank']}}};
    const source = {candidate: candidate.data, bindings: {close: 'close'}, parameters: {lookback: 20}};
    const rank = mockFormulaEvolution(input, [source])!;
    assert.equal(rank.reason, ''); assert.equal(rank.recipe.expression.op, 'ts_rank');
    assert.equal(rank.recipe.units, 'dimensionless');
    input.config.evolution!.operators = ['gate'];
    assert.match(mockFormulaEvolution(input, [source, source])!.reason, /布尔/);
    const filter = {...source, candidate: {...candidate.data, outputType: 'boolean_series' as const, units: 'boolean',
        expression: {op: 'gt', args: [candidate.data.expression!, {op: 'constant', value: 0}]}}};
    const gate = mockFormulaEvolution(input, [source, filter])!;
    assert.equal(gate.reason, ''); assert.equal(gate.recipe.expression.op, 'gate');
    assert.deepEqual(Object.keys(gate.recipe.parameters), ['a_lookback', 'b_lookback']);
    assert.equal(gate.recipe.output_type, 'numeric_series');
    assert.equal(gate.recipe.units, candidate.data.units);
    assert.match(mockFormulaEvolution(input, [source])!.reason, /两个/);
});


test('字符串枚举保留 JSON 类型与大小写，模式值进入方案而不生成数值邻域', () => {
    const item = {...candidate, data: mockFactors({payload: {code: '// LOCAL_STRING_PARAMETER'}} as Parameters<typeof mockFactors>[0])[0]};
    const draft = initialSeed(item), seed = buildSeed(item, draft, true);
    assert.equal(seed.parameters.find(row => row.name === 'mode')?.value, 'trend');
    assert.ok(seed.variants.every(rows => rows.find(row => row.name === 'mode')?.value === 'trend'));
    const changed = buildSeed(item, {...draft, parameters: {...draft.parameters, mode: '"reverse"'}}, false);
    assert.equal(changed.parameters.find(row => row.name === 'mode')?.value, 'reverse');
    for (const mode of ['reverse', '"TREND"', '"unknown"', '1', 'true']) assert.throws(() => buildSeed(item, {...draft, parameters: {...draft.parameters, mode}}, false));
    const withoutDomain = structuredClone(item); delete withoutDomain.data.parameters[1].domain;
    assert.throws(() => buildSeed(withoutDomain, draft, false), /v3/);
});
