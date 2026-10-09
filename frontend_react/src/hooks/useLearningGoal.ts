import {useEffect, useRef, useState} from 'react';
import {learningApi} from '../api/learning';
import type {GoalProposal, LearningSubject} from '../types/api/learning';

export function useLearningGoal(collId: string, subject: string) {
    const [subjects, setSubjects] = useState<LearningSubject[]>([]);
    const [selected, setSelected] = useState<string[]>([]);
    const [supplement, setSupplement] = useState('');
    const [proposal, setProposal] = useState<GoalProposal | null>(null);
    const [dirty, setDirty] = useState(false);
    const [loading, setLoading] = useState(true);
    const [preparing, setPreparing] = useState(false);
    const [error, setError] = useState('');
    const revision = useRef(0);
    const requestKey = useRef<string | null>(null);
    const proposalId = proposal?.id;
    const pending = !!proposal && ['pending', 'running'].includes(proposal.status);
    useEffect(() => {
        const controller = new AbortController();
        Promise.all([learningApi.goal(collId, undefined, controller.signal), learningApi.catalog(controller.signal)]).then(([value, catalog]) => {
            if (controller.signal.aborted) return;
            setSubjects(catalog.subjects);
            if (revision.current) return;
            if (value && value.subject === subject) {
                const definition = catalog.subjects.find(s => s.id === subject);
                setSelected([...new Set(value.selected.map(id => definition?.legacyDirections[id] || id))]); setSupplement(value.supplement);
                if (value.status !== 'confirmed') {setProposal(value); setDirty(true); setError(value.error);}
            }
        }).catch(() => {if (!controller.signal.aborted) setError('目标记录加载失败，可以重新选择并整理。');}).finally(() => {if (!controller.signal.aborted) setLoading(false);});
        return () => controller.abort();
    }, [collId, subject]);
    useEffect(() => {
        if (!pending || !proposalId) return;
        const controller = new AbortController();
        const timer = window.setInterval(() => {
            learningApi.goal(collId, proposalId, controller.signal).then(value => {
                if (value && !controller.signal.aborted) {setProposal(value); setError(value.error);}
            }).catch(() => {if (!controller.signal.aborted) setError('查询目标状态失败，正在重试；关闭后可继续查看。');});
        }, 2000);
        return () => {controller.abort(); window.clearInterval(timer);};
    }, [collId, pending, proposalId]);
    const change = (values: string[], extra: string) => {
        revision.current++; requestKey.current = null;
        setSelected(values); setSupplement(extra); setProposal(null); setDirty(true); setError('');
    };
    const prepare = async (modelId: string, style: string) => {
        if (preparing || pending) return;
        if (!modelId) {setError('请先选择老师模型。'); return;}
        setPreparing(true); setError('');
        if (proposal && ['failed', 'rejected'].includes(proposal.status)) requestKey.current = null;
        requestKey.current ||= crypto.randomUUID();
        try {
            const value = await learningApi.prepareGoal(collId, selected, supplement, modelId, style, requestKey.current, subject);
            setProposal(value); setDirty(true); setError(value.error);
        } catch (err) {setError(err instanceof Error ? err.message : '整理目标失败，请重试');}
        finally {setPreparing(false);}
    };
    return {subjects, selected, supplement, proposal, dirty, busy: loading || preparing || pending, error, change, prepare};
}
