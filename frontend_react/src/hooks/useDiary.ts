import {useCallback, useEffect, useState} from 'react';
import {deleteDiary, listDiary, saveDiary} from '../api/diary';
import type {DiaryDraft, DiaryEntry} from '../types/api/diary';
export function useDiary() {
    const [entries, setEntries] = useState<DiaryEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [revision, setRevision] = useState(0);
    useEffect(() => {
        const controller = new AbortController();
        listDiary(controller.signal).then(items => {if (!controller.signal.aborted) setEntries(items);}).catch(() => {
            if (!controller.signal.aborted) setError('日记加载失败，请重试');
        }).finally(() => {if (!controller.signal.aborted) setLoading(false);});
        return () => controller.abort();
    }, [revision]);
    const save = useCallback(async (draft: DiaryDraft, id?: string) => {
        const entry = await saveDiary(draft, id);
        setEntries(items => [entry, ...items.filter(item => item.diaryId !== entry.diaryId)]);
    }, []);
    const remove = useCallback(async (id: string) => {
        await deleteDiary(id);
        setEntries(items => items.filter(item => item.diaryId !== id));
    }, []);
    return {entries, loading, error, retry: () => {setLoading(true); setError(''); setRevision(n => n + 1);}, save, remove};
}
