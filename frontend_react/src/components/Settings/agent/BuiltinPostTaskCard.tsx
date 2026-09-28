import {BookOpen, Settings2, Play} from 'lucide-react';
import type {AgentTaskConfig} from '@/types/api/setting';
import {SystemTaskProgress} from './SystemTaskProgress';

interface Props {
    task: AgentTaskConfig;
    agentNames: string[];
    running: boolean;
    progress?: AgentTaskConfig['worldProgress'];
    onConfigure: () => void;
    onToggle: () => void;
    onRun: () => void;
    onPreview?: () => void;
}

export function BuiltinPostTaskCard({task, agentNames, running, progress, onConfigure, onToggle, onRun, onPreview}: Props) {
    const configured = Boolean(task.id);
    return <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
                <BookOpen className="h-4 w-4 shrink-0 text-orange-500"/>
                <h4 className="text-base font-bold text-slate-900">{task.name}</h4>
            </div>
            <span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-600">内置系统任务</span>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">{task.taskKind === 'post_publish' ? '根据角色和分类素材规则自主选题，搜索核实后发布；没有合适内容可以跳过。' : '随机阅读范围内自己未评论过的其他居民帖子，根据角色性格评论并打分。'}</p>
        <div className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-3"><p className="font-medium text-slate-700">参与 Agent</p><p className="mt-1 text-slate-500">{agentNames.length ? agentNames.join('、') : '尚未绑定 Agent'}</p></div>
            <div className="rounded-xl bg-slate-50 p-3"><p className="font-medium text-slate-700">行动频率</p><p className="mt-1 text-slate-500">{task.schedule}</p><SystemTaskProgress progress={progress}/></div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <button type="button" onClick={configured ? onToggle : onConfigure}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${task.enabled ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-500'}`}
                title={configured ? (task.enabled ? '停用任务' : '启用任务') : '先配置参与 Agent，再启用任务'}>
                {task.enabled ? '启用中' : '已关闭'}
            </button>
            <div className="flex flex-wrap items-center gap-2">
                {configured && onPreview && <button type="button" onClick={onPreview} disabled={running} className="shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs text-slate-600 hover:bg-orange-50 disabled:opacity-50">试运行预览</button>}
                {configured && <button type="button" onClick={onRun} disabled={running} className="shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-slate-600 hover:bg-orange-50 hover:text-orange-600 disabled:opacity-50"><Play className="h-3.5 w-3.5"/>{running ? '执行中' : '立即执行'}</button>}
                <button type="button" onClick={onConfigure} className="shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-600"><Settings2 className="h-3.5 w-3.5"/>配置</button>
            </div>
        </div>
    </section>;
}
