import {useEffect, useMemo, useState} from 'react';
import {quantApi} from '../api/quant';
import type {QuantExecutionPreviewInput} from '../types/api/quantPlatformEvidence';
import {readExecutionPreview, executionPreviewKey} from '../utils/quantPlatformEvidence';

/** A successful preview belongs to the exact draft and selection, including A → B → A. */
export function useQuantPlatformEvidence(collection: string, entryId: string, input: QuantExecutionPreviewInput | undefined, context: string) {
    const draftKey = input ? executionPreviewKey(collection, entryId, input.document, input.executionAdapter, input.executionOptionsJson, context) : '';
    const selection = useMemo(() => ({key: draftKey}), [draftKey]);
    const [requested, setRequested] = useState<{selection: typeof selection; attempt: number} | null>(null);
    const [result, setResult] = useState<{attempt: number; json: string; error: string}>({attempt: 0, json: '', error: ''});
    const document = input?.document, adapter = input?.executionAdapter, options = input?.executionOptionsJson;
    useEffect(() => {
        if (!requested || requested.selection !== selection || !document || !adapter || !options) return;
        const abort = new AbortController();
        void quantApi.previewExecution(collection, entryId, {document, executionAdapter: adapter, executionOptionsJson: options}, abort.signal).then(value => {
            readExecutionPreview(value.previewJson, adapter);
            if (!abort.signal.aborted) setResult({attempt: requested.attempt, json: value.previewJson, error: ''});
        }).catch(cause => {if (!abort.signal.aborted) setResult({attempt: requested.attempt, json: '', error: cause instanceof Error ? cause.message : '执行证据核算失败'});});
        return () => abort.abort();
    }, [collection, entryId, document, adapter, options, selection, requested]);
    const started = requested?.selection === selection;
    const loading = !!started && requested?.attempt !== result.attempt;
    const json = started && !loading ? result.json : '';
    return {started, loading, json, error: started && !loading ? result.error : '', valid: !!json,
        preview: () => setRequested(previous => ({selection, attempt: (previous?.attempt || 0) + 1}))};
}
