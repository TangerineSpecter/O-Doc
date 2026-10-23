import {useState} from 'react';
import {getLifeConfig} from '../../../api/agentLife';
import type {AgentConfig, AgentTaskConfig} from '../../../types/api/setting';
import {useEscapeDismissal} from '../../../hooks/useEscapeDismissal';
import {useToast} from '../../common/ToastProvider';
import {
    agentTaskDraftToConfig,
    agentTaskToDraft,
    createAgentTaskDraft,
    isSystemTaskKind,
    toggleAgentTaskDraftAgent,
    validateAgentTaskDraft,
} from './agentTaskDraft';

interface TaskEditorSession {
    task?: AgentTaskConfig;
    defaultAgentId: string;
    residents: AgentConfig[];
    onSave: (task: Partial<AgentTaskConfig>) => Promise<boolean>;
    onClose: () => void;
}

/** A mounted editor owns one draft; parent refreshes do not replace unsaved input. */
export function useAgentTaskEditor({task, defaultAgentId, residents, onSave, onClose}: TaskEditorSession) {
    const [draft, setDraft] = useState(() => task ? agentTaskToDraft(task) : createAgentTaskDraft(defaultAgentId));
    const toast = useToast();
    useEscapeDismissal(true, onClose);

    const submit = async () => {
        let selectedAgents = draft.agents;
        if (isSystemTaskKind(draft.taskKind)) {
            try {
                // System activities use the current life configuration at save time.
                selectedAgents = (await getLifeConfig()).settings.agentIds;
            } catch (error) {
                toast.warning(error instanceof Error ? error.message : '统一生活配置加载失败');
                return;
            }
        }
        const error = validateAgentTaskDraft(draft, selectedAgents);
        if (error) {
            toast.warning(error);
            return;
        }
        if (await onSave(agentTaskDraftToConfig(draft, selectedAgents, residents))) onClose();
    };

    const toggleAgent = (agentId: string) => setDraft(current => toggleAgentTaskDraftAgent(current, agentId));
    return {draft, setDraft, submit, toggleAgent};
}
