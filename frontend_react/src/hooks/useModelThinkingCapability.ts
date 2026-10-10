import {useEffect, useState} from 'react';
import {getModelThinkingCapability} from '../api/setting';
import type {ModelType, ThinkingCapability, ThinkingProtocol} from '../types/api/setting';

export function useModelThinkingCapability(providerId: string, name: string, type: ModelType, protocol: ThinkingProtocol) {
    const key = JSON.stringify([providerId, name, type, protocol]);
    const [result, setResult] = useState<{key: string; data?: ThinkingCapability; error?: string}>();
    useEffect(() => {
        let active = true;
        const controller = new AbortController();
        const timer = setTimeout(async () => {
            try {
                const data = await getModelThinkingCapability(providerId, name, type, protocol, controller.signal);
                if (active) setResult({key, data});
            } catch (error) {
                if (active) setResult({key, error: error instanceof Error ? error.message : '无法确认模型思考能力'});
            }
        }, 200);
        return () => {active = false; clearTimeout(timer); controller.abort();};
    }, [providerId, name, type, protocol, key]);
    return {loading: result?.key !== key, data: result?.key === key ? result.data : undefined,
        error: result?.key === key ? result.error : undefined};
}
