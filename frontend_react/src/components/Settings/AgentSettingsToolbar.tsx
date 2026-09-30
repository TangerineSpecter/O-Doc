import {Plus} from 'lucide-react';

type AgentView = 'list' | 'tasks' | 'records';

interface AgentSettingsToolbarProps {
    activeView: AgentView;
    onViewChange: (view: AgentView) => void;
    onCreateAgent: () => void;
    onCreateTask: () => void;
}

const views: Array<{value: AgentView; label: string}> = [
    {value: 'list', label: 'Agent 列表'},
    {value: 'tasks', label: '任务分配'},
    {value: 'records', label: '执行记录'},
];

export default function AgentSettingsToolbar({
    activeView, onViewChange, onCreateAgent, onCreateTask,
}: AgentSettingsToolbarProps) {
    const canCreate = activeView !== 'records';
    return (
        <div className="flex shrink-0 items-center gap-2.5">
            <div className="grid grid-cols-3 shrink-0 rounded-lg bg-slate-100 p-0.5" aria-label="Agent 管理视图">
                {views.map(view => (
                    <button
                        key={view.value}
                        type="button"
                        onClick={() => onViewChange(view.value)}
                        aria-pressed={activeView === view.value}
                        className={`whitespace-nowrap px-3 py-1 text-xs font-medium rounded-md transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/30 ${activeView === view.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        {view.label}
                    </button>
                ))}
            </div>
            {/* 保留操作区尺寸，执行记录没有创建动作时也不移动分段控制器。 */}
            <div className="h-7 w-[72px] shrink-0">
                <button
                    type="button"
                    disabled={!canCreate}
                    aria-hidden={!canCreate}
                    tabIndex={canCreate ? 0 : -1}
                    onClick={activeView === 'list' ? onCreateAgent : onCreateTask}
                    title={activeView === 'list' ? '创建 Agent' : '新建任务'}
                    className={`flex h-full w-full items-center justify-center gap-1 bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white rounded-lg text-xs font-medium transition-colors shadow-xs shadow-orange-500/20 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/30 ${canCreate ? '' : 'invisible'}`}
                >
                    <Plus className="w-3.5 h-3.5 shrink-0"/>
                    {activeView === 'list' ? '创建' : '新建'}
                </button>
            </div>
        </div>
    );
}
