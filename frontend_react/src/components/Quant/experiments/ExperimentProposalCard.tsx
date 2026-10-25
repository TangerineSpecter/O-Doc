import {StrategySummary} from './StrategyResults';
import {TemporalSummary} from './TemporalSettings';
import {EvolutionSummary} from './EvolutionSettings';
import type {QuantExperimentProposal} from '../../../types/api/quantExperiment';
import {QuantButton} from '../ui';
import {readProposal} from './proposal';
export function ExperimentProposalCard({proposal, prepare, startCampaign, historical = false}: {startCampaign?: (proposal: QuantExperimentProposal) => void; historical?: boolean; proposal: QuantExperimentProposal; prepare?: (proposal: QuantExperimentProposal) => void}) {
    let value: ReturnType<typeof readProposal>;
    try {value = readProposal(proposal);} catch {return <p role="alert" className="text-sm text-red-600">AI 方案结构暂无法读取，原始报告仍保留。</p>;}
    const unavailable = value.seeds.some(seed => !proposal.candidates.some(candidate => candidate.id === seed.candidateId));
    return <section className="space-y-3 rounded-xl border border-orange-200 bg-white p-4" aria-label={value.feedback ? 'AI 反馈实验方案' : value.initial ? 'AI 首轮实验方案' : 'AI 下一轮实验方案'}>
        <h4 className="text-sm font-semibold">{historical ? '采用前的原始方案' : value.initial ? '首轮方案' : '下一轮方案'} · {value.name}</h4>
        <p className="text-xs leading-6 text-slate-500">{value.demo ? '本地人工样例，未调用模型。' : historical ? '这是采用前的 AI 建议，实际参数以运行记录为准。' : value.feedback ? `AI 根据外部反馈提出，基线取自${value.baselineStatus === 'recorded_experiment_inputs' ? '关联本机实验的原始输入' : value.baselineStatus === 'ai_revised_definition_defaults_not_native_or_live_settings' ? 'AI 独立修订定义的配置' : value.baselineStatus === 'authored_definition_defaults_not_actual_live_settings' ? '人工公式定义的声明值' : '源码声明默认值'}，不代表实盘配置，尚未执行。` : value.initial ? value.baselineStatus === 'ai_revised_definition_defaults_not_native_or_live_settings' ? 'AI 根据独立修订定义提出，基线取自修订版配置；不代表原平台或实盘参数，尚未执行。' : 'AI 根据来源资料提出，基线取自源码声明默认值，尚未执行。' : 'AI 根据本轮结果提出，尚未执行。'}方案的原始建议会保留，准备时可以调整参数与预算。</p>
        <dl className="space-y-2 text-sm leading-7 text-slate-700">{[['检验假设', value.hypothesis], ['否证条件', value.falsification], ['行情要求', value.dataRequirement]].map(([label, content]) => <div key={label}><dt className="font-semibold">{label}</dt><dd>{content}</dd></div>)}</dl>
        {value.seeds.map(seed => <div key={seed.candidateId} className="space-y-1 text-xs leading-6"><p className="font-semibold">{proposal.candidates.find(row => row.id === seed.candidateId)?.curation.name || seed.candidateId}</p><p>输入列：{seed.bindings.map(row => `${row.name} → ${row.column}`).join('，')}</p><p>基线：{seed.parameters.map(row => `${row.name}=${row.value}`).join('，') || '无参数'}</p>{seed.variants.map((group, index) => <p className="break-words font-mono text-slate-600" key={index}>参数组 {index + 1}：{group.map(row => `${row.name}=${row.value}`).join('，')}</p>)}</div>)}
        <p className="text-xs leading-6 text-slate-500">阈值 {value.config.threshold}；费用 {value.config.feeBps} bps、滑点 {value.config.slippageBps} bps、隔离 {value.config.gap} 根，均为实验设定。最多 {value.config.maxCandidates} 次尝试、{value.config.generations} 代、{value.config.seconds} 秒。依据：{value.evidenceRefs.join('、')}。{value.demo ? '样例未进行真实约束验证。' : '数值类型和窗口边界已检查，来源中的其他文字约束仍需核对。'}推荐参数尚未通过新数据验证。复用已看过的行情只能做复核，不能据此认定独立验证。</p>
        {value.config.strategy && <StrategySummary policy={value.config.strategy} threshold={value.config.threshold}/>}
        {value.config.walkForward && <TemporalSummary policy={value.config.walkForward}/>}
        {value.config.evolution && <EvolutionSummary policy={value.config.evolution}/>}
        {unavailable && <p role="alert" className="text-xs text-amber-700">部分父代来源已不可用，暂不能准备该方案。</p>}
        {startCampaign && <QuantButton disabled={unavailable} onClick={() => startCampaign(proposal)}>开启连续研究</QuantButton>}
        {prepare && <QuantButton primary disabled={unavailable} onClick={() => prepare(proposal)}>按此方案准备实验</QuantButton>}
    </section>;
}
