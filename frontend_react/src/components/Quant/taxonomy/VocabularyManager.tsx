import {useCallback, useState} from 'react';
import {useQuantVocabulary} from '../../../hooks/useQuantVocabulary';
import type {QuantRegisterDraft} from '../../../hooks/useQuantNavigation';
import type {VocabularyTerm} from '../../../types/api/quantVocabulary';
import {quantDate} from '../../../utils/quant';
import {Select} from '../../common/Select';
import {QuantButton, QuantModal} from '../ui';
import {TermEditor} from './TermEditor';
import {vocabularyDimensions} from './presentation';

export function VocabularyManager({collection, close, changed, register, request}: {collection: string; close: () => void; changed: () => void; register: QuantRegisterDraft; request: (action: () => void) => void}) {
    const [revision, setRevision] = useState(''), [offset, setOffset] = useState(0);
    const state = useQuantVocabulary(collection, revision, offset);
    const [q, setQuery] = useState(''), [dimension, setDimension] = useState('');
    const [editing, setEditing] = useState<{term?: VocabularyTerm} | null>(null);
    const saved = useCallback(() => {setEditing(null); setRevision(''); state.reload(); changed();}, [state, changed]);
    const current = state.data;
    if (editing && current) return <TermEditor collection={collection} catalog={current} term={editing.term} register={register} close={() => request(() => {setEditing(null); state.reload();})} saved={saved}/>;
    const rows = current?.catalog.terms.filter(term => (!dimension || term.dimension === dimension) && (!q || [term.label, term.id, ...term.aliases].some(label => label.normalize('NFKC').toLowerCase().includes(q.normalize('NFKC').toLowerCase())))) || [];
    return <QuantModal title="分类词表与别名" close={close} wide>
        <div className="flex flex-wrap items-start justify-between gap-3"><p className="max-w-xl text-sm leading-7 text-slate-500">AI 分析自动引用词表，原始用词保留在候选中。别名只做明确匹配，一词多义时留待核对；修改词表不重写历史报告。</p><QuantButton primary disabled={!current || !!revision} onClick={() => setEditing({})}>新增词条</QuantButton></div>
        {state.loading ? <p role="status" className="text-sm text-slate-500">正在加载分类词表…</p> : state.error ? <div role="alert" className="space-y-3 text-sm text-red-600"><p>{state.error}</p><div className="flex gap-2"><QuantButton onClick={state.reload}>重试</QuantButton>{revision && <QuantButton onClick={() => setRevision('')}>查看当前词表</QuantButton>}</div></div> : current && <>
            {revision && <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-orange-50 p-3 text-sm"><span>正在查看历史词表，仅供对照</span><QuantButton onClick={() => setRevision('')}>返回当前词表</QuantButton></div>}
            <div className="grid gap-3 sm:grid-cols-[1fr_180px]"><input aria-label="搜索分类词条" value={q} onChange={event => setQuery(event.target.value)} placeholder="搜索规范名称、编码或别名" className="min-w-0 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-500"/><Select menuPortal value={dimension} onChange={setDimension} options={[{value: '', label: '全部维度'}, ...Object.entries(vocabularyDimensions).map(([value, label]) => ({value, label}))]}/></div>
            {current.ambiguities.length > 0 && <div className="rounded-xl bg-orange-50 p-4 text-sm leading-7"><strong className="font-medium">存在 {current.ambiguities.length} 组别名歧义</strong>{current.ambiguities.map(row => <p key={row.label}>{row.label} → {row.labels.join(' / ')}；AI 标签不会被强行归入其中一项。</p>)}</div>}
            <div className="divide-y divide-slate-100">{rows.length ? rows.map(term => <div key={term.id} className="flex items-start justify-between gap-3 py-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold text-slate-800">{term.label}</h3><span className="text-xs text-slate-400">{vocabularyDimensions[term.dimension]}{!term.active && ' · 已停用'}</span></div><p className="mt-1 break-words text-xs leading-6 text-slate-500">{term.aliases.length ? `别名：${term.aliases.join('、')}` : '无别名'}</p><p className="mt-1 text-xs leading-6 text-slate-500">{term.definition}</p></div>{term.dimension === 'evidence' ? <span className="shrink-0 text-xs text-slate-400">业务只读</span> : !revision && <QuantButton onClick={() => setEditing({term})}>修订</QuantButton>}</div>) : <p className="py-8 text-center text-sm text-slate-500">没有匹配词条，原始用词仍会保留。</p>}</div>
            {current.archivedConcepts.length > 0 && <details className="text-xs leading-7 text-slate-500"><summary>其他历史分支的稳定概念（{current.archivedConcepts.length}）</summary>{current.archivedConcepts.map(term => <p key={term.id}>{term.id} · {term.definition}</p>)}</details>}
            <details className="border-t border-slate-100 pt-4 text-sm"><summary className="cursor-pointer text-slate-500">词表修订历史 · {current.historyTotal} 次</summary><div className="mt-3 space-y-3">{current.history.map(row => <div key={row.id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 p-3"><div><p className="text-xs text-slate-400">{quantDate(row.createdAt)}{row.id === current.currentReference.revisionId && ' · 当前词表'}</p><p className="mt-1 text-sm leading-6">{row.reason}</p></div><QuantButton onClick={() => setRevision(row.id)}>查看词条</QuantButton></div>)}{!current.history.length && <p className="text-xs text-slate-400">当前使用内置词表 v1。</p>}<div className="flex justify-end gap-2"><QuantButton disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 20))}>上一页</QuantButton><QuantButton disabled={offset + current.history.length >= current.historyTotal} onClick={() => setOffset(offset + 20)}>下一页</QuantButton></div></div></details>
        </>}
    </QuantModal>;
}
