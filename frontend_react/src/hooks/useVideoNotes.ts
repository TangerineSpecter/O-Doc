import {useEffect, useRef, useState} from 'react';
import {createVideoJob, listVideoJobs, retryVideoJob, uploadVideo} from '../api/videoNote';
import type {VideoNoteJob} from '../types/api/videoNote';
import {createRequestKey} from '../utils/requestKey';

export function useVideoNotes(collId: string) {
    const [jobs, setJobs] = useState<VideoNoteJob[]>([]);
    const [text, setText] = useState('');
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [revision, setRevision] = useState(0);
    const draft = useRef({text: '', id: ''});
    const lock = useRef(false);

    useEffect(() => {
        let active = true;
        let timer: ReturnType<typeof setTimeout>;
        async function load() {
            try {
                const rows = await listVideoJobs(collId);
                if (!active) return;
                setJobs(rows);
                if (rows.some(job => job.state === 'queued' || job.state === 'running')) {
                    timer = setTimeout(load, 2200);
                }
            } catch (e) {
                if (active) setError(e instanceof Error ? e.message : '读取任务失败');
            } finally {
                if (active) setLoading(false);
            }
        }
        void load();
        return () => { active = false; clearTimeout(timer); };
    }, [collId, revision]);

    async function act(fn: () => Promise<VideoNoteJob>) {
        if (lock.current) return;
        lock.current = true;
        setBusy(true);
        setError('');
        try {
            const job = await fn();
            setJobs(prev => [job, ...prev.filter(j => j.id !== job.id)]);
            setRevision(r => r + 1);
        } catch (e) {
            setError(e instanceof Error ? e.message : '操作失败，请重试');
        } finally {
            lock.current = false;
            setBusy(false);
        }
    }
    function submit() {
        if (draft.current.text !== text) draft.current = {text, id: createRequestKey()};
        return act(async () => {
            const job = await createVideoJob(collId, text.trim(), draft.current.id);
            setText('');
            draft.current = {text: '', id: ''};
            return job;
        });
    }
    function upload(id: string, file: File) {
        if (!file.size || file.size > 512 * 1024 ** 2) {
            setError('请选择 512 MiB 以内的视频文件');
            return;
        }
        return act(() => uploadVideo(id, file));
    }
    return {jobs, loading, busy, error, text, setText, submit, upload,
        retry: (id: string) => act(() => retryVideoJob(id)),
        refresh: () => { setError(''); setRevision(r => r + 1); }};
}
