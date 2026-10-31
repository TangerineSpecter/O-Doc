import type {QuantReportReading} from '../../../types/api/quantReading';
import {useState} from 'react';
import {createPortal} from 'react-dom';
import {FlaskConical} from 'lucide-react';
import type {QuantRegisterDraft} from '../../../hooks/useQuantNavigation';
import {ExperimentProposalCard} from './ExperimentProposalCard';
import {StartExperiment} from './StartExperiment';
import {StartCampaign} from './StartCampaign';
import {PlanningNote} from './PlanningNote';
import {QuantBadge, cardClass} from '../ui';

export function InitialExperimentPlan({report, collection, register, request, openExperiments}: {
    report: QuantReportReading; collection: string; register: QuantRegisterDraft; request: (action: () => void) => void;
    openExperiments: (id?: string) => void;
}) {
    const [mode, setMode] = useState<'experiment' | 'campaign' | null>(null);
    const feedback = report.data.feedbackPlanningVersion === 1;
    const followup = report.schemaVersion === 4;
    if (report.data.initialPlanningVersion !== 1 && !feedback && !followup) return null;
    const proposal = report.proposal;
    const title = followup ? 'AI 后续实验规划' : feedback ? 'AI 反馈实验规划' : 'AI 首轮实验规划';
    const note = followup ? report.data.planningNote : feedback ? report.data.feedbackPlanningNote : report.data.initialPlanningNote;
    const hasExplanation=!!note?.trim()&&!note.startsWith('算法已提取并保留。实验规划本次未生成');
    return (
        <section
            id={`quant-report-plan-${report.id}`}
            className={`${cardClass} space-y-4`}
            aria-label={followup ? '后续实验规划' : feedback ? '反馈实验规划' : '首轮实验规划'}
        >
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
                <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-500">
                        <FlaskConical size={18} />
                    </div>
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-bold text-slate-900">{title}</h3>
                            <QuantBadge tone={proposal ? 'orange' : 'slate'}>
                                {proposal ? '已生成方案' : hasExplanation ? '已整理实验说明' : '未生成方案'}
                            </QuantBadge>
                        </div>
                        <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                            {proposal ? '已整理后续实验方案，可以在下方查看和准备。' : hasExplanation ? '下方说明数据准备、计算检查和参数比较；当前没有一键执行方案。' : '实验规划尚未完成，可从设计实验步骤继续。'}
                        </p>
                    </div>
                </div>
            </div>
            {proposal ? (
                <ExperimentProposalCard
                    proposal={proposal}
                    prepare={() => request(() => setMode('experiment'))}
                    startCampaign={() => request(() => setMode('campaign'))}
                />
            ) : !note ? (
                <p className="text-sm leading-7 text-slate-500">暂无生成说明。实验方案用于整理待验证的因子、数据和参数。</p>
            ) : null}
            {note && <PlanningNote key={`${report.id}-${note}`} note={note}/>}
            {mode === 'experiment' && proposal && createPortal(<div onClick={event => event.stopPropagation()} onKeyDown={event => { if (event.key === 'Tab') event.stopPropagation(); }}>
                <StartExperiment
                    collection={collection}
                    proposal={proposal}
                    candidates={proposal.candidates}
                    register={register}
                    close={() => request(() => setMode(null))}
                    saved={(value) => {
                        setMode(null);
                        openExperiments(value.id);
                    }}
                />
            </div>, document.body)}
            {mode === 'campaign' && proposal && createPortal(<div onClick={event => event.stopPropagation()} onKeyDown={event => { if (event.key === 'Tab') event.stopPropagation(); }}>
                <StartCampaign
                    collection={collection}
                    proposal={proposal}
                    register={register}
                    close={() => request(() => setMode(null))}
                    saved={() => {
                        setMode(null);
                        openExperiments();
                    }}
                />
            </div>, document.body)}
        </section>
    );
}
