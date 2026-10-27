import {useState} from 'react';
import type {QuantReport} from '../../../types/api/quant';
import type {QuantRegisterDraft} from '../../../hooks/useQuantNavigation';
import {ExperimentProposalCard} from './ExperimentProposalCard';
import {StartExperiment} from './StartExperiment';
import {StartCampaign} from './StartCampaign';
import {cardClass} from '../ui';

export function InitialExperimentPlan({report, collection, register, request, openExperiments}: {
    report: QuantReport; collection: string; register: QuantRegisterDraft; request: (action: () => void) => void;
    openExperiments: (id?: string) => void;
}) {
    const [mode, setMode] = useState<'experiment' | 'campaign' | null>(null);
    const feedback = report.data.feedbackPlanningVersion === 1;
    const followup = report.schemaVersion === 4;
    if (report.data.initialPlanningVersion !== 1 && !feedback && !followup) return null;
    const proposal = report.proposal;
    return <section id={`quant-report-plan-${report.id}`} className={`${cardClass} space-y-4`} aria-label={followup ? '后续实验规划' : feedback ? '反馈实验规划' : '首轮实验规划'}>
        <div><h3 className="text-sm font-semibold">{followup ? 'AI 后续实验规划' : feedback ? 'AI 反馈实验规划' : 'AI 首轮实验规划'}</h3><p className="mt-2 text-sm leading-7 text-slate-600">{followup ? report.data.planningNote : feedback ? report.data.feedbackPlanningNote : report.data.initialPlanningNote}</p></div>
        {proposal ? <ExperimentProposalCard proposal={proposal} prepare={() => request(() => setMode('experiment'))} startCampaign={() => request(() => setMode('campaign'))}/>
            : <p className="text-sm text-slate-500">本次未生成可执行方案。报告与候选已保留，补充上述缺失材料后可以重新分析。</p>}
        {mode === 'experiment' && proposal && <StartExperiment collection={collection} proposal={proposal} candidates={proposal.candidates} register={register}
            close={() => request(() => setMode(null))} saved={value => {setMode(null); openExperiments(value.id);}}/>}
        {mode === 'campaign' && proposal && <StartCampaign collection={collection} proposal={proposal} register={register}
            close={() => request(() => setMode(null))} saved={() => {setMode(null); openExperiments();}}/>}
    </section>;
}
