import {useEffect, useRef, useState} from 'react';
import {quantApi} from '../../../api/quant';
import type {QuantConfigurationPreview} from '../../../types/api/quantParameters';
import {QuantButton} from '../ui';
import {ParameterConfiguration} from './ParameterConfiguration';

export function ConfigurationPreview({collection, entryId, sourceId, document}: {collection: string; entryId: string; sourceId: string; document: string}) {
    const [result, setResult] = useState<{key: string; value?: QuantConfigurationPreview; error?: string; loading?: boolean} | null>(null);
    const controller = useRef<AbortController | null>(null);
    const key = JSON.stringify([collection, entryId, sourceId, document]);
    const current = result?.key === key ? result : null;
    useEffect(() => () => controller.current?.abort(), []);
    const preview = async () => {
        controller.current?.abort();
        const request = new AbortController(); controller.current = request;
        setResult({key, loading: true});
        try {
            const value = await quantApi.previewConfiguration(collection, entryId, {targetSourceId: sourceId, document}, request.signal);
            if (!request.signal.aborted) setResult({key, value});
        } catch (error) {if (!request.signal.aborted) setResult({key, error: error instanceof Error ? error.message : '配置预览失败'});}
    };
    return <div className="space-y-3"><QuantButton disabled={!sourceId || !document.trim() || current?.loading} onClick={() => void preview()}>{current?.loading ? '正在对照…' : '识别配置并对照源码'}</QuantButton>
        {current?.error && <p role="alert" className="text-sm text-red-600">{current.error}</p>}
        {current?.value && <ParameterConfiguration {...current.value}/>}
    </div>;
}
