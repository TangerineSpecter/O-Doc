import {useEffect, useState} from 'react';
import {getCategoryList, type CategoryItem} from '../../api/category';
import {getAnthologyList, type Anthology} from '../../api/anthology';
import {updateArticle} from '../../api/article';
import type {ArticleProps} from './ArticleReader';
import {useAuth} from '../../contexts/AuthContext';
import {useEscapeDismissal} from '../../hooks/useEscapeDismissal';

interface Props {note: ArticleProps; onClose: () => void; onSaved: (collId: string) => void}
export default function HtmlNoteMetadataModal({note, onClose, onSaved}: Props) {
    const {userInfo} = useAuth();
    const [title, setTitle] = useState(note.title || '');
    const [categoryId, setCategoryId] = useState(note.categoryId || '');
    const [collId, setCollId] = useState(note.collId || '');
    const [tags, setTags] = useState((note.tags || []).join('，'));
    const [permission, setPermission] = useState<'public' | 'private'>(note.permission || 'public');
    const [categories, setCategories] = useState<CategoryItem[]>([]);
    const [collections, setCollections] = useState<Anthology[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    useEscapeDismissal(true, () => {if (!busy) onClose();});
    useEffect(() => {
        let active = true;
        Promise.all([getCategoryList(), getAnthologyList('article')]).then(([cats, colls]) => {
            if (active) {setCategories(cats); setCollections(colls);}
        }).catch(reason => {if (active) setError(reason instanceof Error ? reason.message : '资料加载失败');})
            .finally(() => {if (active) setLoading(false);});
        return () => {active = false;};
    }, []);
    const save = async () => {
        if (!note.articleId || !title.trim() || !collId) return;
        setBusy(true); setError('');
        try {
            await updateArticle(note.articleId, {title: title.trim(), categoryId, collId, permission, tags: tags.split(/[,，]/).map(t => t.trim()).filter(Boolean)});
            onSaved(collId);
        } catch (reason) {setError(reason instanceof Error ? reason.message : '保存失败');}
        finally {setBusy(false);}
    };
    const inputClass = 'mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none';
    return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/30 p-4">
        <form role="dialog" aria-modal="true" aria-label="编辑笔记资料" onSubmit={event => {event.preventDefault(); void save();}} className="w-full max-w-md space-y-4 rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-slate-800">编辑笔记资料</h2>
            <label className="block text-sm text-slate-600">标题<input autoFocus required maxLength={255} className={inputClass} value={title} onChange={e => setTitle(e.target.value)}/></label>
            <label className="block text-sm text-slate-600">分类<select className={inputClass} value={categoryId} onChange={e => setCategoryId(e.target.value)}><option value="">未分类</option>{categories.map(c => <option key={c.categoryId} value={c.categoryId}>{c.name}</option>)}</select></label>
            <label className="block text-sm text-slate-600">文集<select required className={inputClass} value={collId} onChange={e => setCollId(e.target.value)}>{collections.filter(c => c.userId === userInfo?.userid || (c.userId === 'admin' && userInfo?.username === 'admin') || c.collId === note.collId).map(c => <option key={c.collId} value={c.collId}>{c.title}</option>)}</select></label>
            <label className="block text-sm text-slate-600">标签<input className={inputClass} value={tags} onChange={e => setTags(e.target.value)} placeholder="用逗号分隔"/></label>
            <label className="block text-sm text-slate-600">权限<select className={inputClass} value={permission} onChange={e => setPermission(e.target.value as 'public' | 'private')}><option value="public">公开</option><option value="private">私有</option></select></label>
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-3"><button type="button" disabled={busy} onClick={onClose} className="text-sm text-slate-500">取消</button><button disabled={busy || loading || !title.trim()} className="rounded-lg bg-orange-500 px-4 py-2 text-sm text-white disabled:opacity-50">{busy ? '保存中…' : '保存'}</button></div>
        </form>
    </div>;
}
