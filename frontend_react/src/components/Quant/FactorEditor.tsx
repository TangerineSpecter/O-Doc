import {useQuantVocabulary} from '../../hooks/useQuantVocabulary';
import {vocabularyDimensions} from './taxonomy/presentation';
import {useCallback, useState} from 'react';
import {quantApi} from '../../api/quant';
import {useQuantDraftRegistration, type QuantRegisterDraft} from '../../hooks/useQuantNavigation';
import type {QuantFactorCandidate, QuantFactorCuration, QuantFactorFamily} from '../../types/api/quant';
import {quantDate} from '../../utils/quant';
import {Select} from '../common/Select';
import {QuantButton, QuantField, QuantModal} from './ui';
import {factorFamilies} from './factorPresentation';
import {tagTextForDisplay, tagTextForStorage} from '../../utils/quantTagLabels';

const labels = (text: string) => text.split(/[，,\n]/).map(value => value.trim()).filter(Boolean);
export function FactorEditor({collection, candidate: initialCandidate, register, close, saved}: {
    collection: string; candidate: QuantFactorCandidate; register: QuantRegisterDraft; close: () => void; saved: (candidate: QuantFactorCandidate) => void;
}) {
    const [candidate] = useState(initialCandidate);
    const [draft, setDraft] = useState(candidate.curation);
    const vocabulary = useQuantVocabulary(collection);
    const terms = vocabulary.data?.catalog.terms || [];
    const [tags, setTags] = useState(draft.tags.join('，'));
    const [aliases, setAliases] = useState(draft.aliases.join('，'));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const payload = {...draft, tags: labels(tags), aliases: labels(aliases)};
    const dirty = JSON.stringify(payload) !== JSON.stringify(candidate.curation);
    const serialized = JSON.stringify(payload);
    const save = useCallback(async () => {
        setBusy(true); setError('');
        try {
            const updated = await quantApi.reviseFactor(collection, candidate.id, JSON.parse(serialized) as QuantFactorCuration, candidate.currentRevisionId, candidate.curationRevisionId);
            saved(updated); return true;
        } catch (cause) {setError(cause instanceof Error ? cause.message : '修订保存失败，请重试'); return false;}
        finally {setBusy(false);}
    }, [collection, candidate.id, candidate.currentRevisionId, candidate.curationRevisionId, serialized, saved]);
    const reset = useCallback(() => {setDraft(candidate.curation); setTags(candidate.curation.tags.join('，')); setAliases(candidate.curation.aliases.join('，'));}, [candidate]);
    useQuantDraftRegistration('factor-curation', dirty, save, register, reset);
    const load = (data: QuantFactorCuration) => {setDraft(data); setTags(data.tags.join('，')); setAliases(data.aliases.join('，'));};
    return <QuantModal title="整理候选" close={close} busy={busy}>
        <p className="text-sm leading-6 text-slate-500">修订保存为独立版本。AI 原始公式、参数和来源保持可追溯；同组其他来源不会被批量改写。</p>
        {candidate.curationInherited && <p className="text-sm leading-6 text-slate-500">当前整理来自同一来源、算法内容完全相同的历史记录。下方仅列本记录的修订；保存会新增本记录修订，并用于这些相同算法记录的整理展示。</p>}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <QuantField label="显示名称" value={draft.name} onChange={name => setDraft({...draft, name})} required />
        <label className="block space-y-2 text-sm font-semibold"><span>机制分类</span><Select menuPortal value={draft.family} onChange={family => setDraft({...draft, family: family as QuantFactorFamily})} options={Object.entries(factorFamilies).map(([value, label]) => ({value, label}))} /></label>
        <QuantField label="别名（逗号分隔）" value={aliases} onChange={setAliases} placeholder="例如：区间涨幅，价格动量" />
        <QuantField label="标签（逗号分隔）" value={vocabulary.loading ? '' : tagTextForDisplay(tags, terms)}
            onChange={value => setTags(tagTextForStorage(value, terms, labels(tags)))} disabled={vocabulary.loading}
            placeholder={vocabulary.loading ? '正在加载标签名称…' : '趋势，波动率（逗号分隔）'} />
        <label className="block space-y-2 text-sm font-semibold"><span>从统一分类补充标签（可选）</span><Select menuPortal value="" onChange={value => {if (value && !labels(tags).includes(value)) setTags([...labels(tags), value].join('，'));}} options={[{value: '', label: vocabulary.loading ? '正在加载分类…' : '选择词条'}, ...(vocabulary.data?.catalog.terms || []).filter(term => term.active && term.dimension !== 'evidence').map(term => ({value: term.id, label: `${vocabularyDimensions[term.dimension]} · ${term.label}`}))]}/></label>
        {vocabulary.error && <p role="alert" className="text-xs text-red-600">{vocabulary.error} <button type="button" className="underline" onClick={vocabulary.reload}>重试</button></p>}
        <QuantField label="研究备注" value={draft.note} onChange={note => setDraft({...draft, note})} multiline rows={5} />
        <details className="text-sm"><summary className="cursor-pointer text-slate-500">原始标签与修订历史（{candidate.revisions.length}）</summary><div className="mt-3 space-y-3">
            <div className="rounded-xl border border-slate-200 p-3"><p>AI 原始：{candidate.data.name} · {candidate.data.tags.map(tag => tagTextForDisplay(tag, terms)).join(' / ')}</p><QuantButton className="mt-2" onClick={() => load({name: candidate.data.name, family: candidate.data.family, tags: candidate.data.tags, aliases: [], note: ''})}>以原始标签编辑</QuantButton></div>
            {[...candidate.revisions].reverse().map(revision => <div key={revision.id} className="rounded-xl border border-slate-200 p-3"><p>{quantDate(revision.createdAt)} · {revision.data.name}</p><p className="my-2 whitespace-pre-wrap text-xs leading-6 text-slate-500">{revision.data.tags.map(tag => tagTextForDisplay(tag, terms)).join(' / ')}<br />{revision.data.note}</p><QuantButton onClick={() => load(revision.data)}>以此版本编辑</QuantButton></div>)}
        </div></details>
        <div className="flex justify-end gap-3"><QuantButton disabled={busy} onClick={close}>取消</QuantButton><QuantButton primary disabled={busy || !dirty || !draft.name.trim()} onClick={() => void save()}>{busy ? '保存中…' : '保存修订'}</QuantButton></div>
    </QuantModal>;
}
