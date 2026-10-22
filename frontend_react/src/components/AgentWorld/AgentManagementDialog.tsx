import {useSearchParams} from 'react-router-dom';
import {useSettings} from '../../hooks/useSettings';
import {AgentSettings} from '../Settings/AgentSettings';
import WorldDialog from './WorldDialog';
import WorldOrbitLoader from './WorldOrbitLoader';

export default function AgentManagementDialog({onClose}: {onClose: () => void}) {
    const settings = useSettings();
    const [query] = useSearchParams();

    return (
        <WorldDialog title="Agent 管理" onClose={onClose} size="wide">
            {settings.isLoading ? <WorldOrbitLoader title="正在加载 Agent 设置"/> : settings.loadError ? (
                <div className="rounded-2xl border border-red-100 bg-red-50 p-6 text-center text-sm text-red-700">
                    <p>{settings.loadError}</p>
                    <button type="button" onClick={() => void settings.refresh()} className="mt-3 shrink-0 whitespace-nowrap rounded-lg bg-white px-4 py-2 font-medium focus-visible:outline-orange-500">重新加载</button>
                </div>
            ) : (
                <AgentSettings
                    initialView={query.get('view') === 'tasks' ? 'tasks' : 'list'}
                    agents={settings.agents}
                    tasks={settings.agentTasks}
                    mcpServers={settings.mcpServers}
                    skills={settings.skills}
                    getModelsByType={settings.getModelsByType}
                    onSave={settings.handleSaveAgent}
                    onSaveTask={settings.handleSaveAgentTask}
                    onRunTaskNow={settings.handleRunAgentTaskNow}
                    onDeleteTask={settings.handleDeleteAgentTask}
                    archivedAgents={settings.archivedAgents}
                    archiveConflictId={settings.agentNameConflictId}
                    onArchive={settings.handleArchiveAgent}
                    onRestore={settings.handleRestoreAgent}
                />
            )}
        </WorldDialog>
    );
}
