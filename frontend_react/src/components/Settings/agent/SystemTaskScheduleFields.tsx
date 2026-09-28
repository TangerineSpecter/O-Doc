import type {AgentTaskRandomPeriod} from '@/types/api/setting';
import {SettingsSelect} from '../SettingsSelect';
import {RandomTaskNumberInput} from './RandomTaskNumberInput';
import {randomPeriodLabels} from './randomTaskSchedule';

interface Props {
    publish?: boolean; travel?: boolean;
    mode: 'fixed' | 'random'; period: AgentTaskRandomPeriod; count: string; interval: string;
    onChange: (patch: {scheduleMode?: 'fixed' | 'random'; randomPeriod?: AgentTaskRandomPeriod; randomCount?: string; intervalMinutes?: string}) => void;
}
export function SystemTaskScheduleFields({mode, period, count, interval, onChange, publish = false, travel = false}: Props) {
    return <section className="space-y-4 rounded-2xl border border-orange-100 bg-orange-50/40 p-4">
        <label className="block space-y-2 text-sm font-semibold text-slate-700"><span>世界行动节奏</span>
            <SettingsSelect value={mode} menuPortal={true} options={[{value: 'random', label: '周期随机'}, {value: 'fixed', label: '固定间隔'}]}
                onChange={scheduleMode => onChange({scheduleMode})}/></label>
        {mode === 'random' ? <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm font-semibold text-slate-700"><span>周期</span>
                <SettingsSelect value={period} menuPortal={true} options={Object.entries(randomPeriodLabels).map(([value, label]) => ({value: value as AgentTaskRandomPeriod, label}))} onChange={randomPeriod => onChange({randomPeriod})}/></label>
            <label className="space-y-2 text-sm font-semibold text-slate-700"><span>整个任务的行动机会数</span>
                <RandomTaskNumberInput value={count} onChange={randomCount => onChange({randomCount})} min={1} max={10000} ariaLabel="系统任务行动机会数" className="h-10 w-full"/></label>
        </div> : <label className="block space-y-2 text-sm font-semibold text-slate-700"><span>间隔（分钟）</span>
            <RandomTaskNumberInput value={interval} onChange={intervalMinutes => onChange({intervalMinutes})} min={1} ariaLabel="系统任务间隔分钟" className="h-10 w-full"/></label>}
        <p className="text-xs leading-relaxed text-slate-500">{travel ? '每次机会提供最多五个目的地，Agent 自主选择或不去；同一趟旅行逐步推进。离线机会不集中补跑。' : publish ? '每次机会公平随机抽一位绑定 Agent，自主选题并决定发布或跳过。跳过和失败也结束机会；离线期间不集中补跑。' : '每次机会公平随机抽一位绑定 Agent，读取自己未评论的非本人帖子，可选择休息。休息、跳过和失败都结束机会；离线期间不集中补跑。'}</p>
        <p className="text-xs text-slate-500">{travel ? '体力仅出发时消耗一次。景点与美食包含在总价内，纪念品另行结算。' : publish ? '体力上限100，每小时恢复5，成功发帖消耗20。发帖冷却另按上方配置检查。' : '体力上限 100，每小时恢复 5，评论与评分一起成功消耗 10。每位 Agent 两次机会至少间隔 15 分钟。'}</p>
    </section>;
}
