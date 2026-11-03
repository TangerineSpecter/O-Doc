import {useEffect, useId, useRef, useState} from 'react';
import {ArrowUpLeft, ImagePlus, Images, Loader2, X} from 'lucide-react';
import type {DiaryDraft} from '../../types/api/diary';
import {collectDroppedFiles} from '../../utils/imageUpload';
import DiaryPhoto from './DiaryPhoto';
import DiaryLibraryPicker from './DiaryLibraryPicker';
import {diaryImagePatch, MAX_DIARY_IMAGES} from './diaryImages';

interface Props {
    draft: DiaryDraft;
    onChange: (patch: Partial<DiaryDraft>) => void;
    onUpload: (files: File[]) => void;
    uploading: boolean;
    error?: string;
    layout?: 'default' | 'sidebar';
}

export default function DiaryImageUpload({draft, onChange, onUpload, uploading, error = '', layout = 'default'}: Props) {
    const [libraryOpen, setLibraryOpen] = useState(false);
    const [dragging, setDragging] = useState(false);
    const dragDepth = useRef(0);
    const input = useRef<HTMLInputElement>(null);
    const errorRef = useRef<HTMLParagraphElement>(null);
    const errorId = useId();
    const full = draft.imageAssetIds.length >= MAX_DIARY_IMAGES;
    const isSidebar = layout === 'sidebar';

    useEffect(() => {
        if (error && errorRef.current?.getClientRects().length) {
            errorRef.current.scrollIntoView({block: 'nearest'});
        }
    }, [error]);

    return (
        <div className={`rounded-2xl border border-zinc-200 bg-zinc-50/50 ${isSidebar ? 'p-3.5 sm:p-4' : 'p-5'}`}>
            <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <p className="text-xs font-bold tracking-wider text-zinc-900 uppercase">日记配图 · GALLERY</p>
                    <span className="diary-num rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-zinc-600">
                        {draft.imageAssetIds.length} / {MAX_DIARY_IMAGES}
                    </span>
                </div>

                <button
                    type="button"
                    disabled={uploading || full}
                    onClick={() => setLibraryOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-800 transition-colors hover:border-zinc-950 hover:text-zinc-950 disabled:opacity-40"
                >
                    <Images size={13}/>
                    从图片文集选择
                </button>
            </div>

            {!!draft.imageAssetIds.length && (
                <div className={`mb-3 grid ${isSidebar ? 'grid-cols-3 gap-2' : 'grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-5'}`}>
                    {draft.imageAssetIds.map((id, index) => (
                        <div
                            key={id}
                            className="group relative overflow-hidden rounded-xl border border-zinc-200 bg-white"
                        >
                            <DiaryPhoto assetId={id} url="" className="aspect-[4/3] w-full object-cover"/>
                            {index === 0 ? (
                                <span className="diary-num absolute bottom-2 left-2 rounded-md bg-zinc-950/85 px-2 py-0.5 text-[10px] font-medium tracking-wide text-white">
                                    主封面
                                </span>
                            ) : (
                                <button
                                    type="button"
                                    disabled={uploading}
                                    title="设为封面"
                                    aria-label={`将图片 ${index + 1} 设为封面`}
                                    onClick={() =>
                                        onChange(
                                            diaryImagePatch([
                                                id,
                                                ...draft.imageAssetIds.filter(item => item !== id),
                                            ])
                                        )
                                    }
                                    className="absolute bottom-2 left-2 rounded-md bg-white/95 p-1 text-zinc-700 shadow-xs transition-colors hover:bg-zinc-950 hover:text-white"
                                >
                                    <ArrowUpLeft size={12}/>
                                </button>
                            )}
                            <button
                                type="button"
                                disabled={uploading}
                                aria-label={`移除配图 ${index + 1}`}
                                onClick={() =>
                                    onChange(diaryImagePatch(draft.imageAssetIds.filter(item => item !== id)))
                                }
                                className="absolute right-2 top-2 rounded-full bg-white/95 p-1 text-zinc-700 shadow-xs transition-colors hover:bg-red-600 hover:text-white"
                            >
                                <X size={12}/>
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {!draft.imageAssetIds.length && draft.coverUrl && (
                <div className={`relative mb-3 ${isSidebar ? 'w-full' : 'max-w-sm'} overflow-hidden rounded-xl border border-zinc-200 bg-white`}>
                    <DiaryPhoto assetId={null} url={draft.coverUrl} className="aspect-[4/3] w-full object-cover"/>
                    <button
                        type="button"
                        aria-label="移除历史配图"
                        onClick={() => onChange(diaryImagePatch([]))}
                        className="absolute right-2.5 top-2.5 rounded-full bg-white p-1.5 text-zinc-700 shadow-xs hover:text-red-600"
                    >
                        <X size={14}/>
                    </button>
                </div>
            )}

            <div
                data-diary-dropzone
                aria-label="拖拽上传日记图片"
                onDragEnter={event => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (!uploading && !full) {
                        dragDepth.current++;
                        setDragging(true);
                    }
                }}
                onDragOver={event => {
                    event.preventDefault();
                    event.stopPropagation();
                    event.dataTransfer.dropEffect = uploading || full ? 'none' : 'copy';
                }}
                onDragLeave={event => {
                    event.preventDefault();
                    event.stopPropagation();
                    dragDepth.current = Math.max(0, dragDepth.current - 1);
                    if (!dragDepth.current) setDragging(false);
                }}
                onDrop={event => {
                    event.preventDefault();
                    event.stopPropagation();
                    dragDepth.current = 0;
                    setDragging(false);
                    if (!uploading && !full) onUpload(collectDroppedFiles(event.dataTransfer));
                }}
                className={`rounded-xl border border-dashed transition-colors ${
                    dragging ? 'border-zinc-950 bg-zinc-100' : 'border-zinc-300 bg-white'
                } ${uploading || full ? 'opacity-60' : 'hover:border-zinc-950'}`}
            >
                <button
                    type="button"
                    disabled={uploading || full}
                    aria-describedby={error ? errorId : undefined}
                    onClick={() => input.current?.click()}
                    className={`flex w-full items-center justify-center gap-2 text-xs text-zinc-600 ${isSidebar ? 'px-3 py-3' : 'px-4 py-4'}`}
                >
                    {uploading ? (
                        <Loader2 size={isSidebar ? 16 : 18} className="animate-spin text-zinc-900"/>
                    ) : (
                        <ImagePlus size={isSidebar ? 16 : 18} className="text-zinc-500"/>
                    )}
                    <span className="font-semibold text-zinc-800 text-center">
                        {uploading
                            ? '正在上传影像…'
                            : full
                              ? '已达到 15 张图片上限'
                              : dragging
                                ? '松开即可添入影像'
                                : isSidebar
                                  ? '点击上传或将照片拖拽至此'
                                  : '点击上传或将照片拖拽至此（支持多选，最多 15 张）'}
                    </span>
                </button>
                <input
                    ref={input}
                    aria-label="上传日记图片"
                    aria-describedby={error ? errorId : undefined}
                    type="file"
                    multiple
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    disabled={uploading || full}
                    className="sr-only"
                    onChange={event => {
                        const files = Array.from(event.target.files || []);
                        if (files.length) onUpload(files);
                        event.target.value = '';
                    }}
                />
            </div>

            {error && <p ref={errorRef} id={errorId} role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs leading-5 text-red-600">{error}</p>}

            {libraryOpen && (
                <DiaryLibraryPicker
                    existing={draft.imageAssetIds}
                    onClose={() => setLibraryOpen(false)}
                    onAdd={ids => onChange(diaryImagePatch([...new Set([...draft.imageAssetIds, ...ids])]))}
                />
            )}
        </div>
    );
}
