import {useEffect, useState} from 'react';
import {getAgentTasks} from '@/api/setting';
import type {AgentTaskConfig} from '@/types/api/setting';

export function useRandomTaskProgress(tasks: AgentTaskConfig[], visible: boolean) {
    const [liveTasks, setLiveTasks] = useState<AgentTaskConfig[]>([]);
    const [refreshFailed, setRefreshFailed] = useState(false);
    const hasRandom = tasks.some(task => task.scheduleMode === 'random' || task.randomProgress || ['post_interaction', 'post_publish', 'travel', 'farm', 'market', 'investment'].includes(task.taskKind || ''));
    useEffect(() => {
        if (!visible || !hasRandom) return;
        let stopped = false;
        let timer: ReturnType<typeof setTimeout>;
        const refresh = async () => {
            try {
                const response = await getAgentTasks();
                if (!stopped) {
                    setLiveTasks(response as unknown as AgentTaskConfig[]);
                    setRefreshFailed(false);
                }
            } catch {
                if (!stopped) setRefreshFailed(true);
            } finally {
                if (!stopped) timer = setTimeout(refresh, 30000);
            }
        };
        void refresh();
        return () => {stopped = true; clearTimeout(timer);};
    }, [visible, hasRandom, tasks]);
    return {refreshFailed, progressByTask: Object.fromEntries(tasks.map(task => {
        const live = liveTasks.find(item => item.id === task.id && item.updatedAt === task.updatedAt);
        return [task.id, live ? live.randomProgress : task.randomProgress];
    })), worldProgressByTask: Object.fromEntries(tasks.map(task => {
        const live = liveTasks.find(item => item.id === task.id && item.updatedAt === task.updatedAt);
        return [task.id, live ? live.worldProgress : task.worldProgress];
    }))};
}
