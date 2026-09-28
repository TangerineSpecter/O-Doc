import {useEffect, useState} from 'react';
import {getAgentRunRecord} from '../api/setting';
import type {AgentRunRecordConfig} from '../types/api/setting';

export function useAgentRunRecord(id?: string | null) {
    const [record, setRecord] = useState<AgentRunRecordConfig | null>(null);
    const [error, setError] = useState('');
    useEffect(() => {
        let live = true, inFlight = false;
        setRecord(null); setError('');
        if (!id) return;
        const reload = async () => {
            if (inFlight) return;
            inFlight = true;
            try {
                const value = await getAgentRunRecord(id);
                if (live) {setRecord(value); setError('');}
            } catch (e) {
                if (live) setError(e instanceof Error ? e.message : '执行详情刷新失败');
            } finally {inFlight = false;}
        };
        void reload();
        const timer = setInterval(() => {void reload();}, 10000);
        return () => {live = false; clearInterval(timer);};
    }, [id]);
    return {record, error};
}
