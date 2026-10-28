import {useCallback, useEffect, useRef, useState} from 'react';
import {novelApi} from '../api/novel';
import type {Chapter, Novel, Resource, Run, RunKind} from '../types/api/novel';
import {candidateCanReplace} from '../utils/novelEditor';

export function useNovel(id: string) {
    const [novel, setNovel] = useState<Novel | null>(null);
    const [chapter, setChapter] = useState<Chapter | null>(null);
    const [text, setText] = useState('');
    const [run, setRun] = useState<Run | null>(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const selected = useRef('');
    const pending = useRef(0);
    const currentText = useRef(text); currentText.current = text;
    const safe = useCallback(async <T,>(operation: () => Promise<T>): Promise<T | undefined> => {
        pending.current += 1; setBusy(true); setError('');
        try {return await operation();} catch (e) {setError(e instanceof Error ? e.message : '操作失败，请重试');} finally {pending.current -= 1;setBusy(pending.current > 0);}
    }, []);
    const refresh = useCallback(async () => {
        const data = await novelApi.get(id); setNovel(data); return data;
    }, [id]);
    useEffect(() => {void safe(async () => {const data = await refresh(); setRun(data.runs.find(r => ['running', 'pending'].includes(r.status)) || data.runs[0] || null);});}, [safe, refresh]);
    const select = useCallback(async (cid: string) => safe(async () => {
        selected.current = cid;
        const data = await novelApi.chapter(id, cid);
        if (selected.current !== cid) return;
        setChapter(data); setText(data.draft?.content || '');
    }), [id, safe]);
    const updateChapter = (data: Chapter, preserveEditor = false) => {
        setChapter(data); if (!preserveEditor) setText(data.draft?.content || '');
        setNovel(n => n ? {...n, chapters: [...n.chapters.filter(c => c.id !== data.id), data].sort((a, b) => a.position - b.position)} : n);
    };
    useEffect(() => {
        if (!run || !['pending', 'running'].includes(run.status)) return;
        let cancelled = false;
        const timer = window.setInterval(async () => {
            if (document.hidden) return;
            try {
                const next = await novelApi.poll(id, run.id);
                if (cancelled) return;
                setRun(next);
                if (!['pending', 'running'].includes(next.status)) {
                    await refresh();
                    if (next.kind === 'review' && selected.current === next.chapterId) {
                        const data = await novelApi.chapter(id, selected.current);
                        // Preserve edits typed during the check; only attach the review.
                        setChapter(c => c && c.draftId === data.draftId ? {...c, review: data.review} : c);
                    }
                }
            } catch (e) {if (!cancelled) setError(e instanceof Error ? e.message : '任务状态读取失败');}
        }, 1200);
        return () => {cancelled = true; window.clearInterval(timer);};
    }, [id, run?.id, run?.status, refresh]);
    const save = () => safe(async () => {
        if (!chapter) return;
        const captured = currentText.current;
        const data = await novelApi.save(id, {content: captured, baseRevisionId: chapter.draftId}, chapter.id);
        if (selected.current === chapter.id) setChapter(data);
        // Saving an earlier editor snapshot cannot erase a newer local edit.
        if (selected.current === chapter.id && currentText.current === captured) setText(data.draft?.content || '');
        await refresh();
        return data;
    });
    const saveBeforeLeave = async () => {
        const data = await save();
        return !!data && currentText.current === (data.draft?.content || '');
    };
    const generate = (kind: RunKind, input: Record<string, unknown> = {}) => safe(async () => {
        const chapterKinds = ['generate', 'rewrite', 'continue', 'polish', 'scene', 'story', 'review'];
        if (chapterKinds.includes(kind) && (!chapter || currentText.current !== (chapter.draft?.content || ''))) throw new Error('请先保存当前正文，再启动任务');
        setRun(await novelApi.run(id, kind, {...input, ...(chapterKinds.includes(kind) ? {chapterId: chapter!.id, baseRevisionId: chapter!.draftId} : {})}));
    });
    const action = (name: string, input: Record<string, unknown> = {}) => safe(async () => {
        if (!chapter) return;
        if (name !== 'unpublish' && currentText.current !== (chapter.draft?.content || '')) throw new Error('当前有未保存内容，请先保存');
        if (name === 'candidate' && run && !candidateCanReplace(run.baseRevisionId, chapter.draftId, chapter.draft?.content || '', text)) throw new Error('正文已变化，请对比候选并手动合并');
        const captured = currentText.current;
        const data = await novelApi.action(id, chapter.id, name, input);
        if (selected.current === chapter.id) updateChapter(data, name === 'unpublish' || currentText.current !== captured);
        await refresh(); return true;
    });
    const patch = (data: Record<string, unknown>) => safe(async () => {setNovel(await novelApi.patch(id, data)); return true;});
    const resource = (type: Resource, data: Record<string, unknown>, rid?: string) => safe(async () => {setNovel(await novelApi.resource(id, type, data, rid)); return true;});
    const remove = (type: Resource, rid: string) => safe(async () => {setNovel(await novelApi.remove(id, type, rid)); return true;});
    const runAction = (name: string) => safe(async () => {
        if (!run) return;
        const data = await novelApi.runAction(id, run.id, name);
        if ('chapters' in data) setNovel(data); else setRun(data); return true;
    });
    const createChapter = () => safe(async () => {
        if (chapter && currentText.current !== (chapter.draft?.content || '')) throw new Error('请先保存当前正文，再新建章节');
        const data = await novelApi.save(id, {title: `第 ${(novel?.chapters.length || 0) + 1} 章`, position: (Math.max(0, ...(novel?.chapters.map(c => c.position) || []))) + 1});
        selected.current = data.id; updateChapter(data); await refresh();
    });
    const deleteChapter = () => safe(async () => {
        if (!chapter) return;
        if (currentText.current !== (chapter.draft?.content || '')) throw new Error('请先保存当前正文，再移除章节');
        await novelApi.deleteChapter(id, chapter.id);
        selected.current = '';setChapter(null);setText('');await refresh();return true;
    });
    return {novel, chapter, text, setText, run, setRun, error, busy, safe, refresh, select, save, saveBeforeLeave, generate, action, patch, resource, remove, runAction, createChapter, deleteChapter, updateChapter};
}
export type NovelController = ReturnType<typeof useNovel>;
