import {CampaignPanel} from './CampaignPanel';
import {StartCampaign} from './StartCampaign';
import {useCallback, useState} from 'react';
import {ArrowLeft, FlaskConical, Plus, RefreshCw} from 'lucide-react';
import {useQuantExperiments} from '../../../hooks/useQuantExperiments';
import type {QuantRegisterDraft} from '../../../hooks/useQuantNavigation';
import type {QuantFactorCandidate} from '../../../types/api/quant';
import type {QuantExperiment, QuantExperimentProposal} from '../../../types/api/quantExperiment';
import {QuantButton, QuantEmpty, cardClass} from '../ui';
import {ExperimentDetail} from './ExperimentDetail';
import {StartExperiment} from './StartExperiment';
import {statusNames} from './readout';
export function ExperimentLibrary({collection, candidates, initial, close, datasets, register, request, openReport, openFactor, initialExperiment, openComparison}: {openComparison?: (id: string, experimentId: string) => void; initialExperiment?: string; openFactor: (id: string, name: string) => void; openReport: (entryId: string, reportId: string) => void; collection: string; candidates: QuantFactorCandidate[]; initial?: string; close: () => void; datasets: () => void; register: QuantRegisterDraft; request: (action: () => void) => void}) {
    const [offset, setOffset] = useState(0), [selected, setSelected] = useState(initialExperiment || ''), [creating, setCreating] = useState(false);
    const [campaignProposal, setCampaignProposal] = useState<QuantExperimentProposal>(), [campaignVersion, setCampaignVersion] = useState(0);
    const [proposal, setProposal] = useState<QuantExperimentProposal>();
    const prepareProposal = (value: QuantExperimentProposal) => {setProposal(value); setCreating(true);};
    const controller = useQuantExperiments(collection, offset, selected);
    const {reload} = controller;
    const saved = useCallback((value: QuantExperiment) => {setCreating(false); setOffset(0); setSelected(value.id); reload();}, [reload]);
    return <div className="min-h-0 flex-1 overflow-auto p-4 scrollbar-hide sm:p-6"><div className="mx-auto max-w-6xl space-y-5">
        <section className={cardClass}><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="flex items-center gap-2 text-lg font-semibold"><FlaskConical size={20}/>参数与组合实验</h2><p className="mt-2 max-w-xl text-sm leading-7 text-slate-500">比较参数、保留失败尝试，并追溯组合来自哪些因子。每轮独立保存输入、预算和计算结果。</p></div><div className="flex flex-wrap gap-2"><QuantButton onClick={close}><ArrowLeft size={14}/>返回因子库</QuantButton><QuantButton onClick={datasets}>实验行情</QuantButton><QuantButton aria-label="刷新实验" onClick={controller.reload} disabled={controller.loading}><RefreshCw size={15}/></QuantButton><QuantButton primary onClick={() => {setProposal(undefined); setCreating(true);}}><Plus size={15}/>准备实验</QuantButton></div></div></section>
        <CampaignPanel collection={collection} version={campaignVersion} openExperiment={id => {setSelected(id); reload();}}/>
        {controller.actionError && <p role="alert" className={`${cardClass} text-sm text-red-600`}>{controller.actionError}</p>}
        {controller.loading ? <p role="status" className={`${cardClass} text-sm text-slate-500`}>正在加载实验记录…</p> : controller.error ? <div role="alert" className={`${cardClass} space-y-3 text-sm text-red-600`}><p>{controller.error}</p><QuantButton onClick={controller.reload}>重试</QuantButton></div> : !controller.items.length ? <QuantEmpty title="让计算验证研究假设" description="先导入历史行情，再从 AI 提取的因子开始准备参数与组合实验。未通过和被停止的尝试也会保留。"/> : <div className="grid items-start gap-5 lg:grid-cols-[260px_minmax(0,1fr)]"><div className="max-h-64 space-y-2 overflow-auto scrollbar-hide lg:max-h-[70vh]">{controller.items.map(item => <button key={item.id} onClick={() => setSelected(item.id)} aria-pressed={controller.detail?.id === item.id} className={`w-full rounded-2xl border p-4 text-left ${controller.detail?.id === item.id ? 'border-orange-200 bg-orange-50' : 'border-slate-200 bg-white'}`}><h3 className="break-words text-sm font-semibold">{item.name}</h3><p className="mt-2 text-xs leading-6 text-slate-500">{statusNames[item.status]} · {item.attemptCount} 次尝试<br/>{new Date(item.createdAt).toLocaleString()}</p></button>)}</div>{controller.detail && <ExperimentDetail openComparison={id => openComparison?.(id, controller.detail!.id)} datasets={datasets} startCampaign={setCampaignProposal} prepareProposal={prepareProposal} openFactor={openFactor} collection={collection} reload={reload} openReport={openReport} key={controller.detail.id} experiment={controller.detail} busy={controller.busy} cancel={() => void controller.cancel(controller.detail!.id)}/>}</div>}
        {controller.total > 20 && <div className="flex justify-end gap-3"><QuantButton disabled={!offset} onClick={() => setOffset(value => Math.max(0, value - 20))}>上一页</QuantButton><QuantButton disabled={offset + 20 >= controller.total} onClick={() => setOffset(value => value + 20)}>下一页</QuantButton></div>}
    </div>{campaignProposal && <StartCampaign collection={collection} proposal={campaignProposal} close={() => request(() => setCampaignProposal(undefined))} saved={() => {setCampaignProposal(undefined); setCampaignVersion(value => value + 1); reload();}} register={register}/>}
    {creating && <StartExperiment key={proposal?.id || 'manual'} proposal={proposal} collection={collection} candidates={proposal?.candidates || candidates} initial={initial} close={() => request(() => setCreating(false))} saved={saved} register={register}/>}</div>;
}
