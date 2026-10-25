import {useState} from 'react';
import {quantApi} from '../../../api/quant';
import type {QuantComparison, QuantFactorMerge} from '../../../types/api/quantComparison';
import {createRequestKey} from '../../../utils/requestKey';
import {useQuantDraftRegistration, type QuantRegisterDraft} from '../../../hooks/useQuantNavigation';
import {QuantButton, QuantField, QuantModal} from '../ui';

export function MergeActionDialog({collection, comparison, merge, register, close, saved}: {
    collection: string; comparison?: QuantComparison; merge?: QuantFactorMerge; register: QuantRegisterDraft;
    close: () => void; saved: () => void;
}) {
    const [name, setName] = useState(comparison?.name || ''), [reason, setReason] = useState('');
    const [key, setKey] = useState(createRequestKey), [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
    useQuantDraftRegistration('factor-merge-action', dirty, undefined, register);
    const change = () => {setDirty(true); setKey(createRequestKey());};
    const submit = async () => {
        if (busy || !reason.trim() || (!merge && !name.trim())) return;
        setBusy(true); setError('');
        try {
            if (reason.length > 3000 || (!merge && name.trim().length > 200)) throw new Error('名称最多 200 字符，原因最多 3000 字符');
            if (merge) await quantApi.withdrawFactorMerge(collection, merge.id, {requestKey: key, reason});
            else if (comparison) await quantApi.mergeFactors(collection, {requestKey: key, comparisonId: comparison.id, name, reason});
            setDirty(false); saved();
        } catch (cause) {setError(cause instanceof Error ? cause.message : '操作失败，输入仍保留');}
        finally {setBusy(false);}
    };
    return <QuantModal title={merge ? '撤销这条逻辑合并' : '按这份证据建立逻辑分组'} close={close} busy={busy}><fieldset disabled={busy} className="space-y-5">
        <p className="text-sm leading-7 text-slate-600">{merge ? '只撤销当前这条合并关系。其他主动关系仍有效，连通分组会重新计算；原候选、别名、来源和历史对照均保留。' : '这份 pass 只说明固定行情、参数和容差下的输出一致。你将建立可撤销的逻辑分组；每条证据单独保留，不推导其他成员两两等价。'}</p>
        {!merge && <QuantField label="逻辑分组名称" value={name} onChange={value => {change(); setName(value);}} required/>}
        <QuantField label={merge ? '撤销原因' : '合并依据与说明'} multiline value={reason} onChange={value => {change(); setReason(value);}} required/>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-3"><QuantButton disabled={busy} onClick={close}>取消</QuantButton><QuantButton primary disabled={busy || !reason.trim() || (!merge && !name.trim())} onClick={() => void submit()}>{busy ? '正在保存…' : merge ? '撤销这条合并' : '建立逻辑分组'}</QuantButton></div>
    </fieldset></QuantModal>;
}
