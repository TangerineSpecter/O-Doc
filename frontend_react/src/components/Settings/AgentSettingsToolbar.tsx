import {Archive, Plus} from 'lucide-react';

type AgentView = 'list' | 'tasks';

interface AgentSettingsToolbarProps {
    activeView: AgentView;
    onViewChange: (view: AgentView) => void;
    onCreateAgent: () => void;
    onCreateTask: () => void;
    onOpenArchive: () => void;
    archivedCount: number;
}

const views: Array<{value: AgentView; label: string}> = [
    {value: 'list', label: 'Agent 列表'},
    {value: 'tasks', label: '任务分配'},
];

export default function AgentSettingsToolbar({
    activeView, onViewChange, onCreateAgent, onCreateTask, onOpenArchive, archivedCount,
}: AgentSettingsToolbarProps) {
    return (
        <div className="flex flex-wrap items-center gap-2.5">
            <button type="button" onClick={onOpenArchive} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:border-orange-300 hover:text-orange-600 focus-visible:outline-orange-500">
                <Archive className="h-3.5 w-3.5"/>归档居民 <span>{archivedCount}</span>
            </button>
            <div className="grid grid-cols-2 shrink-0 rounded-lg bg-slate-100 p-0.5" aria-label="Agent 管理视图">
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
            <div className="h-7 w-[72px] shrink-0">
                <button
                    type="button"
                    onClick={activeView === 'list' ? onCreateAgent : onCreateTask}
                    title={activeView === 'list' ? '创建 Agent' : '新建任务'}
                    className="flex h-full w-full items-center justify-center gap-1 bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white rounded-lg text-xs font-medium transition-colors shadow-xs shadow-orange-500/20 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/30"
                >
                    <Plus className="w-3.5 h-3.5 shrink-0"/>
                    {activeView === 'list' ? '创建' : '新建'}
                </button>
            </div>
        </div>
    );
}
