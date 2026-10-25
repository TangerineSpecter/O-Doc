import {useCallback, useMemo, useRef, useState} from 'react';
import type {QuantVocabulary, VocabularyTerm, VocabularyDimension} from '../../../types/api/quantVocabulary';
import {quantApi} from '../../../api/quant';
import {createRequestKey} from '../../../utils/requestKey';
import {useQuantDraftRegistration, type QuantRegisterDraft} from '../../../hooks/useQuantNavigation';
import {Select} from '../../common/Select';
import {QuantButton, QuantField, QuantModal} from '../ui';
import {vocabularyDimensions} from './presentation';

export function TermEditor({collection, catalog, term, register, close, saved}: {collection: string; catalog: QuantVocabulary; term?: VocabularyTerm; register: QuantRegisterDraft; close: () => void; saved: () => void}) {
    const initial = useMemo<VocabularyTerm>(() => term || {id: 'mechanism:', dimension: 'mechanism', label: '', aliases: [], definition: '', active: true}, [term]);
    const [draft, setDraft] = useState(initial), [aliases, setAliases] = useState(initial.aliases.join('，'));
    const [reason, setReason] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    const previous = useRef({fingerprint: '', key: ''});
    const payload = {...draft, aliases: [...new Set(aliases.split(/[，,\n]/).map(value => value.normalize('NFKC').trim()).filter(Boolean))]};
    const serialized = JSON.stringify({term: payload, reason: reason.trim(), expectedRevisionId: catalog.currentReference.revisionId});
    const dirty = JSON.stringify(payload) !== JSON.stringify(initial) || reason !== '';
    const save = useCallback(async () => {
        setBusy(true); setError('');
        if (previous.current.fingerprint !== serialized) previous.current = {fingerprint: serialized, key: createRequestKey()};
        try {await quantApi.reviseVocabulary(collection, {...JSON.parse(serialized), requestKey: previous.current.key}); saved(); return true;}
        catch (cause) {setError(cause instanceof Error ? cause.message : '词表保存失败'); return false;}
        finally {setBusy(false);}
    }, [collection, serialized, saved]);
    const reset = useCallback(() => {setDraft(initial); setAliases(initial.aliases.join('，')); setReason('');}, [initial]);
    useQuantDraftRegistration('vocabulary-term', dirty, save, register, reset);
    const dimension = (value: VocabularyDimension) => setDraft({...draft, dimension: value, id: value + ':'});
    return <QuantModal title={term ? `修订分类：${term.label}` : '新增分类词条'} close={close} busy={busy}>
        <p className="text-sm leading-7 text-slate-500">AI 会自动匹配词条及别名。修订保留历史；稳定编码与含义用于跨设备追踪，含义变化请新增词条。</p>
        {error && <div role="alert" className="space-y-2 text-sm text-red-600"><p>{error}</p><QuantButton onClick={close}>返回词表核对新版本</QuantButton></div>}
        {!term && <><label className="block space-y-2 text-sm font-semibold"><span>分类维度</span><Select menuPortal value={draft.dimension} onChange={value => dimension(value as VocabularyDimension)} options={Object.entries(vocabularyDimensions).filter(([value]) => value !== 'evidence').map(([value, label]) => ({value, label}))}/></label><QuantField label="稳定编码" value={draft.id} onChange={id => setDraft({...draft, id})} placeholder={`${draft.dimension}:custom_name`}/></>}
        <QuantField label="规范名称" value={draft.label} onChange={label => setDraft({...draft, label})} required/>
        <QuantField label="别名（逗号分隔）" value={aliases} onChange={setAliases} placeholder="保留常见原词和其他语言写法"/>
        {term ? <div className="rounded-xl bg-slate-50 p-4 text-sm leading-7"><p>{term.definition}</p><p className="mt-1 break-all text-xs text-slate-400">{vocabularyDimensions[term.dimension]} · {term.id}</p></div> : <QuantField label="词条含义（保存后固定）" value={draft.definition} onChange={definition => setDraft({...draft, definition})} multiline rows={3} required/>}
        <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={draft.active} onChange={event => setDraft({...draft, active: event.target.checked})}/>启用此词条，供 AI 与别名匹配使用</label>
        <QuantField label="修订理由" value={reason} onChange={setReason} multiline rows={2} required/>
        <div className="flex justify-end gap-2"><QuantButton onClick={close} disabled={busy}>取消</QuantButton><QuantButton primary disabled={busy || !dirty || !draft.label.trim() || !draft.definition.trim() || !reason.trim()} onClick={() => void save()}>{busy ? '保存中…' : '保存词表新版本'}</QuantButton></div>
    </QuantModal>;
}
