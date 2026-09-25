import {useEffect, useState} from 'react';
import {Copy, ExternalLink, ImageOff, Loader2, RotateCw, Trash2, Upload} from 'lucide-react';

import {discardPendingArticleIllustration, getPendingArticleIllustrations, retryPendingArticleIllustration} from '../../api/prompt';
import {uploadResource} from '../../api/resources';
import type {PendingArticleIllustration} from '../../types/api/prompt';
import {useToast} from '../common/ToastProvider';

interface Props {
    onSaved: () => void;
}

export default function PendingArticleIllustrations({onSaved}: Props) {
    const toast = useToast();
    const [items, setItems] = useState<PendingArticleIllustration[]>([]);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [failedPreviews, setFailedPreviews] = useState<Set<string>>(new Set());

    useEffect(() => {
        void getPendingArticleIllustrations().then(setItems).catch(error => {
            toast.error((error as Error).message || '读取待下载配图失败');
        });
    }, [toast]);

    const retry = async (item: PendingArticleIllustration) => {
        setBusyId(item.id);
        try {
            const result = await retryPendingArticleIllustration(item.id);
            if (result.status === 'succeeded') {
                setItems(current => current.filter(candidate => candidate.id !== item.id));
                toast.success('文章配图已入库，可在文章中输入 / 选择「资源库图片」插入');
                onSaved();
            } else if (result.status === 'download_pending') {
                setItems(await getPendingArticleIllustrations());
                toast.info('图片已生成，原图下载失败。地址已保留，可稍后重试入库');
            } else {
                toast.info('任务仍在生成，可稍后继续查询');
            }
        } catch (error) {
            toast.error((error as Error).message || '查询或下载失败，请稍后重试');
            try {
                setItems(await getPendingArticleIllustrations());
            } catch {
                // Keep the last known records visible when refreshing also fails.
            }
        } finally {
            setBusyId(null);
        }
    };

    const uploadSavedImage = async (item: PendingArticleIllustration, file?: File) => {
        if (!file) return;
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 15 * 1024 * 1024) {
            toast.error('请选择不超过 15 MB 的 PNG、JPEG 或 WebP 原图');
            return;
        }
        setBusyId(item.id);
        try {
            await uploadResource(file, 'content');
            setItems(current => current.filter(candidate => candidate.id !== item.id));
            onSaved();
            try {
                await discardPendingArticleIllustration(item.id);
                toast.success('原图已上传到资源库，可在文章中插入');
            } catch {
                toast.warning('原图已入库，但待下载记录未能移除，请稍后清理');
            }
        } catch (error) {
            toast.error((error as Error).message || '上传原图失败');
        } finally {
            setBusyId(null);
        }
    };

    const discard = async (item: PendingArticleIllustration) => {
        setBusyId(item.id);
        try {
            await discardPendingArticleIllustration(item.id);
            setItems(current => current.filter(candidate => candidate.id !== item.id));
            toast.success('已移除待下载记录');
        } catch (error) {
            toast.error((error as Error).message || '移除失败');
        } finally {
            setBusyId(null);
        }
    };

    const copyImageUrl = async (item: PendingArticleIllustration) => {
        try {
            await navigator.clipboard.writeText(item.imageUrl);
            toast.success('原图地址已复制');
        } catch {
            toast.error('复制失败，请稍后重试');
        }
    };

    if (!items.length) return null;

    return (
        <section className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/60 p-4 sm:p-5" aria-label="待下载的文章配图">
            <h2 className="text-sm font-semibold text-amber-900">待处理的文章配图 · {items.length}</h2>
            <p className="mt-1 text-xs text-amber-800">生成中的任务可以继续查询。已生成的图片会保留原图地址，可重试入库或自行保存后上传。原图地址可能过期，请尽快处理。</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map(item => (
                    <div key={item.id} className="overflow-hidden rounded-xl border border-amber-200 bg-white">
                        <div className="flex h-40 items-center justify-center bg-slate-100">
                            {item.status === 'generating' ? <Loader2 className="h-8 w-8 animate-spin text-amber-500"/> : !item.previewAllowed || failedPreviews.has(item.id) ? <ImageOff className="h-8 w-8 text-slate-400"/> : (
                                <img src={item.imageUrl} alt="待下载的文章配图预览" loading="lazy" referrerPolicy="no-referrer"
                                     className="h-full w-full object-contain" onError={() => setFailedPreviews(current => new Set(current).add(item.id))}/>
                            )}
                        </div>
                        <div className="space-y-2 p-3">
                            <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                                <span className="font-medium text-amber-700">{item.status === 'generating' ? '生成中' : '待下载'}</span>
                                <span>{new Date(item.createdAt).toLocaleString('zh-CN')}</span>
                            </div>
                            <p className="truncate text-xs text-slate-500" title={item.errorMessage}>{item.status === 'generating' ? '生图服务正在处理，可随时查询结果' : item.errorMessage || '本地下载失败'}</p>
                            <div className="flex flex-wrap gap-2">
                                <button type="button" onClick={() => void retry(item)} disabled={busyId !== null}
                                        className="inline-flex items-center gap-1 rounded-lg bg-orange-500 px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-50">
                                    {busyId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <RotateCw className="h-3.5 w-3.5"/>}
                                    {item.status === 'generating' ? '查询结果' : '重试入库'}
                                </button>
                                {item.status === 'download_pending' && item.previewAllowed && <a href={item.imageUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"
                                   className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700">
                                    <ExternalLink className="h-3.5 w-3.5"/>查看原图
                                </a>}
                                {item.status === 'download_pending' && !item.previewAllowed && <button type="button" onClick={() => void copyImageUrl(item)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700"><Copy className="h-3.5 w-3.5"/>复制原图地址</button>}
                                {item.status === 'download_pending' && <label className={`inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 ${busyId !== null ? 'pointer-events-none opacity-50' : ''}`}>
                                    <Upload className="h-3.5 w-3.5"/>上传已保存原图
                                    <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={busyId !== null}
                                           onChange={event => {
                                               void uploadSavedImage(item, event.target.files?.[0]);
                                               event.target.value = '';
                                           }}/>
                                </label>}
                                <button type="button" onClick={() => void discard(item)} disabled={busyId !== null}
                                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-slate-500 hover:text-red-600 disabled:opacity-50">
                                    <Trash2 className="h-3.5 w-3.5"/>移除记录
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}
