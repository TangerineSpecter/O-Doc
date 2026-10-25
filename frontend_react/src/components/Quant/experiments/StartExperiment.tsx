import {StrategySettings} from './StrategySettings';
import {buildStrategy, strategyDraft} from '../../../utils/quantStrategy';
import {TemporalSettings} from './TemporalSettings';
import {buildTemporal, temporalDraft, temporalWindows, validateTemporalBudget} from '../../../utils/quantTemporal';
import {EvolutionSettings} from './EvolutionSettings';
import {buildEvolution, evolutionDraft} from '../../../utils/quantEvolution';
import {readProposal} from './proposal';
import {ExperimentProposalCard} from './ExperimentProposalCard';
import {createRequestKey} from '../../../utils/requestKey';
import {useState} from 'react';
import {quantApi} from '../../../api/quant';
import {useQuantDatasets} from '../../../hooks/useQuantDatasets';
import {useQuantDraftRegistration, type QuantRegisterDraft} from '../../../hooks/useQuantNavigation';
import type {QuantFactorCandidate} from '../../../types/api/quant';
import type {QuantExperiment, QuantExperimentConfig, QuantExperimentProposal} from '../../../types/api/quantExperiment';
import {Select} from '../../common/Select';
import {QuantButton, QuantField, QuantModal} from '../ui';
import {buildSeed, initialSeed, type SeedDraft} from './plan';
import {SeedEditor} from './SeedEditor';
const defaults: QuantExperimentConfig = {seed: 42, maxCandidates: 16, generations: 3, threshold: 0, feeBps: 5, slippageBps: 5, gap: 1, seconds: 30};
const fields: [Exclude<keyof QuantExperimentConfig, 'evolution' | 'walkForward' | 'strategy'>, string][] = [['maxCandidates', '最多尝试数（1–32）'], ['generations', '代数（1–4）'], ['seconds', '时间预算（1–60 秒）'], ['seed', '随机种子'], ['threshold', '做多信号阈值'], ['feeBps', '单侧费用（bps）'], ['slippageBps', '单侧滑点（bps）'], ['gap', '分段隔离 K 线数']];
export function StartExperiment({collection, candidates, initial, close, saved, register, proposal}: {proposal?: QuantExperimentProposal;collection: string; candidates: QuantFactorCandidate[]; initial?: string; close: () => void; saved: (value: QuantExperiment) => void; register: QuantRegisterDraft}) {
    const [prepared] = useState(() => proposal ? readProposal(proposal) : undefined);
    const available = candidates.filter(row => row.data.expression && ['numeric_series', 'boolean_series'].includes(row.data.outputType));
    const [ids, setIds] = useState<string[]>(() => prepared ? prepared.seeds.map(row => row.candidateId) : available.some(row => row.id === initial) ? [initial!] : available[0] ? [available[0].id] : []);
    const [drafts, setDrafts] = useState<Record<string, SeedDraft>>(() => prepared?.drafts || Object.fromEntries(available.map(row => [row.id, initialSeed(row)])));
    const [name, setName] = useState(prepared?.name || '参数与组合研究'), [offset, setOffset] = useState(0), [datasetId, setDatasetId] = useState('');
    const datasets = useQuantDatasets(collection, offset, datasetId);
    const dataset = datasets.detail;
    const [config, setConfig] = useState(() => Object.fromEntries(fields.map(([key]) => [key, String((prepared?.config || defaults)[key])])) as Record<Exclude<keyof QuantExperimentConfig, 'evolution' | 'walkForward' | 'strategy'>, string>);
    const [evolution, setEvolution] = useState(() => evolutionDraft(prepared?.config.evolution, !prepared || !!prepared.config.evolution));
    const [strategy, setStrategy] = useState(() => strategyDraft(prepared?.config.strategy, prepared?.config.threshold ?? defaults.threshold));
    const [temporal, setTemporal] = useState(() => temporalDraft(prepared?.config.walkForward));
    const [neighbors, setNeighbors] = useState(!prepared), [busy, setBusy] = useState(false), [error, setError] = useState(''), [dirty, setDirty] = useState(false);
    const [identity, setIdentity] = useState(() => createRequestKey());
    const change = () => {setDirty(true); setIdentity(createRequestKey());};
    // Leaving a preparation form may discard it, but can never start computation implicitly.
    useQuantDraftRegistration('experiment-start', dirty, undefined, register);
    const selected = ids.flatMap(id => available.filter(row => row.id === id));
    const [includeProposed, setIncludeProposed] = useState(!!prepared);
    let preparationError = '', seeds: ReturnType<typeof buildSeed>[] = [];
    try {seeds = selected.map(row => {
        const seed = buildSeed(row, drafts[row.id], neighbors);
        if (includeProposed && prepared) seed.variants = [...(prepared.seeds.find(item => item.candidateId === row.id)?.variants || []), ...seed.variants];
        if (seed.variants.length > 16) throw new Error('每个父代最多 16 组参数；请关闭邻近窗口或 AI 参数组后重试');
        return seed;
    });} catch (cause) {preparationError = cause instanceof Error ? cause.message : '参数尚不完整';}
    let evolutionError = '';
    try {
        if (buildEvolution(evolution)) {
            if (Number(config.generations) < 2) throw new Error('公式演化至少需要 2 代');
            if (seeds.reduce((sum, seed) => sum + 1 + seed.variants.length, 0) >= Number(config.maxCandidates)) throw new Error('请增加尝试上限或减少参数组，为新公式保留尝试额度');
        }
    } catch (cause) {evolutionError = cause instanceof Error ? cause.message : '演化配置无效';}
    let temporalError = '';
    try {
        const policy = buildTemporal(temporal);
        if (policy) {
            validateTemporalBudget(policy, seeds, {maxCandidates: Number(config.maxCandidates), evolution: buildEvolution(evolution)});
            if (dataset) temporalWindows(dataset.rowCount, policy, Number(config.gap));
        }
    } catch (cause) {temporalError = cause instanceof Error ? cause.message : '滚动验证配置无效';}
    let strategyError = '';
    try {buildStrategy(strategy, Number(config.threshold));} catch (cause) {strategyError = cause instanceof Error ? cause.message : '策略规则无效';}
    const start = async () => {
        if (busy || !dataset || preparationError || evolutionError || temporalError || strategyError || !seeds.length) return;
        setBusy(true); setError('');
        try {
            if (Object.values(config).some(value => !value.trim() || !Number.isFinite(Number(value)))) throw new Error('请填写有效预算、阈值和费用');
            const values = Object.fromEntries(fields.map(([key]) => [key, Number(config[key])])) as unknown as QuantExperimentConfig;
            const strategyPolicy = buildStrategy(strategy, values.threshold);
            if (strategyPolicy) values.strategy = strategyPolicy;
            const policy = buildEvolution(evolution);
            if (policy) values.evolution = policy;
            const walkForward = buildTemporal(temporal);
            if (walkForward) values.walkForward = walkForward;
            const result = await quantApi.startExperiment(collection, {proposalId: proposal?.id, requestKey: identity, name, datasetId: dataset.id, config: values, seeds});
            setDirty(false); saved(result);
        } catch (cause) {setError(cause instanceof Error ? cause.message : '实验创建失败，方案仍保留');}
        finally {setBusy(false);}
    };
    return <QuantModal title="准备参数与组合实验" close={close} busy={busy} wide><fieldset disabled={busy} className="space-y-5">
        <p className="text-sm leading-7 text-slate-500">从已提取或实验衍生的计算式开始，比较默认参数、邻近窗口和允许的组合。按上一根收盘信号在下一开盘决策，可选择明确的多空和风控假设；训练与验证负责选择，最后再评价留出区间。开启公式演化后会按允许算子探索新公式；关闭时沿用均值或布尔组合搜索。完成后使用默认对话模型生成实验解读。</p>
        {proposal && <ExperimentProposalCard proposal={proposal}/>}
        <QuantField label="实验名称" value={name} onChange={value => {change(); setName(value);}} required />
        <div className="space-y-2"><label className="text-sm font-semibold text-slate-700">历史行情</label>{datasets.loading ? <p role="status" className="text-sm text-slate-500">正在加载行情…</p> : datasets.error ? <p role="alert" className="text-sm text-red-600">{datasets.error}<QuantButton onClick={datasets.reload}>重试</QuantButton></p> : <Select aria-label="实验历史行情" menuPortal value={dataset?.id || ''} onChange={value => {change(); setDatasetId(value);}} options={datasets.items.map(row => ({value: row.id, label: `${row.name} · ${row.rowCount} 根`})).concat(datasets.items.length ? [] : [{value: '', label: '请先到实验行情导入 CSV'}])} />}
            {datasets.total > 20 && <div className="flex gap-2"><QuantButton disabled={!offset} onClick={() => {change(); setOffset(value => Math.max(0, value - 20));}}>上一页行情</QuantButton><QuantButton disabled={offset + 20 >= datasets.total} onClick={() => {change(); setOffset(value => value + 20);}}>下一页行情</QuantButton></div>}
            {dataset && <p className="text-xs leading-6 text-slate-500">{dataset.symbol} · {dataset.timeframe} · {dataset.priceAdjustment || '复权未知'} · {dataset.source || '来源未知'}{dataset.rowCount < 60 && ' · 数据不足：至少需要 60 根 K 线'}</p>}
        </div>
        <section className="space-y-3"><h3 className="text-sm font-semibold text-slate-700">父代候选（最多 8 个）</h3><p className="text-xs leading-6 text-slate-500">{proposal ? '来自 AI 方案所选父代。' : '来自当前因子库页的可计算候选；可返回因子库搜索或翻页后再进入。'}原始平台源码等价性仍待验证。</p><div className="grid gap-2 sm:grid-cols-2">{available.map(row => <label key={row.id} className="flex items-start gap-2 rounded-xl border border-slate-200 p-3 text-sm"><input type="checkbox" className="mt-1 accent-orange-500" checked={ids.includes(row.id)} disabled={!ids.includes(row.id) && ids.length >= 8} onChange={event => {change(); setIds(values => event.target.checked ? [...values, row.id] : values.filter(id => id !== row.id));}} /><span>{row.curation.name}<span className="mt-1 block text-xs text-slate-400">{row.entryTitle} · {row.data.formulaVersion?.origin === 'ai_repair' ? 'AI 修订版本' : row.data.formulaVersion ? '人工修订版本' : row.data.derivation ? '实验版本' : '来源提取'}</span></span></label>)}</div>{!available.length && <p className="text-sm text-slate-500">当前页暂无受控表达式候选，先分析来源资料。</p>}</section>
        {selected.map(candidate => <SeedEditor key={candidate.id} candidate={candidate} draft={drafts[candidate.id]} change={value => {change(); setDrafts(current => ({...current, [candidate.id]: value}));}} />)}
        {prepared && <label className="flex items-start gap-3 text-sm text-slate-700"><input type="checkbox" className="mt-1 accent-orange-500" checked={includeProposed} onChange={event => {change(); setIncludeProposed(event.target.checked);}}/><span>使用 AI 提出的参数组<span className="mt-1 block text-xs leading-6 text-slate-500">上方列出的参数组保持原值；修改基线不会自动改写这些组。实际提交内容与原始建议分别保存。</span></span></label>}
        <label className="flex items-start gap-3 text-sm text-slate-700"><input type="checkbox" className="mt-1 accent-orange-500" checked={neighbors} onChange={event => {change(); setNeighbors(event.target.checked);}} /><span>比较窗口邻近值<span className="mt-1 block text-xs leading-6 text-slate-500">对表达式实际使用的信号窗口，逐项比较约 75% 和 125% 的整数窗口；这是待验证的邻域试验，不是已验证的推荐参数。</span></span></label>
        {!!seeds.length && <p className="text-xs text-slate-500">准备 {seeds.length} 个原始父代、{seeds.reduce((sum, seed) => sum + seed.variants.length, 0)} 组参数变体；总尝试数与组合代数受下方预算限制。</p>}
        <EvolutionSettings draft={evolution} change={value => {change(); setEvolution(value);}}/>
        <StrategySettings draft={strategy} threshold={config.threshold} change={value => {change(); setStrategy(value);}}/>
        <TemporalSettings draft={temporal} change={value => {change(); setTemporal(value);}}/>
        <details className="rounded-xl border border-slate-200 p-4"><summary className="text-sm font-semibold text-slate-700">预算、成交与成本假设</summary><p className="my-3 text-xs leading-6 text-slate-500">初始费用、滑点均为单侧 5 bps（0.05%）的模拟假设，请按数据用途调整。布尔信号不使用数值阈值。关闭滚动验证时，训练/验证/留出约为 60%/20%/20%；开启时按逐折窗口执行。不包含原平台的盘中成交、T+1 或停牌约束。</p><div className="grid gap-4 sm:grid-cols-2">{fields.map(([key, label]) => <QuantField key={key} label={label} value={config[key]} type="number" onChange={value => {change(); setConfig(current => ({...current, [key]: value}));}} />)}</div></details>
        {(error || preparationError || evolutionError || temporalError || strategyError) && <p role="alert" className="text-sm text-red-600">{error || preparationError || evolutionError || temporalError || strategyError}</p>}
        <div className="flex justify-end gap-3"><QuantButton onClick={close} disabled={busy}>取消</QuantButton><QuantButton primary onClick={() => void start()} disabled={busy || datasets.loading || !dataset || dataset.rowCount < 60 || !!preparationError || !!evolutionError || !!temporalError || !!strategyError || !seeds.length}>{busy ? '正在提交…' : '保存方案并启动本机实验'}</QuantButton></div>
    </fieldset></QuantModal>;
}
