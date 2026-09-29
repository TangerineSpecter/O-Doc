import {useEffect, useRef, useState} from 'react';
import {generateProfessionDescription, type ProfessionDescriptionInput} from '../api/agentWorld';

export function useProfessionDescription() {
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState('');
    const pending = useRef<AbortController | null>(null);
    useEffect(() => () => pending.current?.abort(), []);
    const generate = async (input: ProfessionDescriptionInput, apply: (description: string) => void) => {
        if (pending.current) return;
        const controller = new AbortController();
        pending.current = controller;
        setGenerating(true); setError('');
        try {
            const result = await generateProfessionDescription(input, controller.signal);
            if (!controller.signal.aborted) apply(result.description);
        } catch (failure) {
            if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : '职业说明生成失败');
        } finally {
            if (!controller.signal.aborted) setGenerating(false);
            if (pending.current === controller) pending.current = null;
        }
    };
    return {generate, generating, error};
}
