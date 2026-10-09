import {useCallback, useEffect, useRef, useState} from 'react';
import {learningApi} from '../api/learning';
import type {CourseData, Exercise} from '../types/api/learning';

export function useLearning(collId: string, exerciseId?: string) {
    const [course, setCourse] = useState<CourseData | null>(null);
    const [exercise, setExercise] = useState<Exercise | null>(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const scope = useRef(0);
    const controller = useRef<AbortController | null>(null);
    const refresh = useCallback(async () => {
        controller.current?.abort();
        const abort = new AbortController();
        controller.current = abort;
        const ticket = ++scope.current;
        try {
            const [c, ex] = await Promise.all([learningApi.course(collId, abort.signal), exerciseId ? learningApi.exercise(collId, exerciseId, abort.signal) : Promise.resolve(null)]);
            if (ticket === scope.current) {setCourse(c); setExercise(ex); setError('');}
        } catch (e) {
            if (!abort.signal.aborted && ticket === scope.current) setError(e instanceof Error ? e.message : '学习数据加载失败');
        }
    }, [collId, exerciseId]);
    useEffect(() => {
        const initial = window.setTimeout(() => {void refresh();}, 0);
        const timer = window.setInterval(() => {if (!document.hidden) void refresh();}, 4000);
        const visible = () => {if (!document.hidden) void refresh();};
        document.addEventListener('visibilitychange', visible);
        return () => {window.clearTimeout(initial); window.clearInterval(timer); document.removeEventListener('visibilitychange', visible); controller.current?.abort();};
    }, [refresh]);
    const run = async (work: () => Promise<unknown>) => {
        if (busy) return;
        setBusy(true); setError('');
        try {await work(); await refresh();} catch (e) {setError(e instanceof Error ? e.message : '操作失败，请重试');}
        finally {setBusy(false);}
    };
    return {course, exercise, error, busy, refresh, run};
}
