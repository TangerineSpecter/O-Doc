import {useCallback, useEffect, useRef, useState, type MutableRefObject} from 'react';
import {learningApi} from '../api/learning';
import type {LearningSession} from '../types/api/learning';

export function useLessonSession(collId: string, session: LearningSession | null, flushRef: MutableRefObject<(() => Promise<void>) | null>, enabled = true) {
    const [text, setText] = useState(session?.draftText || '');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const live = useRef(session);
    const content = useRef(text);
    const dirty = useRef(false);
    const chain = useRef<Promise<void>>(Promise.resolve());
    const keys = useRef(new Map<string, string>());
    useEffect(() => {
        if (live.current?.id !== session?.id || (!dirty.current && session && session.revision >= (live.current?.revision ?? 0))) {
            live.current = session;
            content.current = session?.draftText || '';
            setText(content.current); dirty.current = false;
        }
    }, [session]);
    const save = useCallback(async () => {
        const persist = async () => {
            if (!dirty.current || !live.current) return;
            setSaving(true);
            const value = content.current;
            try {
                live.current = await learningApi.saveSession(collId, live.current.id, live.current.revision, value);
                dirty.current = value !== content.current;
                setError('');
            } catch (e) {setError(e instanceof Error ? e.message : '输入保存失败'); throw e;}
            finally {setSaving(false);}
        };
        const next = chain.current.catch(() => {}).then(persist);
        chain.current = next;
        await next;
    }, [collId]);
    useEffect(() => {
        if (!enabled) return;
        flushRef.current = save;
        return () => {flushRef.current = null;};
    }, [flushRef, save, enabled]);
    useEffect(() => {
        const timer = window.setTimeout(() => {void save().catch(() => {});}, 800);
        return () => window.clearTimeout(timer);
    }, [text, save]);
    useEffect(() => {
        const warn = (e: BeforeUnloadEvent) => {if (dirty.current) {e.preventDefault(); e.returnValue = '';}};
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, []);
    const action = async (type: 'advance' | 'turn' | 'help' | 'retry' | 'end', turnId?: string) => {
        await save();
        if (!live.current) return;
        const identity = `${live.current.id}:${type}:${turnId || ''}`;
        const key = keys.current.get(identity) || crypto.randomUUID();
        keys.current.set(identity, key);
        try {
            await learningApi.sessionAction(collId, live.current.id, live.current.revision, type, key, turnId);
            live.current = await learningApi.session(collId, live.current.id);
            keys.current.delete(identity);
            content.current = live.current.draftText; setText(content.current); dirty.current = false;
            setError('');
        } catch (e) {setError(e instanceof Error ? e.message : '操作失败'); throw e;}
    };
    return {text, error, saving, save, action,
        change: (value: string) => {content.current = value; dirty.current = true; setText(value);},
        reload: async () => {
            if (!live.current) return;
            live.current = await learningApi.session(collId, live.current.id);
            content.current = live.current.draftText; dirty.current = false; setText(content.current); setError('');
        }};
}
