import {useState} from 'react';
import {deleteItemIcon, renameItemIcon, uploadItemIcon} from '../api/itemIcons';
import type {ItemIcon} from '../types/api/itemIcons';

export function useItemIconLibraryActions(onChanged: () => void) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [uploaded, setUploaded] = useState<ItemIcon | null>(null);
    const run = async (operation: () => Promise<unknown>) => {
        setBusy(true); setError('');
        try {await operation(); onChanged(); return true;}
        catch (e) {setError(e instanceof Error ? e.message : '操作失败，请重试'); return false;}
        finally {setBusy(false);}
    };
    return {
        busy, error, uploaded,
        reset: () => {setError(''); setUploaded(null);},
        upload: (file: File, name: string) => run(async () => setUploaded(await uploadItemIcon(file, name))),
        rename: (id: string, name: string) => run(() => renameItemIcon(id, name)),
        remove: (id: string) => run(() => deleteItemIcon(id)),
    };
}
