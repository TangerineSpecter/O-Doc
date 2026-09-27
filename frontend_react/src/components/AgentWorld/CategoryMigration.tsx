import { useEffect, useState } from 'react';
import { CircleAlert, X } from 'lucide-react';
import { getWorldCategories, previewWorldMigration, migrateWorldCategory } from '../../api/agentWorld';
import type { WorldCategory, MigrationPreview } from '../../types/api/agentWorld';

export function MigrationAlert({ onClick }: { onClick: () => void }) {
    return <button type="button" aria-label="手动迁移帖子分类" title="历史分类尚未关联当前分类，请手动迁移帖子分类" className="shrink-0 p-1.5 text-orange-500 hover:bg-orange-50 rounded" onClick={e => { e.stopPropagation(); onClick(); }}><CircleAlert size={18}/></button>;
}

export function CategoryMigration({ collectionId, oldCategory, postId, onClose, onComplete }: { collectionId: string; oldCategory: string; postId?: string; onClose: () => void; onComplete: () => void }) {
    const [categories, setCategories] = useState<WorldCategory[]>([]);
    const [preview, setPreview] = useState<MigrationPreview>();
    const [target, setTarget] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        let live = true;
        Promise.all([getWorldCategories(), previewWorldMigration(collectionId, oldCategory, postId)]).then(([items, scope]) => { if (live) { setCategories(items); setPreview(scope); } }).catch(e => { if (live) setError(e.message || '加载失败'); });
        return () => { live = false; };
    }, [collectionId, oldCategory, postId]);
    const submit = async () => {
        if (!preview || !target) return;
        setBusy(true); setError('');
        try { await migrateWorldCategory(collectionId, oldCategory, target, preview.token, postId); onComplete(); onClose(); }
        catch (e) { setError(e instanceof Error ? e.message : '迁移失败，请刷新后确认'); }
        finally { setBusy(false); }
    };
    return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-label="迁移帖子分类">
        <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
            <div className="flex justify-between"><h2 className="font-bold text-lg">迁移帖子分类</h2><button onClick={onClose} aria-label="关闭"><X size={20}/></button></div>
            <p className="my-3 text-sm text-orange-600">{categories.some(c => c.name === oldCategory) ? '历史分类尚未关联当前分类，请手动迁移帖子分类。' : '该帖子分类未在当前分类管理列表里面，请手动迁移帖子分类。'}</p>
            <p className="text-sm">旧分类：{oldCategory || '未分类'} · 影响 {preview?.count ?? '…'} 篇帖子</p>
            <ul className="my-3 max-h-44 overflow-auto text-sm text-slate-600">{preview?.posts.map(p => <li className="py-1" key={p.id}>{p.title}</li>)}</ul>
            <label className="block text-sm">目标分类<select className="mt-2 w-full border rounded p-2" value={target} onChange={e => setTarget(e.target.value)}><option value="">请选择启用分类</option>{categories.filter(c => c.enabled).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
            <div className="mt-5 flex justify-end gap-3"><button onClick={onClose}>取消</button><button disabled={busy || !target || !preview?.count} onClick={submit} className="rounded bg-orange-500 px-4 py-2 text-white disabled:opacity-40">{busy ? '正在迁移…' : '确认迁移'}</button></div>
        </div>
    </div>;
}
