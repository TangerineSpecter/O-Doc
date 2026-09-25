import {useEffect, useState} from 'react';
import {ChevronLeft, ChevronRight, ImageIcon, Search, X} from 'lucide-react';

import {getResources} from '../../api/resources';
import type {ResourceItem} from '../../types/api/resources';
import {useEscapeDismissal} from '../../hooks/useEscapeDismissal';
import AuthenticatedResourceImage from '../common/AuthenticatedResourceImage';
import {useToast} from '../common/ToastProvider';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (resourceId: string) => void;
}

export default function ResourceImagePickerModal({isOpen, onClose, onSelect}: Props) {
    const toast = useToast();
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [items, setItems] = useState<ResourceItem[]>([]);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(false);
    const [loadedKey, setLoadedKey] = useState('');
    const currentKey = `${page}:${search}`;
    const displayLoading = loading || loadedKey !== currentKey;
    useEscapeDismissal(isOpen, onClose);

    useEffect(() => {
        if (!isOpen) return;
        let active = true;
        const timer = setTimeout(() => {
            setLoading(true);
            void getResources({type: 'image', searchQuery: search.trim() || undefined, page, pageSize: 24})
                .then(result => {
                    if (!active) return;
                    setItems(result.list);
                    setHasMore(result.hasMore);
                    setLoadedKey(currentKey);
                })
                .catch(error => {
                    if (active) toast.error((error as Error).message || '读取资源库图片失败');
                })
                .finally(() => {
                    if (active) setLoading(false);
                });
        }, search ? 250 : 0);
        return () => {
            active = false;
            clearTimeout(timer);
        };
    }, [isOpen, page, search, currentKey, toast]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose}/>
            <div className="relative flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label="从资源库插入图片">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                    <div className="flex items-center gap-2 text-base font-semibold text-slate-900"><ImageIcon className="h-5 w-5 text-orange-500"/>从资源库插入图片</div>
                    <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="关闭"><X className="h-4 w-4"/></button>
                </div>
                <div className="relative mx-5 mt-4">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/>
                    <input value={search} onChange={event => {setSearch(event.target.value); setPage(1);}}
                           placeholder="搜索图片名称" className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-orange-400"/>
                </div>
                <div className="min-h-40 flex-1 overflow-y-auto p-5">
                    {displayLoading ? <div className="py-14 text-center text-sm text-slate-400">正在加载图片…</div> : items.length ? (
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                            {items.map(item => (
                                <button key={item.id} type="button" disabled={!item.fileExists} onClick={() => onSelect(item.id)}
                                        className="overflow-hidden rounded-xl border border-slate-200 text-left hover:border-orange-400 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-50">
                                    <AuthenticatedResourceImage resourceId={item.id} alt={item.name} className="h-28 w-full object-cover"/>
                                    <div className="truncate px-2 py-1.5 text-xs text-slate-700" title={item.name}>{item.name}</div>
                                </button>
                            ))}
                        </div>
                    ) : <div className="py-14 text-center text-sm text-slate-400">暂无可选图片</div>}
                </div>
                <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-5 py-3 text-sm text-slate-600">
                    <span>第 {page} 页</span>
                    <button type="button" onClick={() => setPage(current => current - 1)} disabled={page === 1 || displayLoading} className="rounded-lg border border-slate-200 p-1.5 disabled:opacity-40" aria-label="上一页"><ChevronLeft className="h-4 w-4"/></button>
                    <button type="button" onClick={() => setPage(current => current + 1)} disabled={!hasMore || displayLoading} className="rounded-lg border border-slate-200 p-1.5 disabled:opacity-40" aria-label="下一页"><ChevronRight className="h-4 w-4"/></button>
                </div>
            </div>
        </div>
    );
}
