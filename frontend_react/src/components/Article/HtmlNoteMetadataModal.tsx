import { useEffect, useMemo, useState } from 'react';
import { getCategoryList, type CategoryItem } from '../../api/category';
import { getAnthologyList, type Anthology } from '../../api/anthology';
import { updateArticle } from '../../api/article';
import type { ArticleProps } from './ArticleReader';
import { useAuth } from '../../contexts/AuthContext';
import { useEscapeDismissal } from '../../hooks/useEscapeDismissal';
import { Select, type SelectOption } from '../common/Select';

interface Props {
    note: ArticleProps;
    onClose: () => void;
    onSaved: (collId: string) => void;
}

export default function HtmlNoteMetadataModal({ note, onClose, onSaved }: Props) {
    const { userInfo } = useAuth();
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

    useEscapeDismissal(true, () => {
        if (!busy) onClose();
    });

    useEffect(() => {
        let active = true;
        Promise.all([getCategoryList(), getAnthologyList('article')])
            .then(([cats, colls]) => {
                if (active) {
                    setCategories(cats);
                    setCollections(colls);
                }
            })
            .catch(reason => {
                if (active) setError(reason instanceof Error ? reason.message : '资料加载失败');
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, []);

    const categoryOptions = useMemo<SelectOption<string>[]>(() => [
        { value: '', label: '未分类' },
        ...categories.map(c => ({ value: c.categoryId, label: c.name })),
    ], [categories]);

    const collectionOptions = useMemo<SelectOption<string>[]>(() => {
        return collections
            .filter(
                c =>
                    c.userId === userInfo?.userid ||
                    (c.userId === 'admin' && userInfo?.username === 'admin') ||
                    c.collId === note.collId
            )
            .map(c => ({ value: c.collId, label: c.title }));
    }, [collections, userInfo, note.collId]);

    const permissionOptions: SelectOption<'public' | 'private'>[] = [
        { value: 'public', label: '公开' },
        { value: 'private', label: '私有' },
    ];

    const save = async () => {
        if (!note.articleId || !title.trim() || !collId) return;
        setBusy(true);
        setError('');
        try {
            await updateArticle(note.articleId, {
                title: title.trim(),
                categoryId,
                collId,
                permission,
                tags: tags
                    .split(/[,，]/)
                    .map(t => t.trim())
                    .filter(Boolean),
            });
            onSaved(collId);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : '保存失败');
        } finally {
            setBusy(false);
        }
    };

    const inputClass =
        'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20';

    return (
        <div data-modal-scroll-lock className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/30 backdrop-blur-sm p-4 animate-in fade-in duration-150">
            <form
                role="dialog"
                aria-modal="true"
                aria-label="编辑笔记资料"
                onSubmit={event => {
                    event.preventDefault();
                    void save();
                }}
                className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl border border-slate-100 animate-in zoom-in-95 duration-150"
            >
                <h2 className="text-lg font-bold text-slate-800">编辑笔记资料</h2>

                <div>
                    <label className="block text-xs font-semibold text-slate-700">
                        标题 <span className="text-orange-500">*</span>
                    </label>
                    <input
                        autoFocus
                        required
                        maxLength={255}
                        className={inputClass}
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                    />
                </div>

                <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                        分类
                    </label>
                    <Select
                        value={categoryId}
                        options={categoryOptions}
                        onChange={setCategoryId}
                        placeholder="请选择分类"
                        buttonClassName="bg-slate-50"
                        accentClassName="bg-orange-50 text-orange-700 font-medium"
                        menuPortal={true}
                    />
                </div>

                <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                        文集 <span className="text-orange-500">*</span>
                    </label>
                    <Select
                        value={collId}
                        options={collectionOptions}
                        onChange={setCollId}
                        placeholder="请选择文集"
                        buttonClassName="bg-slate-50"
                        accentClassName="bg-orange-50 text-orange-700 font-medium"
                        menuPortal={true}
                    />
                </div>

                <div>
                    <label className="block text-xs font-semibold text-slate-700">标签</label>
                    <input
                        className={inputClass}
                        value={tags}
                        onChange={e => setTags(e.target.value)}
                        placeholder="用逗号分隔多个标签"
                    />
                </div>

                <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                        权限
                    </label>
                    <Select
                        value={permission}
                        options={permissionOptions}
                        onChange={setPermission}
                        placeholder="请选择权限"
                        buttonClassName="bg-slate-50"
                        accentClassName="bg-orange-50 text-orange-700 font-medium"
                        menuPortal={true}
                    />
                </div>

                {error && <p role="alert" className="text-xs text-red-600 bg-red-50 p-2.5 rounded-lg border border-red-200">{error}</p>}

                <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                    <button
                        type="button"
                        disabled={busy}
                        onClick={onClose}
                        className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50"
                    >
                        取消
                    </button>
                    <button
                        type="submit"
                        disabled={busy || loading || !title.trim()}
                        className="rounded-xl bg-orange-500 hover:bg-orange-600 active:bg-orange-700 px-4 py-2 text-xs font-medium text-white transition-all shadow-sm shadow-orange-500/20 disabled:opacity-50"
                    >
                        {busy ? '保存中…' : '保存'}
                    </button>
                </div>
            </form>
        </div>
    );
}
