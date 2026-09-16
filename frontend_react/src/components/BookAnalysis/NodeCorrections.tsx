import {useState} from 'react';
import {Select} from '../common/Select';
import {addReadingRelation, correctReadingNode, correctReadingProfile, correctReadingRelation, readingError, removeReadingRelation} from '../../api/bookAnalysis';
import type {ReadingEdge, ReadingNode} from '../../types/bookAnalysis';
import {relationLabels} from '../../utils/readingGraph';

interface Props {bookId: string; node: ReadingNode; nodes: ReadingNode[]; edges: ReadingEdge[]; onSaved: () => void}
export default function NodeCorrections({bookId, node, nodes, edges, onSaved}: Props) {
    const [editing, setEditing] = useState(false);
    const [name, setName] = useState(node.name);
    const [description, setDescription] = useState(node.correctionDescription ?? node.facts.find(fact => fact.status === 'user')?.description ?? '');
    const [descriptionChanged, setDescriptionChanged] = useState(false);
    const [aliases, setAliases] = useState(node.aliases.join('，'));
    const [profileAttribute, setProfileAttribute] = useState<'identity' | 'age' | 'occupation' | 'background' | 'behavior' | 'goal'>('identity');
    const [profileValue, setProfileValue] = useState('');
    const [profileTime, setProfileTime] = useState('');
    const [mergeInto, setMergeInto] = useState('');
    const [target, setTarget] = useState('');
    const [kind, setKind] = useState('related_to');
    const [label, setLabel] = useState('关联');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const options = [...new Map(nodes.filter(n => n.id !== node.id).map(n => [n.id, {value: n.id, label: n.name}])).values()];
    const save = async (operation: () => Promise<unknown>) => {
        setBusy(true); setError('');
        try {await operation(); setEditing(false); onSaved();}
        catch (err) {setError(readingError(err));}
        finally {setBusy(false);}
    };
    return <div className="border-t border-slate-100 pt-4">
        <button onClick={() => setEditing(v => !v)} className="text-xs font-medium text-orange-600">{editing ? '收起修正' : '修正内容与关系'}</button>
        {editing && <div className="mt-3 space-y-3"><p className="text-[11px] leading-5 text-slate-400">人工修正会单独保存。合并保留两者的原文与关联，不做身份猜测。</p><label className="block text-xs text-slate-500">名称<input value={name} maxLength={255} onChange={e => setName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm"/></label><label className="block text-xs text-slate-500">补充说明<textarea value={description} maxLength={4000} onChange={e => {setDescription(e.target.value); setDescriptionChanged(true);}} rows={3} className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm"/></label><label className="block text-xs text-slate-500">别名（逗号分隔）<input value={aliases} onChange={e => setAliases(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm"/></label>{node.kind === 'person' && <div className="rounded-lg border border-slate-100 p-2"><p className="mb-2 text-xs font-bold text-slate-700">补充画像属性</p><Select value={profileAttribute} options={[['identity', '身份'], ['age', '年龄'], ['occupation', '职业'], ['background', '背景'], ['behavior', '行为'], ['goal', '目标']].map(([value, title]) => ({value, label: title}))} onChange={value => setProfileAttribute(value as typeof profileAttribute)}/><input aria-label="画像属性内容" value={profileValue} maxLength={1200} onChange={event => setProfileValue(event.target.value)} placeholder="填写明确内容" className="mt-2 w-full rounded border border-slate-200 p-2 text-sm"/><input aria-label="画像属性时期" value={profileTime} maxLength={255} onChange={event => setProfileTime(event.target.value)} placeholder="时期或上下文（可选）" className="mt-2 w-full rounded border border-slate-200 p-2 text-sm"/><button disabled={busy || !profileValue.trim()} onClick={() => void save(() => correctReadingProfile(bookId, node.id, profileAttribute, profileValue.trim(), profileTime.trim()))} className="mt-2 rounded border border-orange-200 px-3 py-2 text-xs text-orange-700 disabled:opacity-40">保存画像属性</button></div>}<div><p className="mb-1 text-xs text-slate-500">合并到同类型节点</p><Select value={mergeInto} options={[{value: '', label: '不合并'}, ...options.filter(option => nodes.find(n => n.id === option.value)?.kind === node.kind)]} onChange={setMergeInto}/></div><button disabled={busy || !name.trim()} onClick={() => void save(() => correctReadingNode(bookId, node.id, {name, ...(descriptionChanged ? {description} : {}), aliases: aliases.split(/[，,\n]/).map(a => a.trim()).filter(Boolean), ...(mergeInto ? {mergeInto} : {})}))} className="rounded-lg bg-orange-500 px-3 py-2 text-xs text-white disabled:opacity-40">保存内容修正</button>
        <div className="border-t border-slate-100 pt-3"><h4 className="mb-2 text-xs font-bold text-slate-700">补充关联</h4><Select value={target} options={options} onChange={setTarget} placeholder="选择关联对象（可在图谱搜索加载）"/><div className="mt-2"><Select value={kind} options={Object.entries(relationLabels).map(([value, title]) => ({value, label: title}))} onChange={value => {setKind(value); setLabel(relationLabels[value]);}}/></div><input aria-label="关系说明" value={label} maxLength={255} onChange={e => setLabel(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 p-2 text-sm"/><button disabled={busy || !target || !label.trim()} onClick={() => void save(() => addReadingRelation(bookId, node.id, target, kind, label))} className="mt-2 rounded-lg border border-orange-200 px-3 py-2 text-xs text-orange-700 disabled:opacity-40">添加用户补充关系</button></div>
        <div className="space-y-2 border-t border-slate-100 pt-3">{edges.filter(edge => edge.origin !== 'derived' && (edge.source === node.id || edge.target === node.id)).map(edge => <RelationCorrection key={edge.id} edge={edge} names={new Map(nodes.map(n => [n.id, n.name]))} disabled={busy} onSave={(nextKind, nextLabel) => void save(() => correctReadingRelation(bookId, edge.id, nextKind, nextLabel))} onRemove={() => void save(() => removeReadingRelation(bookId, edge.id))}/>)}</div>
        </div>}{error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
    </div>;
}

function RelationCorrection({edge, names, disabled, onSave, onRemove}: {edge: ReadingEdge; names: Map<string, string>; disabled: boolean; onSave: (kind: string, label: string) => void; onRemove: () => void}) {
    const [editing, setEditing] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [label, setLabel] = useState(edge.label);
    const [kind, setKind] = useState(edge.kind);
    return <div className="rounded-lg border border-slate-100 p-2 text-xs text-slate-500"><p>{names.get(edge.source)} → {names.get(edge.target)}</p><p className="mt-1">{edge.label} · {edge.context.chapterTitle || '用户补充'}</p><div className="mt-2 flex gap-3"><button onClick={() => setEditing(v => !v)} className="text-orange-600">修改</button><button disabled={disabled} onClick={() => confirming ? onRemove() : setConfirming(true)} className="text-red-500">{confirming ? '确认移除关联' : '移除'}</button>{confirming && <button onClick={() => setConfirming(false)}>取消</button>}</div>{editing && <div className="mt-2 space-y-2"><Select value={kind} options={Object.entries(relationLabels).map(([value, title]) => ({value, label: title}))} onChange={setKind}/><input aria-label="修改关系说明" value={label} maxLength={255} onChange={e => setLabel(e.target.value)} className="w-full rounded border border-slate-200 p-2"/><button disabled={disabled || !label.trim()} onClick={() => onSave(kind, label)} className="text-orange-600">保存关系</button></div>}</div>;
}
