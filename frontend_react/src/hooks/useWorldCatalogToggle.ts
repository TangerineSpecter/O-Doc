import {useRef, useState} from 'react';
import {saveWorldCategory, saveWorldProfession} from '../api/agentWorld';
import {useToast} from '../components/common/ToastProvider';

export function useWorldCatalogToggle(reload: () => Promise<void>) {
    const pending = useRef(new Set<string>());
    const [busyIds, setBusyIds] = useState<string[]>([]);
    const toast = useToast();
    const toggle = async (kind: 'category' | 'profession', id: string, enabled: boolean) => {
        if (pending.current.has(id)) return;
        pending.current.add(id); setBusyIds([...pending.current]);
        try {
            const save = kind === 'category' ? saveWorldCategory : saveWorldProfession;
            await save({id, enabled: !enabled});
            await reload();
        } catch (failure) {
            toast.error(failure instanceof Error ? failure.message : '切换状态失败');
        } finally {
            pending.current.delete(id); setBusyIds([...pending.current]);
        }
    };
    return {toggle, busyIds};
}
