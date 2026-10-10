import { useEffect, useMemo, useState } from 'react';
import { CircleAlert, FolderSync, X } from 'lucide-react';
import { getWorldCategories, previewWorldMigration, migrateWorldCategory } from '../../api/agentWorld';
import type { WorldCategory, MigrationPreview } from '../../types/api/agentWorld';
import { Select, type SelectOption } from '../common/Select';
import { useEscapeDismissal } from '../../hooks/useEscapeDismissal';

export function MigrationAlert({ onClick }: { onClick: () => void }) {
    return (
        <button
            type="button"
            aria-label="手动迁移帖子分类"
            title="历史分类尚未关联当前分类，请手动迁移帖子分类"
            className="shrink-0 p-1.5 text-orange-500 hover:bg-orange-50 rounded-lg transition-colors"
            onClick={e => {
                e.stopPropagation();
                onClick();
            }}
        >
            <CircleAlert size={18} />
        </button>
    );
}

export function CategoryMigration({
    collectionId,
    oldCategory,
    postId,
    onClose,
    onComplete,
}: {
    collectionId: string;
    oldCategory: string;
    postId?: string;
    onClose: () => void;
    onComplete: () => void;
}) {
    const [categories, setCategories] = useState<WorldCategory[]>([]);
    const [preview, setPreview] = useState<MigrationPreview>();
    const [target, setTarget] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    useEscapeDismissal(true, () => {
        if (!busy) onClose();
    });

    useEffect(() => {
        let live = true;
        Promise.all([
            getWorldCategories(),
            previewWorldMigration(collectionId, oldCategory, postId),
        ])
            .then(([items, scope]) => {
                if (live) {
                    setCategories(items);
                    setPreview(scope);
                }
            })
            .catch(e => {
                if (live) setError(e.message || '加载失败');
            });
        return () => {
            live = false;
        };
    }, [collectionId, oldCategory, postId]);

    const targetOptions = useMemo<SelectOption<string>[]>(() => {
        return categories
            .filter(c => c.enabled)
            .map(c => ({
                value: c.id,
                label: c.name,
                description: c.description || undefined,
            }));
    }, [categories]);

    const submit = async () => {
        if (!preview || !target) return;
        setBusy(true);
        setError('');
        try {
            await migrateWorldCategory(collectionId, oldCategory, target, preview.token, postId);
            onComplete();
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : '迁移失败，请刷新后确认');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div data-modal-scroll-lock
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm animate-in fade-in duration-200"
            role="dialog"
            aria-modal="true"
            aria-label="迁移帖子分类"
        >
            <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border border-slate-100 animate-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-orange-50 text-orange-600 rounded-lg">
                            <FolderSync className="w-5 h-5" />
                        </div>
                        <h2 className="font-bold text-slate-800 text-base">迁移帖子分类</h2>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={busy}
                        className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors disabled:opacity-50"
                        aria-label="关闭"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="my-4 p-3 rounded-xl bg-amber-50/70 border border-amber-200/60 text-xs text-amber-800">
                    {categories.some(c => c.name === oldCategory)
                        ? '历史分类尚未关联当前分类，请手动选择当前分类进行迁移。'
                        : '该帖子分类未在当前分类管理列表里面，请手动迁移至已有分类。'}
                </div>

                <div className="text-xs text-slate-600 mb-2 flex items-center gap-2 font-medium">
                    <span>旧分类：<span className="font-bold text-slate-800">{oldCategory || '未分类'}</span></span>
                    <span>·</span>
                    <span>影响 <span className="font-mono text-orange-600 font-bold">{preview?.count ?? '…'}</span> 篇帖子</span>
                </div>

                {preview?.posts && preview.posts.length > 0 && (
                    <ul className="my-3 max-h-36 overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-1 text-xs text-slate-600">
                        {preview.posts.map(p => (
                            <li className="py-1.5 truncate" key={p.id}>
                                {p.title}
                            </li>
                        ))}
                    </ul>
                )}

                <div className="space-y-1.5 mt-4">
                    <label className="block text-xs font-semibold text-slate-700">
                        目标分类 <span className="text-orange-500">*</span>
                    </label>
                    <Select
                        value={target}
                        options={targetOptions}
                        onChange={setTarget}
                        placeholder="请选择启用的目标分类"
                        emptyMessage="暂无可用的分类"
                        accentClassName="bg-orange-50 text-orange-700 font-medium"
                        buttonClassName="bg-slate-50"
                        menuPortal={true}
                    />
                </div>

                {error && (
                    <p role="alert" className="mt-3 text-xs text-red-600 bg-red-50 p-2.5 rounded-lg border border-red-200">
                        {error}
                    </p>
                )}

                <div className="mt-6 flex justify-end gap-3 pt-3 border-t border-slate-100">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={busy}
                        className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50"
                    >
                        取消
                    </button>
                    <button
                        type="button"
                        disabled={busy || !target || !preview?.count}
                        onClick={submit}
                        className="rounded-xl bg-orange-500 hover:bg-orange-600 active:bg-orange-700 px-4 py-2 text-xs font-medium text-white transition-all shadow-sm shadow-orange-500/20 disabled:opacity-40"
                    >
                        {busy ? '正在迁移…' : '确认迁移'}
                    </button>
                </div>
            </div>
        </div>
    );
}
