import {useEffect, useState} from 'react';
import type {QuantController} from '../../../hooks/useQuant';
import type {QuantSource} from '../../../types/api/quant';
import {quantError} from '../../../utils/quant';
import {ExecutionEvidence} from '../feedback/evidence/ExecutionEvidence';
import {QuantButton} from '../ui';

export function ReportExecutionEvidence({sourceId, ensureSource}: {
    sourceId: string; ensureSource: QuantController['ensureSource'];
}) {
    const [open, setOpen] = useState(false);
    const [source, setSource] = useState<QuantSource | null>(null);
    const [error, setError] = useState('');
    const [retry, setRetry] = useState(0);
    useEffect(() => {
        if (!open) return;
        const abort = new AbortController();
        void ensureSource(sourceId, abort.signal).then(value => {
            if (!abort.signal.aborted) {setSource(value); setError('');}
        }).catch(cause => {
            if (!abort.signal.aborted) setError(quantError(cause));
        });
        return () => abort.abort();
    }, [open, sourceId, ensureSource, retry]);
    return <details className="rounded-xl border border-slate-200 p-4" onToggle={event => setOpen(event.currentTarget.open)}>
        <summary className="cursor-pointer text-sm font-semibold text-slate-700">完整执行证据与核算</summary>
        {open && <div className="mt-4">
            {error ? <p role="alert">{error}<QuantButton onClick={() => {setError(''); setRetry(n => n + 1);}}>重试</QuantButton></p>
                : source ? source.payload.executionPreviewJson
                    ? <ExecutionEvidence json={source.payload.executionPreviewJson}/>
                    : <p className="text-sm text-slate-500">该来源未保存完整执行证据。</p>
                : <p role="status">正在读取执行证据…</p>}
        </div>}
    </details>;
}
