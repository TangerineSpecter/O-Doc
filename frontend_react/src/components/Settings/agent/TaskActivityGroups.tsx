import {DecisionProcessInfo} from '../../AgentWorld/DecisionProcessInfo';
import {useState, type ReactNode} from 'react';
import type {AgentTaskConfig} from '../../../types/api/setting';
import {BuiltinPostTaskCard} from './BuiltinPostTaskCard';
import {FishingActivityCard, LotteryActivityCard, SocialActivityCard} from './WorldActivityCards';
import {WorldInterleavingSettings} from '../../AgentWorld/WorldInterleavingSettings';
import WorldDialog from '../../AgentWorld/WorldDialog';
import {useWorldLifeConfig} from '../../../hooks/useWorldLifeConfig';

const groups = [
    {id: 'schedule', title: '日程任务', description: '提前安排时间，当日次数为上限；没有合适内容时可以留空。', kinds: ['travel', 'farm', 'investment', 'post_publish', 'post_interaction']},
    {id: 'idle', title: '空档活动', description: '先保护后续日程所需的体力与资金，再由决策模型选择活动或暂不活动。', kinds: ['cooking', 'alchemy', 'blacksmith', 'exploration']},
    {id: 'independent', title: '独立活动', description: '按交易、社交、赛事或任务机会触发，保留各自的节奏。', kinds: ['market']},
] as const;

export function TaskActivityGroups({tasks, runningTaskId, progress, onConfigure, onToggle, onRun, onPreview, memo}: {
    tasks: AgentTaskConfig[]; runningTaskId: string | null; progress: Record<string, AgentTaskConfig['worldProgress']>;
    onConfigure: (task: AgentTaskConfig) => void; onToggle: (id: string) => void;
    onRun: (id: string) => void; onPreview: (task: AgentTaskConfig) => void; memo: ReactNode;
}) {
    const [idleOpen, setIdleOpen] = useState(false);
    const life = useWorldLifeConfig();
    return <div className="space-y-6">
        {groups.map(group => <section key={group.id} aria-label={group.title} className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                <div><div className="flex items-center gap-1"><h3 className="text-sm font-bold text-slate-800">{group.title}</h3>{group.id !== 'independent' && <DecisionProcessInfo kind={group.id === 'schedule' ? 'main_schedule' : 'interleaving'}/>}</div><p className="mt-1 text-xs leading-5 text-slate-500">{group.description}</p></div>
                {group.id === 'idle' && <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-slate-500">{life.loading ? '读取空档设置…' : life.error ? '空档状态未知' : life.config?.settings.interleavingEnabled ? '自动穿插已开启' : '自动穿插已关闭'}</span>
                    <button type="button" onClick={() => setIdleOpen(true)} className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-700">空档总开关与节奏</button>
                </div>}
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {group.kinds.map(kind => tasks.find(task => task.taskKind === kind)).filter((task): task is AgentTaskConfig => !!task).map(task =>
                    <BuiltinPostTaskCard key={task.taskKind} task={task} agentNames={[]} running={!!task.id && runningTaskId === task.id}
                        progress={progress[task.id]} onConfigure={() => onConfigure(task)} onToggle={() => onToggle(task.id)} onRun={() => onRun(task.id)}
                        onPreview={task.taskKind === 'post_publish' ? () => onPreview(task) : undefined}/>
                )}
                {group.id === 'schedule' && <LotteryActivityCard/>}
                {group.id === 'idle' && <FishingActivityCard/>}
                {group.id === 'independent' && <>
                    <SocialActivityCard/>
                    {memo}
                    <section aria-label="武道大会" className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
                        <h4 className="text-xs font-bold text-slate-800">武道大会 <DecisionProcessInfo kind="tournament"/> <span className="ml-2 font-normal text-slate-500">跟随本机自动执行</span></h4>
                        <p className="mt-2 text-[11px] leading-5 text-slate-500">由赛事时钟自动推进，使用上方“本机自动执行”总开关。暂停自动执行也会暂停大会；没有单独的赛事开关。</p>
                    </section>
                    <section aria-label="悬赏任务" className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
                        <h4 className="text-xs font-bold text-slate-800">悬赏任务 <DecisionProcessInfo kind="bounty"/> <span className="ml-2 font-normal text-slate-500">发布与接取触发</span></h4>
                        <p className="mt-2 text-[11px] leading-5 text-slate-500">在悬赏面板发布或取消任务；居民接取后按任务规则执行，所需资源纳入日程保护。</p>
                    </section>
                </>}
            </div>
        </section>)}
        {idleOpen && <WorldDialog title="空档活动设置" onClose={() => {setIdleOpen(false); life.refresh();}}><WorldInterleavingSettings/></WorldDialog>}
    </div>;
}
