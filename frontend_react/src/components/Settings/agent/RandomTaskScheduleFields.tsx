import type {AgentTaskRandomPeriod, AgentTaskExecutionMode} from '@/types/api/setting';
import {SettingsSelect} from '../SettingsSelect';
import {randomPeriodLabels, resolveAllocations} from './randomTaskSchedule';
import {RandomTaskNumberInput} from './RandomTaskNumberInput';

interface Props {
    period: AgentTaskRandomPeriod;
    count: string;
    mode: AgentTaskExecutionMode;
    agents: {id: string; name: string}[];
    allocations: Record<string, number>;
    onPeriodChange: (period: AgentTaskRandomPeriod) => void;
    onCountChange: (count: string) => void;
    onAllocationsChange: (allocations: Record<string, number>) => void;
}

export function RandomTaskScheduleFields({period, count, mode, agents, allocations, onPeriodChange, onCountChange, onAllocationsChange}: Props) {
    const targets = resolveAllocations(agents.map(agent => agent.id), Number(count) || 0, allocations);
    const total = Object.values(targets).reduce((sum, value) => sum + value, 0);
    return <div className="space-y-3 rounded-xl border border-orange-100 bg-orange-50/40 p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm font-semibold text-slate-700">
                <span>执行周期</span>
                <SettingsSelect value={period} options={Object.entries(randomPeriodLabels).map(([value, label]) => ({value: value as AgentTaskRandomPeriod, label}))} onChange={onPeriodChange}/>
            </label>
            <label className="space-y-2 text-sm font-semibold text-slate-700">
                <span>{mode === 'parallel' ? '每个 Agent 的目标次数' : '任务总次数'}</span>
                <RandomTaskNumberInput ariaLabel="随机执行目标次数" value={count} onChange={onCountChange} min={1} max={10000} className="h-10 w-full"/>
            </label>
        </div>
        <div className="space-y-2">
            {agents.map(agent => <div key={agent.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate text-slate-700">{agent.name}</span>
                {mode === 'parallel' ? <span className="shrink-0 text-orange-700">每周期 {count || '0'} 次</span> :
                    <RandomTaskNumberInput ariaLabel={`${agent.name} 分配次数`} value={targets[agent.id]} onChange={value => onAllocationsChange({...targets, [agent.id]: Number(value)})} min={0} className="h-9 w-28 shrink-0"/>}
            </div>)}
        </div>
        {mode === 'serial' && <p className={`text-xs ${total > Number(count) || total <= 0 ? 'text-red-600' : 'text-slate-500'}`}>已分配 {total} / {count || 0} 次。每次轮流执行一个 Agent，未分配的次数不执行。</p>}
        <p className="text-xs leading-relaxed text-slate-500">周期内全天分散随机执行，仅自动执行成功计数；失败会在本周期内补执行，手动执行不占次数。并行任务只补执行失败的 Agent。</p>
        <p className="text-xs text-slate-500">当前周期开始后，周期、次数和 Agent 分配的修改从下周期生效。同一任务请在一台设备运行。</p>
    </div>;
}
