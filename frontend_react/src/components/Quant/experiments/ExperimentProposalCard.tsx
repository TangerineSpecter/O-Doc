import {Play, Sparkles, Sliders, Target, ShieldAlert, Database} from 'lucide-react';
import {parameterValueLabel} from '../../../utils/quantParameterSource';
import {StrategySummary} from './StrategyResults';
import {TemporalSummary} from './TemporalSettings';
import {EvolutionSummary} from './EvolutionSettings';
import type {QuantExperimentProposal} from '../../../types/api/quantExperiment';
import {QuantBadge, QuantButton} from '../ui';
import {readProposal} from './proposal';

export function ExperimentProposalCard({
    proposal,
    prepare,
    startCampaign,
    historical = false,
}: {
    startCampaign?: (proposal: QuantExperimentProposal) => void;
    historical?: boolean;
    proposal: QuantExperimentProposal;
    prepare?: (proposal: QuantExperimentProposal) => void;
}) {
    let value: ReturnType<typeof readProposal>;
    try {
        value = readProposal(proposal);
    } catch {
        return (
            <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-600">
                AI 方案结构暂无法读取，原始报告仍保留。
            </p>
        );
    }
    const unavailable = value.seeds.some((seed) => !proposal.candidates.some((candidate) => candidate.id === seed.candidateId));
    const descriptionText = value.demo
        ? '本地人工样例，未调用模型。'
        : historical
          ? '这是采用前的 AI 建议，实际参数以运行记录为准。'
          : value.feedback
            ? `AI 根据外部反馈提出，基线取自${
                  value.baselineStatus === 'recorded_experiment_inputs'
                      ? '关联本机实验的原始输入'
                      : value.baselineStatus === 'ai_revised_definition_defaults_not_native_or_live_settings'
                        ? 'AI 独立修订定义的配置'
                        : value.baselineStatus === 'authored_definition_defaults_not_actual_live_settings'
                          ? '人工公式定义的声明值'
                          : '源码声明默认值'
              }，不代表实盘配置，尚未执行。`
            : value.initial
              ? value.baselineStatus === 'ai_revised_definition_defaults_not_native_or_live_settings'
                  ? 'AI 根据独立修订定义提出，基线取自修订版配置；不代表原平台或实盘参数，尚未执行。'
                  : 'AI 根据来源资料提出，基线取自源码声明默认值，尚未执行。'
              : 'AI 根据本轮结果提出，尚未执行。';

    return (
        <section
            className="space-y-4 rounded-2xl border border-orange-200/80 bg-gradient-to-br from-orange-50/35 via-white to-white p-5 shadow-sm"
            aria-label={value.feedback ? 'AI 反馈实验方案' : value.initial ? 'AI 首轮实验方案' : 'AI 下一轮实验方案'}
        >
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-base font-bold text-slate-900">
                            {historical ? '采用前的原始方案' : value.initial ? '首轮方案' : '下一轮方案'} · {value.name}
                        </h4>
                        <QuantBadge tone={historical ? 'slate' : value.demo ? 'amber' : 'orange'}>
                            {historical ? '历史记录' : value.demo ? '本地样例' : '待执行方案'}
                        </QuantBadge>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                        {descriptionText}方案的原始建议会保留，准备时可以调整参数与预算。
                    </p>
                </div>
                {(startCampaign || prepare) && (
                    <div className="flex flex-wrap items-center gap-2">
                        {startCampaign && (
                            <QuantButton disabled={unavailable} onClick={() => startCampaign(proposal)}>
                                <Sparkles size={14} className="text-orange-500" />
                                开启连续研究
                            </QuantButton>
                        )}
                        {prepare && (
                            <QuantButton primary disabled={unavailable} onClick={() => prepare(proposal)}>
                                <Play size={14} />
                                按此方案准备实验
                            </QuantButton>
                        )}
                    </div>
                )}
            </div>

            <dl className="grid gap-3 md:grid-cols-3">
                {[
                    {label: '检验假设', content: value.hypothesis, icon: Target, tone: 'border-orange-200/70 bg-white'},
                    {label: '否证条件', content: value.falsification, icon: ShieldAlert, tone: 'border-amber-200/70 bg-white'},
                    {label: '行情要求', content: value.dataRequirement, icon: Database, tone: 'border-slate-200/80 bg-white'},
                ].map(({label, content, icon: Icon, tone}) => (
                    <div key={label} className={`rounded-xl border p-3.5 ${tone}`}>
                        <dt className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                            <Icon size={13} className="text-orange-500" />
                            {label}
                        </dt>
                        <dd className="mt-1.5 text-xs leading-relaxed text-slate-600">{content}</dd>
                    </div>
                ))}
            </dl>

            <div className="space-y-2.5">
                {value.seeds.map((seed) => {
                    const candidateObj = proposal.candidates.find((row) => row.id === seed.candidateId);
                    const candidateName = candidateObj?.curation.name || seed.candidateId;
                    const baselineParams =
                        seed.parameters
                            .map((row) => `${parameterValueLabel(row.name, candidateObj?.data.parameters)}=${row.value}`)
                            .join('，') || '无参数';
                    return (
                        <div key={seed.candidateId} className="rounded-xl border border-slate-200/80 bg-white p-3.5 text-xs leading-6">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className=" flex items-center gap-1.5 font-bold text-slate-800">
                                    <Sliders size={13} className="text-orange-500" />
                                    {candidateName}
                                </p>
                                <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-600">
                                    输入列：{seed.bindings.map((row) => `${row.name} → ${row.column}`).join('，')}
                                </span>
                            </div>
                            <p className="mt-1.5 text-slate-600">
                                <span className="font-semibold text-slate-700">基线：</span>
                                <span className="font-mono">{baselineParams}</span>
                            </p>
                            {seed.variants.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                    {seed.variants.map((group, index) => (
                                        <p
                                            className="break-words rounded-lg border border-slate-200/80 bg-slate-50 px-2.5 py-1 font-mono text-[11px] text-slate-600"
                                            key={index}
                                        >
                                            参数组 {index + 1}：
                                            {group
                                                .map((row) => `${parameterValueLabel(row.name, candidateObj?.data.parameters)}=${row.value}`)
                                                .join('，')}
                                        </p>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <div className="rounded-xl bg-slate-50/90 p-3.5 text-xs leading-relaxed text-slate-500 space-y-1.5">
                <p>
                    阈值 {value.config.threshold}；费用 {value.config.feeBps} bps、滑点 {value.config.slippageBps} bps、隔离{' '}
                    {value.config.gap} 根，均为实验设定。最多 {value.config.maxCandidates} 次尝试、{value.config.generations} 代、
                    {value.config.seconds} 秒。依据：{value.evidenceRefs.join('、')}。
                    {value.demo ? '样例未进行真实约束验证。' : '数值类型和窗口边界已检查，来源中的其他文字约束仍需核对。'}
                    推荐参数尚未通过新数据验证。复用已看过的行情只能做复核，不能据此认定独立验证。
                </p>
                {value.config.labelTarget && (
                    <p className="text-slate-600">
                        标签选择目标：未来 {value.config.labelTarget.horizonBars} 根收盘收益；逐窗剔除跨界标签，按 Rank IC/覆盖率选择。交易收益另列，不宣称显著性。
                    </p>
                )}
            </div>

            {value.config.strategy && <StrategySummary policy={value.config.strategy} threshold={value.config.threshold} />}
            {value.config.walkForward && <TemporalSummary policy={value.config.walkForward} />}
            {value.config.evolution && <EvolutionSummary policy={value.config.evolution} />}
            {unavailable && (
                <p role="alert" className="rounded-xl bg-amber-50 p-3 text-xs text-amber-700">
                    部分父代来源已不可用，暂不能准备该方案。
                </p>
            )}
        </section>
    );
}
