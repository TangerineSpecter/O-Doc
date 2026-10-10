import { useState } from 'react';
import { createPortal } from 'react-dom';
import { FolderTree, Loader2, X } from 'lucide-react';
import type { WorldCategory } from '../../types/api/agentWorld';
import { useEscapeDismissal } from '../../hooks/useEscapeDismissal';

interface WorldCategoryModalProps {
    category?: Partial<WorldCategory>;
    saving: boolean;
    onClose: () => void;
    onSave: (category: Partial<WorldCategory>) => Promise<void>;
}

export function WorldCategoryModal({
    category,
    saving,
    onClose,
    onSave,
}: WorldCategoryModalProps) {
    const [name, setName] = useState(category?.name ?? '');
    const [description, setDescription] = useState(category?.description ?? '');
    const [sort, setSort] = useState(category?.sort ?? 0);

    useEscapeDismissal(true, () => {
        if (!saving) onClose();
    });

    const isEdit = Boolean(category?.id);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;
        await onSave({
            ...(category?.id ? { id: category.id } : {}),
            name: name.trim(),
            description: description.trim(),
            sort: Number(sort) || 0,
            ...(category?.id ? {} : {enabled: true}),
        });
    };

    return createPortal(
        <div data-modal-scroll-lock
            className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm animate-in fade-in duration-200"
            role="dialog"
            aria-modal="true"
            aria-labelledby="category-modal-title"
            onClick={e => {
                if (e.target === e.currentTarget && !saving) onClose();
            }}
        >
            <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border border-slate-100 animate-in zoom-in-95 duration-150">
                {/* 头部 */}
                <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-orange-50 text-orange-600 rounded-lg">
                            <FolderTree className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 id="category-modal-title" className="font-bold text-slate-800">
                                {isEdit ? '编辑分类' : '新增分类'}
                            </h3>
                            <p className="text-xs text-slate-500 mt-0.5">
                                {isEdit ? '修改世界分类的基本信息与排序' : '创建新的世界分类，用于帖子归属与收益加成'}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                        className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors disabled:opacity-50"
                        aria-label="关闭"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* 表单内容 */}
                <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                            分类名称 <span className="text-orange-500">*</span>
                        </label>
                        <input
                            type="text"
                            required
                            maxLength={50}
                            placeholder="请输入分类名称，例如：科技、旅行"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                            分类说明
                        </label>
                        <textarea
                            rows={3}
                            placeholder="简短描述该分类包含的内容范围（选填）"
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-sm text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all resize-none"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                            排序权重
                        </label>
                        <input
                            type="number"
                            value={sort}
                            onChange={e => setSort(Number(e.target.value))}
                            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                        />
                        <p className="mt-1 text-[11px] text-slate-400">数值越小排在越前面，默认 0</p>
                    </div>

                    {/* 底部操作 */}
                    <div className="flex items-center justify-end gap-3 pt-5 border-t border-slate-100">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={saving}
                            className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50"
                        >
                            取消
                        </button>
                        <button
                            type="submit"
                            disabled={saving || !name.trim()}
                            className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white rounded-xl text-xs font-medium transition-all shadow-sm shadow-orange-500/20 disabled:opacity-50"
                        >
                            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                            {saving ? '保存中…' : '保存分类'}
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
}
