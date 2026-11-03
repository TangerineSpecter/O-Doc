import {useState} from 'react';
import {createPortal} from 'react-dom';
import {Check, ChevronLeft, ChevronRight, ImageOff, Search, X} from 'lucide-react';
import {useEscapeDismissal} from '../../hooks/useEscapeDismissal';
import {useDiaryPhotoLibrary} from '../../hooks/useDiaryPhotoLibrary';
import type {DiaryLibraryPhoto} from '../../types/api/diary';
import {Select} from '../common/Select';
import AuthenticatedResourceImage from '../common/AuthenticatedResourceImage';
import {MAX_DIARY_IMAGES} from './diaryImages';

interface Props {
    existing: string[];
    onClose: () => void;
    onAdd: (ids: string[]) => void;
}

export default function DiaryLibraryPicker({existing, onClose, onAdd}: Props) {
    const [collId, setCollId] = useState('');
    const [keyword, setKeyword] = useState('');
    const [page, setPage] = useState(1);
    const [selected, setSelected] = useState<Map<string, DiaryLibraryPhoto>>(() => new Map());
    const [notice, setNotice] = useState('');
    const {data, collections, loading, error, retry} = useDiaryPhotoLibrary(collId, keyword, page);
    useEscapeDismissal(true, onClose);

    const candidatesFor = (photos: DiaryLibraryPhoto[]) =>
        photos.filter(photo => photo.selectable && photo.assetId && !existing.includes(photo.assetId));

    const groupLabel = (photos: DiaryLibraryPhoto[]) => {
        const options = candidatesFor(photos);
        return !options.length
            ? '无可新增照片'
            : options.every(photo => selected.has(photo.assetId!))
              ? '取消本组新选择'
              : options.length === photos.length
                ? '选择整组'
                : '选择本组可用照片';
    };

    const choose = (photos: DiaryLibraryPhoto[]) => {
        const candidates = [...new Map(candidatesFor(photos).map(photo => [photo.assetId!, photo])).values()];
        if (!candidates.length) return;
        const next = new Map(selected);
        if (candidates.every(photo => next.has(photo.assetId!))) {
            candidates.forEach(photo => next.delete(photo.assetId!));
        } else {
            candidates.forEach(photo => next.set(photo.assetId!, photo));
            if (next.size + existing.length > MAX_DIARY_IMAGES) {
                setNotice(`最多 15 张，还可添加 ${MAX_DIARY_IMAGES - existing.length - selected.size} 张，请逐张选择部分照片`);
                return;
            }
        }
        setNotice('');
        setSelected(next);
    };

    return createPortal(
        <div
            data-modal-scroll-lock
            className="diary-modal-root fixed inset-0 z-[130] flex items-center justify-center bg-zinc-950/60 p-4 backdrop-blur-xs"
            onClick={onClose}
        >
            <section
                role="dialog"
                aria-modal="true"
                aria-label="从图片文集选择配图"
                className="flex max-h-[88dvh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-2xl"
                onClick={event => event.stopPropagation()}
            >
                <header className="flex items-center justify-between border-b border-zinc-100 px-6 py-4">
                    <div>
                        <h2 className="text-lg font-bold text-zinc-950">从图片文集选择</h2>
                        <p className="mt-0.5 text-xs text-zinc-500">
                            可选整组，也可逐张勾选。按实际照片数计数，与上传图片合计最多 15 张；复用原文件。
                        </p>
                    </div>
                    <button
                        type="button"
                        aria-label="关闭图片文集选择"
                        onClick={onClose}
                        className="rounded-full p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950"
                    >
                        <X size={19}/>
                    </button>
                </header>

                <div className="grid gap-3 border-b border-zinc-100 bg-zinc-50/60 px-6 py-3.5 sm:grid-cols-2">
                    <Select
                        ariaLabel="选择图片文集"
                        value={collId}
                        options={[
                            {value: '', label: '请选择图片文集'},
                            ...collections.map(album => ({value: album.id, label: `${album.title}（${album.count} 张）`})),
                        ]}
                        menuPortal
                        onChange={value => {
                            setCollId(value);
                            setPage(1);
                            setKeyword('');
                        }}
                        disabled={loading}
                    />
                    <label className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3.5">
                        <Search size={16} className="text-zinc-400"/>
                        <input
                            aria-label="搜索文集照片"
                            value={keyword}
                            disabled={!collId}
                            onChange={event => {
                                setKeyword(event.target.value);
                                setPage(1);
                            }}
                            placeholder="搜索标题、描述或标签"
                            className="min-w-0 flex-1 bg-transparent py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
                        />
                    </label>
                </div>

                <div className="min-h-40 flex-1 space-y-4 overflow-y-auto px-6 py-5 scrollbar-hide">
                    {loading ? (
                        <p role="status" className="py-14 text-center text-sm text-zinc-500">
                            正在加载图片文集…
                        </p>
                    ) : error ? (
                        <div role="alert" className="py-12 text-center text-sm text-red-600">
                            {error}
                            <button type="button" onClick={retry} className="ml-3 font-semibold text-zinc-900 underline">
                                重试
                            </button>
                        </div>
                    ) : !data?.collections.length ? (
                        <p className="py-14 text-center text-sm text-zinc-500">
                            还没有图片文集，先在文集中添加照片吧。
                        </p>
                    ) : !collId ? (
                        <p className="py-14 text-center text-sm text-zinc-500">
                            选择一个图片文集，查看单张照片和多图组。
                        </p>
                    ) : !data.groups.length ? (
                        <p className="py-14 text-center text-sm text-zinc-500">
                            没有找到照片，试试其他文集或关键词。
                        </p>
                    ) : (
                        data.groups.map(group => (
                            <div key={group.id} className="rounded-2xl border border-zinc-200 bg-white p-4">
                                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                    <h3 className="min-w-0 flex-1 truncate text-sm font-bold text-zinc-950">
                                        {group.title}{' '}
                                        <span className="font-normal text-zinc-400">· {group.photos.length} 张</span>
                                    </h3>
                                    <button
                                        type="button"
                                        aria-label={`选择整组 ${group.title}`}
                                        onClick={() => choose(group.photos)}
                                        disabled={!candidatesFor(group.photos).length}
                                        className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-800 transition-colors hover:border-zinc-950 disabled:opacity-40"
                                    >
                                        {groupLabel(group.photos)}
                                    </button>
                                </div>

                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                    {group.photos.map(photo => {
                                        const added = !!photo.assetId && existing.includes(photo.assetId);
                                        const checked = !!photo.assetId && selected.has(photo.assetId);
                                        return (
                                            <button
                                                type="button"
                                                key={photo.imageId}
                                                aria-label={`选择照片 ${photo.imageId}`}
                                                aria-pressed={added || checked}
                                                disabled={!photo.selectable || added}
                                                onClick={() => choose([photo])}
                                                className={`relative overflow-hidden rounded-xl border bg-white text-left transition-all ${
                                                    checked || added
                                                        ? 'border-zinc-950 ring-2 ring-zinc-950/15'
                                                        : 'border-zinc-200 hover:border-zinc-950'
                                                } disabled:cursor-default`}
                                            >
                                                {photo.assetId && photo.selectable ? (
                                                    <AuthenticatedResourceImage
                                                        resourceId={photo.assetId}
                                                        alt={photo.title}
                                                        className="aspect-[4/3] w-full object-cover"
                                                    />
                                                ) : (
                                                    <div className="flex aspect-[4/3] items-center justify-center bg-zinc-100 text-zinc-400">
                                                        <ImageOff size={22}/>
                                                    </div>
                                                )}
                                                {(checked || added) && (
                                                    <span className="absolute right-2 top-2 rounded-full bg-zinc-950 p-1 text-white">
                                                        <Check size={11}/>
                                                    </span>
                                                )}
                                                <div className="p-2.5">
                                                    <p className="truncate text-xs font-medium text-zinc-900">
                                                        {photo.title}
                                                    </p>
                                                    {(added || photo.reason) && (
                                                        <p className="mt-0.5 text-[11px] text-zinc-400">
                                                            {added ? '已在日记中' : photo.reason}
                                                        </p>
                                                    )}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {notice && (
                    <p role="alert" className="px-6 pb-2 text-xs text-red-600">
                        {notice}
                    </p>
                )}

                <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 bg-zinc-50/60 px-6 py-4">
                    <span className="diary-num text-xs text-zinc-500">
                        已有 {existing.length} 张 · 本次选择 {selected.size} 张
                    </span>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            aria-label="上一页照片组"
                            disabled={page === 1 || loading}
                            onClick={() => setPage(n => n - 1)}
                            className="rounded-lg border border-zinc-200 bg-white p-1.5 text-zinc-700 disabled:opacity-30"
                        >
                            <ChevronLeft size={16}/>
                        </button>
                        <span className="diary-num px-1 text-xs text-zinc-700">{page}</span>
                        <button
                            type="button"
                            aria-label="下一页照片组"
                            disabled={!data?.hasMore || loading}
                            onClick={() => setPage(n => n + 1)}
                            className="rounded-lg border border-zinc-200 bg-white p-1.5 text-zinc-700 disabled:opacity-30"
                        >
                            <ChevronRight size={16}/>
                        </button>
                        <button
                            type="button"
                            disabled={!selected.size || loading}
                            onClick={() => {
                                onAdd([...selected.keys()]);
                                onClose();
                            }}
                            className="ml-1 rounded-full bg-zinc-950 px-5 py-2 text-xs font-semibold text-white transition-colors hover:bg-zinc-800 disabled:opacity-40"
                        >
                            添加 {selected.size} 张
                        </button>
                    </div>
                </footer>
            </section>
        </div>,
        document.body
    );
}
