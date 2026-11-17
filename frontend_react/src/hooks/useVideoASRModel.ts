import {useEffect, useRef, useState} from 'react';
import {downloadVideoASRModel, getVideoASRStatus} from '../api/videoAsr';
import type {VideoASRStatus} from '../types/api/videoAsr';

export function useVideoASRModel() {
    const [status, setStatus] = useState<VideoASRStatus | null>(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [revision, setRevision] = useState(0);
    const mounted = useRef(true);
    const submitting = useRef(false);
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);
    useEffect(() => {
        let active = true;
        let timer: ReturnType<typeof setTimeout>;
        async function load() {
            try {
                const next = await getVideoASRStatus();
                if (!active) return;
                setStatus(next);
                setError('');
                if (next.state === 'downloading' || next.state === 'verifying') timer = setTimeout(load, 1500);
            } catch (e) {
                if (active) setError(e instanceof Error ? e.message : '读取模型状态失败');
            }
        }
        void load();
        return () => { active = false; clearTimeout(timer); };
    }, [revision]);
    async function download() {
        if (submitting.current) return;
        submitting.current = true;
        setBusy(true);
        setError('');
        try {
            const next = await downloadVideoASRModel();
            if (mounted.current) {
                setStatus(next);
                setRevision(value => value + 1);
            }
        } catch (e) {
            if (mounted.current) setError(e instanceof Error ? e.message : '启动下载失败');
        } finally {
            submitting.current = false;
            if (mounted.current) setBusy(false);
        }
    }
    return {status, error, busy, download, refresh: () => setRevision(value => value + 1)};
}
