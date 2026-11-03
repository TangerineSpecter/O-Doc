import {useEffect, useState} from 'react';
import {createPortal} from 'react-dom';
import {ChevronLeft, ChevronRight, Expand, X} from 'lucide-react';
import DiaryPhoto from './DiaryPhoto';

interface DiaryGalleryProps {
    ids: string[];
    legacyUrl?: string;
    compact?: boolean;
}

export default function DiaryGallery({ids, legacyUrl = '', compact = false}: DiaryGalleryProps) {
    const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
    const totalCount = ids.length || (legacyUrl ? 1 : 0);

    useEffect(() => {
        if (lightboxIdx === null || totalCount === 0) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                setLightboxIdx(null);
            } else if (e.key === 'ArrowLeft' && totalCount > 1) {
                e.stopPropagation();
                setLightboxIdx(prev => (prev === null ? null : (prev - 1 + totalCount) % totalCount));
            } else if (e.key === 'ArrowRight' && totalCount > 1) {
                e.stopPropagation();
                setLightboxIdx(prev => (prev === null ? null : (prev + 1) % totalCount));
            }
        };
        window.addEventListener('keydown', onKeyDown, true);
        return () => window.removeEventListener('keydown', onKeyDown, true);
    }, [lightboxIdx, totalCount]);

    if (!ids.length && !legacyUrl) return null;

    if (compact) {
        if (!ids.length) {
            return (
                <div className="mt-4 overflow-hidden rounded-xl border border-zinc-150 bg-zinc-50">
                    <DiaryPhoto assetId={null} url={legacyUrl} className="max-h-60 w-full object-cover"/>
                </div>
            );
        }
        const shown = ids.slice(0, 4);
        return (
            <div className={`mt-4 grid gap-2.5 ${ids.length === 1 ? 'max-w-md grid-cols-1' : 'grid-cols-2 sm:grid-cols-4'}`}>
                {shown.map((id, index) => (
                    <div
                        key={id}
                        className="group/photo relative overflow-hidden rounded-xl border border-zinc-150 bg-zinc-100"
                    >
                        <DiaryPhoto
                            assetId={id}
                            url=""
                            className={
                                ids.length === 1
                                    ? 'aspect-[16/10] w-full object-cover transition-transform duration-500 group-hover/photo:scale-[1.02]'
                                    : 'aspect-square w-full object-cover transition-transform duration-500 group-hover/photo:scale-105'
                            }
                        />
                        {index === 3 && ids.length > 4 && (
                            <span className="diary-num absolute inset-0 flex items-center justify-center bg-zinc-950/60 text-base font-bold text-white backdrop-blur-[1px]">
                                +{ids.length - 4}
                            </span>
                        )}
                    </div>
                ))}
            </div>
        );
    }

    const items = ids.length ? ids.map(id => ({assetId: id, url: ''})) : [{assetId: null, url: legacyUrl}];

    return (
        <>
            <div className="mt-10 border-t border-zinc-150 pt-7">
                <div className="mb-4 flex items-center justify-between text-xs text-zinc-400">
                    <span className="font-semibold text-zinc-700">照片记录（{items.length} 张）</span>
                    <span>点击照片查看大图</span>
                </div>

                {items.length === 1 ? (
                    <button
                        type="button"
                        onClick={() => setLightboxIdx(0)}
                        className="group relative block w-full overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50 text-left transition-transform"
                    >
                        <DiaryPhoto
                            assetId={items[0].assetId}
                            url={items[0].url}
                            className="max-h-[64vh] w-full object-contain"
                        />
                        <span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-zinc-900/75 px-3 py-1 text-xs text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
                            <Expand size={13}/>
                            全屏查看
                        </span>
                    </button>
                ) : (
                    <div className={`grid gap-3 ${items.length === 2 ? 'sm:grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'}`}>
                        {items.map((item, index) => (
                            <button
                                type="button"
                                key={item.assetId || `legacy-${index}`}
                                onClick={() => setLightboxIdx(index)}
                                className="group relative overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 text-left transition-all hover:border-zinc-400"
                            >
                                <DiaryPhoto
                                    assetId={item.assetId}
                                    url={item.url}
                                    className="aspect-[4/3] w-full object-cover transition-transform duration-500 group-hover:scale-105"
                                />
                                <span className="absolute right-2 top-2 rounded-full bg-zinc-900/60 p-1.5 text-white opacity-0 backdrop-blur-xs transition-opacity group-hover:opacity-100">
                                    <Expand size={12}/>
                                </span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {lightboxIdx !== null &&
                items[lightboxIdx] &&
                createPortal(
                    <div
                        data-modal-scroll-lock
                        role="dialog"
                        aria-modal="true"
                        aria-label="日记配图预览"
                        className="fixed inset-0 z-[160] flex flex-col items-center justify-center bg-zinc-950/92 p-4 backdrop-blur-md"
                        onClick={() => setLightboxIdx(null)}
                    >
                        <div
                            className="flex w-full max-w-5xl items-center justify-between px-2 pb-3 text-zinc-300"
                            onClick={e => e.stopPropagation()}
                        >
                            <span className="diary-num text-xs">
                                第 {lightboxIdx + 1} / {items.length} 张
                            </span>
                            <button
                                type="button"
                                aria-label="关闭配图预览"
                                onClick={() => setLightboxIdx(null)}
                                className="rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
                            >
                                <X size={18}/>
                            </button>
                        </div>

                        <div
                            className="relative flex max-h-[82dvh] w-full max-w-5xl items-center justify-center"
                            onClick={e => e.stopPropagation()}
                        >
                            {items.length > 1 && (
                                <button
                                    type="button"
                                    aria-label="上一张配图"
                                    onClick={() => setLightboxIdx((lightboxIdx - 1 + items.length) % items.length)}
                                    className="absolute left-2 z-10 rounded-full bg-white/15 p-2.5 text-white backdrop-blur-md transition-colors hover:bg-white/30"
                                >
                                    <ChevronLeft size={20}/>
                                </button>
                            )}

                            <DiaryPhoto
                                assetId={items[lightboxIdx].assetId}
                                url={items[lightboxIdx].url}
                                className="max-h-[80dvh] max-w-full rounded-xl object-contain shadow-2xl"
                            />

                            {items.length > 1 && (
                                <button
                                    type="button"
                                    aria-label="下一张配图"
                                    onClick={() => setLightboxIdx((lightboxIdx + 1) % items.length)}
                                    className="absolute right-2 z-10 rounded-full bg-white/15 p-2.5 text-white backdrop-blur-md transition-colors hover:bg-white/30"
                                >
                                    <ChevronRight size={20}/>
                                </button>
                            )}
                        </div>
                    </div>,
                    document.body
                )}
        </>
    );
}
