import {useEffect, useState} from 'react';
import {getTravelImageGenerationSettings} from '@/api/prompt';
import type {ImageGenerationSettings} from '@/types/api/prompt';

export function useTravelImageSettings(modelId?: string) {
    const [result, setResult] = useState<{modelId?: string; settings: ImageGenerationSettings | null; error: string}>({settings: null, error: ''});
    useEffect(() => {
        let cancelled = false;
        getTravelImageGenerationSettings(modelId).then(settings => {
            if (!cancelled) setResult({modelId, settings, error: ''});
        }).catch(() => {
            if (!cancelled) setResult({modelId, settings: null, error: '无法获取模型尺寸选项，请检查生图模型配置。'});
        });
        return () => { cancelled = true; };
    }, [modelId]);
    const current = result.modelId === modelId;
    return {settings: current ? result.settings : null, error: current ? result.error : '', loading: !current || (!result.settings && !result.error)};
}
