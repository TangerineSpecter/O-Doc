import {useCallback, useEffect, useRef, useState} from 'react';

/** Independent resources keep their own failure and saving state. Unknown is never disabled. */
export function useActivityConfiguration<T>(read: () => Promise<T>, write: (value: T) => Promise<T>) {
    const [value, setValue] = useState<T | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [revision, setRevision] = useState(0);
    const lock = useRef(false);
    const generation = useRef(0);
    const reload = useCallback(() => setRevision(v => v + 1), []);
    useEffect(() => {
        const current = ++generation.current;
        setLoading(true);
        void read().then(result => {
            if (current === generation.current) {setValue(result); setError('');}
        }).catch(caught => {
            if (current === generation.current) setError(caught instanceof Error ? caught.message : '配置加载失败');
        }).finally(() => {if (current === generation.current) setLoading(false);});
        return () => {generation.current += 1;};
    }, [read, revision]);
    const save = async (next: T) => {
        if (lock.current || loading) return;
        lock.current = true;
        const current = generation.current;
        setSaving(true); setError('');
        try {
            const result = await write(next);
            if (current === generation.current) setValue(result);
        } catch (caught) {
            if (current === generation.current) setError(caught instanceof Error ? caught.message : '配置保存失败');
        } finally {lock.current = false; if (current === generation.current) setSaving(false);}
    };
    return {value, loading, saving, error, reload, save};
}
