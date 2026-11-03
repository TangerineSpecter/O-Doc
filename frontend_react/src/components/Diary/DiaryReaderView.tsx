import {useEffect, useMemo, useState} from 'react';
import {createPortal} from 'react-dom';
import {
    AlignJustify,
    ArrowLeft,
    ArrowRight,
    BookOpen,
    ChevronLeft,
    ChevronRight,
    Clock,
    Expand,
    Maximize2,
    Minimize2,
    Sparkles,
    X,
} from 'lucide-react';
import type {DiaryEntry} from '../../types/api/diary';
import {countDiaryWords, estimateReadingMinutes, formatTimeOnly, parseDiaryDate} from './diaryDate';
import {getMoodLabel, getWeatherLabel} from './diaryBrowse';
import DiaryMoodIcon from './DiaryMoodIcon';
import {WeatherIcon} from './DiaryMetadata';
import DiaryPhoto from './DiaryPhoto';
import DiaryInlinePhotos from './DiaryInlinePhotos';
import {buildInlinePhotoSchedule, parseDiaryContent} from './diaryReaderContent';

export type PaperTheme = 'light' | 'soft' | 'dark';
export type ReaderSize = 'sm' | 'base' | 'lg';
export type ReaderWidth = 'normal' | 'wide';

interface DiaryReaderViewProps {
    entry: DiaryEntry;
    paper?: PaperTheme;
    onPaperChange?: (paper: PaperTheme) => void;
    ruled?: boolean;
    onRuledChange?: (ruled: boolean) => void;
    prevEntry?: DiaryEntry | null;
    nextEntry?: DiaryEntry | null;
    onSelectEntry?: (entry: DiaryEntry) => void;
    error?: string;
    showControlsBar?: boolean;
}

const PAPER_CLASSES: Record<PaperTheme, string> = {
    light: 'diary-reader-light',
    soft: 'diary-reader-soft',
    dark: 'diary-reader-dark',
};

const SIZE_CLASSES: Record<ReaderSize, string> = {
    sm: 'text-[16px] leading-[1.8]',
    base: 'text-[17.5px] sm:text-[18px] leading-[1.85]',
    lg: 'text-[19.5px] sm:text-[20.5px] leading-[1.9]',
};

const WIDTH_CLASSES: Record<ReaderWidth, string> = {
    normal: 'max-w-[680px]', // 黄金阅读宽度：每行约 38~42 字，眼球扫读最舒适
    wide: 'max-w-[780px]',
};

export default function DiaryReaderView({
    entry,
    paper: controlledPaper,
    onPaperChange,
    ruled: controlledRuled,
    onRuledChange,
    prevEntry,
    nextEntry,
    onSelectEntry,
    error,
    showControlsBar = false,
}: DiaryReaderViewProps) {
    const [internalPaper, setInternalPaper] = useState<PaperTheme>('light');
    const [internalRuled, setInternalRuled] = useState(false);
    const [readerSize, setReaderSize] = useState<ReaderSize>('base');
    const [readerWidth, setReaderWidth] = useState<ReaderWidth>('normal');
    const [indent, setIndent] = useState(false);
    const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

    const paper = controlledPaper ?? internalPaper;
    const ruled = controlledRuled ?? internalRuled;

    const setPaper = onPaperChange ?? setInternalPaper;
    const setRuled = onRuledChange ?? setInternalRuled;

    const dateInfo = parseDiaryDate(entry.entryDate);
    const timeStr = formatTimeOnly(entry.createdAt);
    const wordCount = countDiaryWords(entry.content);
    const readMins = estimateReadingMinutes(entry.content);
    const moodLabel = getMoodLabel(entry.mood);
    const weatherLabel = getWeatherLabel(entry.weather);
    const isDark = paper === 'dark';
    const images = useMemo(() => entry.imageAssetIds || [], [entry.imageAssetIds]);
    const coverId = images[0] || entry.coverAssetId;
    const hasHeroCover = Boolean(coverId || entry.coverUrl);

    // 解析正文，完整保留段首缩进
    const blocks = useMemo(() => parseDiaryContent(entry.content), [entry.content]);

    // 计算所有普通段落在 blocks 中的下标
    const paragraphIndices = useMemo(() => {
        const indices: number[] = [];
        blocks.forEach((b, idx) => {
            if (b.type === 'paragraph') indices.push(idx);
        });
        return indices;
    }, [blocks]);

    // 方案 A：随文智能穿插计划表
    const photoSchedule = useMemo(
        () => buildInlinePhotoSchedule(images, paragraphIndices, hasHeroCover),
        [images, paragraphIndices, hasHeroCover]
    );

    // 全屏灯箱键盘监听（ESC 退出，左右方向键切换）
    useEffect(() => {
        if (lightboxIdx === null) return;
        const total = images.length || (entry.coverUrl ? 1 : 0);
        if (total === 0) return;

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                setLightboxIdx(null);
            } else if (e.key === 'ArrowLeft' && total > 1) {
                e.stopPropagation();
                setLightboxIdx(prev => (prev === null ? null : (prev - 1 + total) % total));
            } else if (e.key === 'ArrowRight' && total > 1) {
                e.stopPropagation();
                setLightboxIdx(prev => (prev === null ? null : (prev + 1) % total));
            }
        };
        window.addEventListener('keydown', onKeyDown, true);
        return () => window.removeEventListener('keydown', onKeyDown, true);
    }, [lightboxIdx, images.length, entry.coverUrl]);

    return (
        <article className={`${PAPER_CLASSES[paper]} min-h-full transition-colors duration-300 relative diary-prose diary-wenkai text-left`}>
            {/* 现代悬浮控制坞 (Floating Editorial Reader Dock) */}
            {showControlsBar && (
                <div
                    className={`sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b px-6 py-2.5 text-xs backdrop-blur-xl transition-colors ${
                        isDark
                            ? 'border-zinc-800 bg-zinc-950/80 text-zinc-300'
                            : 'border-black/[0.06] bg-white/80 text-zinc-700 shadow-2xs'
                    }`}
                >
                    <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 font-bold text-zinc-400">
                            <BookOpen size={13}/>
                            文楷品读
                        </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                        {/* 字号大小调节器 (A- / A / A+) */}
                        <div
                            className={`inline-flex items-center gap-1 rounded-full border p-0.5 ${
                                isDark ? 'border-zinc-800 bg-zinc-900' : 'border-zinc-200/80 bg-zinc-100/70'
                            }`}
                        >
                            {(
                                [
                                    {id: 'sm', label: '标准'},
                                    {id: 'base', label: '舒适'},
                                    {id: 'lg', label: '放大'},
                                ] as const
                            ).map(s => (
                                <button
                                    type="button"
                                    key={s.id}
                                    onClick={() => setReaderSize(s.id)}
                                    className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition-all ${
                                        readerSize === s.id
                                            ? isDark
                                                ? 'bg-white text-zinc-950 shadow-2xs'
                                                : 'bg-zinc-950 text-white shadow-2xs'
                                            : 'text-zinc-500 hover:text-zinc-950'
                                    }`}
                                >
                                    {s.label}
                                </button>
                            ))}
                        </div>

                        {/* 版心宽度切换 (黄金 680px / 宽幅 780px) */}
                        <button
                            type="button"
                            onClick={() => setReaderWidth(w => (w === 'normal' ? 'wide' : 'normal'))}
                            title={readerWidth === 'normal' ? '切换为舒展宽幅' : '切换为黄金宽度'}
                            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold transition-all ${
                                isDark ? 'border-zinc-800 bg-zinc-900 text-zinc-300' : 'border-zinc-200/80 bg-white text-zinc-700'
                            }`}
                        >
                            {readerWidth === 'normal' ? <Maximize2 size={11}/> : <Minimize2 size={11}/>}
                            <span>{readerWidth === 'normal' ? '黄金版心' : '宽幅版心'}</span>
                        </button>

                        {/* 底色选择器 (日光白 / 燕麦奶白 / 夜读深空) */}
                        <div
                            className={`inline-flex items-center gap-1 rounded-full border p-0.5 ${
                                isDark ? 'border-zinc-800 bg-zinc-900' : 'border-zinc-200/80 bg-zinc-100/70'
                            }`}
                        >
                            {(
                                [
                                    {id: 'light', label: '日光', dot: '#FFFFFF'},
                                    {id: 'soft', label: '燕麦', dot: '#FAF9F6'},
                                    {id: 'dark', label: '夜读', dot: '#121214'},
                                ] as const
                            ).map(p => (
                                <button
                                    type="button"
                                    key={p.id}
                                    onClick={() => setPaper(p.id)}
                                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold transition-all ${
                                        paper === p.id
                                            ? isDark
                                                ? 'bg-white text-zinc-950 shadow-2xs'
                                                : 'bg-zinc-950 text-white shadow-2xs'
                                            : 'text-zinc-500 hover:text-zinc-950'
                                    }`}
                                >
                                    <span
                                        className="h-2.5 w-2.5 rounded-full border border-black/15 shadow-2xs"
                                        style={{backgroundColor: p.dot}}
                                    />
                                    {p.label}
                                </button>
                            ))}
                        </div>

                        {/* 段首缩进（空两格）开关 */}
                        <button
                            type="button"
                            aria-pressed={indent}
                            onClick={() => setIndent(!indent)}
                            title="每段开头空两个字（传统出版书籍排版）"
                            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold transition-all ${
                                indent
                                    ? isDark
                                        ? 'border-white bg-white text-zinc-950'
                                        : 'border-zinc-950 bg-zinc-950 text-white'
                                    : isDark
                                      ? 'border-zinc-800 text-zinc-400 hover:text-white'
                                      : 'border-zinc-200/80 bg-white text-zinc-600 hover:border-zinc-400'
                            }`}
                        >
                            <span>空两格</span>
                        </button>

                        {/* 稿纸线开关 */}
                        <button
                            type="button"
                            aria-pressed={ruled}
                            onClick={() => setRuled(!ruled)}
                            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold transition-all ${
                                ruled
                                    ? isDark
                                        ? 'border-white bg-white text-zinc-950'
                                        : 'border-zinc-950 bg-zinc-950 text-white'
                                    : isDark
                                      ? 'border-zinc-800 text-zinc-400 hover:text-white'
                                      : 'border-zinc-200/80 bg-white text-zinc-600 hover:border-zinc-400'
                            }`}
                        >
                            <AlignJustify size={12}/>
                            稿纸线
                        </button>
                    </div>
                </div>
            )}

            {/* 沉浸封面大片 (Full Hero Cover) */}
            {hasHeroCover && (
                <div className={`relative mx-auto ${WIDTH_CLASSES[readerWidth]} px-6 pt-8 sm:px-8`}>
                    <button
                        type="button"
                        onClick={() => setLightboxIdx(0)}
                        title="点击全屏查看封面大图"
                        className="diary-photo-frame group relative block w-full overflow-hidden rounded-2xl shadow-sm bg-zinc-100 cursor-zoom-in text-left"
                    >
                        <DiaryPhoto
                            assetId={coverId}
                            url={entry.coverUrl}
                            className="aspect-[21/9] sm:aspect-[24/10] w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.02]"
                        />
                        <span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-zinc-950/70 px-3 py-1 text-xs text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
                            <Expand size={13}/>
                            全屏画卷
                        </span>
                    </button>
                </div>
            )}

            <div className={`mx-auto ${WIDTH_CLASSES[readerWidth]} px-6 py-10 sm:px-8 sm:py-14`}>
                {/* 顶部日期、时光与心情印模 */}
                <div
                    className={`flex flex-wrap items-center justify-between gap-6 border-b pb-6 ${
                        isDark ? 'border-zinc-800' : 'border-black/[0.06]'
                    }`}
                >
                    <div className="flex items-center gap-4">
                        {/* 现代日历印模 */}
                        <div
                            className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl border shadow-2xs ${
                                isDark
                                    ? 'border-zinc-800 bg-zinc-900 text-white'
                                    : 'diary-date-tile text-zinc-900'
                            }`}
                        >
                            <span className="diary-display-num text-2xl font-black leading-none">
                                {dateInfo.dayPadded}
                            </span>
                            <span className="mt-0.5 text-[10px] font-bold tracking-wider leading-none opacity-60">
                                {dateInfo.month}月
                            </span>
                        </div>

                        <div>
                            <div className="flex items-center gap-2 text-xs font-bold text-zinc-400">
                                <span className={isDark ? 'text-zinc-200' : 'text-zinc-800'}>
                                    {dateInfo.fullCn}
                                </span>
                                <span>·</span>
                                <span>{dateInfo.weekdayLong}</span>
                                {timeStr && (
                                    <>
                                        <span>·</span>
                                        <span className="diary-num">{timeStr}</span>
                                    </>
                                )}
                            </div>
                            <div className="mt-1 flex items-center gap-3 text-xs text-zinc-400 font-medium">
                                <span className="inline-flex items-center gap-1">
                                    <BookOpen size={11}/>
                                    共 {wordCount} 字
                                </span>
                                <span>·</span>
                                <span>{images.length} 张影像</span>
                                <span>·</span>
                                <span className="inline-flex items-center gap-1">
                                    <Clock size={11}/>
                                    预计阅读 {readMins} 分钟
                                </span>
                            </div>
                        </div>
                    </div>

                    {(moodLabel || weatherLabel) && (
                        <div
                            className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 shadow-2xs backdrop-blur-sm ${
                                isDark ? 'border-zinc-800 bg-zinc-900/90' : 'border-zinc-200/70 bg-white/90'
                            }`}
                        >
                            {entry.mood && (
                                <span className="flex items-center gap-1.5">
                                    <DiaryMoodIcon mood={entry.mood} size={16}/>
                                    <span className="text-xs font-semibold">{moodLabel}</span>
                                </span>
                            )}
                            {entry.mood && entry.weather && (
                                <span className="text-zinc-300">/</span>
                            )}
                            {entry.weather && (
                                <span className="flex items-center gap-1.5">
                                    <WeatherIcon weather={entry.weather} size={14}/>
                                    <span className="text-xs font-semibold">{weatherLabel}</span>
                                </span>
                            )}
                        </div>
                    )}
                </div>

                {/* 标题 */}
                <h1
                    className="mt-8 break-words text-2xl sm:text-[34px] font-black tracking-tight leading-snug diary-wenkai text-left"
                >
                    {entry.title}
                </h1>

                {/* 标签胶囊 */}
                {entry.tags.length > 0 && (
                    <div className="mt-4 flex flex-wrap items-center gap-2 text-left">
                        {entry.tags.map(tag => (
                            <span
                                key={tag}
                                className={`rounded-lg px-2.5 py-1 text-xs font-semibold shadow-2xs ${
                                    isDark
                                        ? 'bg-zinc-800/80 text-zinc-300'
                                        : 'bg-zinc-100 text-zinc-600'
                                }`}
                            >
                                #{tag}
                            </span>
                        ))}
                    </div>
                )}

                {/* 结构化深度正文阅读区 (方案 A：文楷两端对齐 + 随文智能穿插配图) */}
                <div
                    className={`${SIZE_CLASSES[readerSize]} ${
                        ruled ? 'diary-ruled-lines py-2' : ''
                    } ${indent ? 'diary-indent-p' : ''} mt-9 break-words diary-wenkai text-left`}
                >
                    <DiaryInlinePhotos groups={photoSchedule.get(-1)} onSelect={setLightboxIdx}/>
                    {blocks.map((block, idx) => {
                        const scheduledPhotos = photoSchedule.get(idx);

                        let blockElement = null;
                        if (block.type === 'divider') {
                            blockElement = (
                                <div key={`div-${idx}`} className="diary-prose-divider">
                                    <Sparkles size={11} className="text-amber-500"/>
                                </div>
                            );
                        } else if (block.type === 'blockquote') {
                            blockElement = (
                                <blockquote key={`quote-${idx}`} className="diary-blockquote text-left">
                                    {block.text}
                                </blockquote>
                            );
                        } else {
                            const hasIndent = block.text.startsWith('\u3000') || block.text.startsWith('  ');
                            blockElement = (
                                <p
                                    key={`p-${idx}`}
                                    data-has-indent={hasIndent}
                                    className={`text-left text-justify ${idx === 0 && blocks.length > 1 ? 'diary-lead-p' : ''}`}
                                >
                                    {block.text}
                                </p>
                            );
                        }

                        if (scheduledPhotos?.length) {
                            return <div key={`fragment-${idx}`}>
                                {blockElement}
                                <DiaryInlinePhotos groups={scheduledPhotos} onSelect={setLightboxIdx}/>
                            </div>;
                        }

                        return blockElement;
                    })}
                </div>

                {error && (
                    <p role="alert" className="mt-6 rounded-2xl bg-red-50/90 border border-red-200 p-4 text-sm text-red-600">
                        {error}
                    </p>
                )}

                {/* 页尾上下篇导航（彻底移除底部的附件式大网格，保留典雅落款） */}
                <footer
                    className={`mt-16 border-t pt-8 ${
                        isDark ? 'border-zinc-800' : 'border-black/[0.06]'
                    }`}
                >
                    <div className="flex items-center justify-between text-xs text-zinc-400 font-medium">
                        <span>记录于 {entry.entryDate}</span>
                        <span>全文完 · 感谢阅读</span>
                    </div>

                    {onSelectEntry && (prevEntry || nextEntry) && (
                        <div className="mt-6 grid gap-4 sm:grid-cols-2">
                            {prevEntry ? (
                                <button
                                    type="button"
                                    onClick={() => onSelectEntry(prevEntry)}
                                    className={`group flex items-center gap-3.5 rounded-2xl border p-4 text-left transition-all duration-300 ${
                                        isDark
                                            ? 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-600 hover:bg-zinc-900'
                                            : 'border-black/[0.06] bg-white/80 hover:border-zinc-300 hover:bg-white hover:shadow-sm'
                                    }`}
                                >
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 transition-transform group-hover:-translate-x-1">
                                        <ArrowLeft size={16}/>
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[11px] font-semibold text-zinc-400">
                                            上一篇 · {prevEntry.entryDate}
                                        </p>
                                        <p className="mt-0.5 truncate text-sm font-bold">
                                            {prevEntry.title}
                                        </p>
                                    </div>
                                </button>
                            ) : (
                                <div/>
                            )}

                            {nextEntry ? (
                                <button
                                    type="button"
                                    onClick={() => onSelectEntry(nextEntry)}
                                    className={`group flex items-center justify-end gap-3.5 rounded-2xl border p-4 text-right transition-all duration-300 ${
                                        isDark
                                            ? 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-600 hover:bg-zinc-900'
                                            : 'border-black/[0.06] bg-white/80 hover:border-zinc-300 hover:bg-white hover:shadow-sm'
                                    }`}
                                >
                                    <div className="min-w-0">
                                        <p className="text-[11px] font-semibold text-zinc-400">
                                            下一篇 · {nextEntry.entryDate}
                                        </p>
                                        <p className="mt-0.5 truncate text-sm font-bold">
                                            {nextEntry.title}
                                        </p>
                                    </div>
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 transition-transform group-hover:translate-x-1">
                                        <ArrowRight size={16}/>
                                    </div>
                                </button>
                            ) : (
                                <div/>
                            )}
                        </div>
                    )}
                </footer>
            </div>

            {/* 全屏高品质沉浸式相册灯箱 (Editorial Lightbox) */}
            {lightboxIdx !== null &&
                createPortal(
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-label="查看大图"
                        className="fixed inset-0 z-[250] flex flex-col items-center justify-between bg-black/95 p-4 sm:p-6 backdrop-blur-xl animate-in fade-in duration-200"
                    >
                        {/* 顶栏控制 */}
                        <div className="flex w-full max-w-5xl items-center justify-between text-white/80">
                            <div className="text-xs font-semibold tracking-wider font-num">
                                影像档案 · {lightboxIdx + 1} / {images.length || 1}
                            </div>
                            <button
                                type="button"
                                onClick={() => setLightboxIdx(null)}
                                className="rounded-full bg-white/10 p-2 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
                                title="关闭 (ESC)"
                            >
                                <X size={18}/>
                            </button>
                        </div>

                        {/* 主画面 */}
                        <div className="relative flex flex-1 w-full max-w-5xl items-center justify-center py-4">
                            {images.length > 1 && (
                                <button
                                    type="button"
                                    onClick={() =>
                                        setLightboxIdx(prev => (prev === null ? 0 : (prev - 1 + images.length) % images.length))
                                    }
                                    className="absolute left-2 z-10 rounded-full bg-black/40 p-2 text-white/70 backdrop-blur-sm transition-all hover:bg-white/20 hover:text-white sm:left-4"
                                    title="上一张 (←)"
                                >
                                    <ChevronLeft size={24}/>
                                </button>
                            )}

                            <div className="max-h-[82vh] max-w-full overflow-hidden rounded-xl shadow-2xl">
                                <DiaryPhoto
                                    assetId={images[lightboxIdx] || (lightboxIdx === 0 ? coverId : null)}
                                    url={lightboxIdx === 0 ? entry.coverUrl : ''}
                                    className="max-h-[82vh] max-w-full object-contain"
                                />
                            </div>

                            {images.length > 1 && (
                                <button
                                    type="button"
                                    onClick={() =>
                                        setLightboxIdx(prev => (prev === null ? 0 : (prev + 1) % images.length))
                                    }
                                    className="absolute right-2 z-10 rounded-full bg-black/40 p-2 text-white/70 backdrop-blur-sm transition-all hover:bg-white/20 hover:text-white sm:right-4"
                                    title="下一张 (→)"
                                >
                                    <ChevronRight size={24}/>
                                </button>
                            )}
                        </div>

                        {/* 底栏简短提示 */}
                        <div className="text-center text-xs text-white/40 font-medium">
                            支持键盘 ← / → 切换 · ESC 退出
                        </div>
                    </div>,
                    document.body
                )}
        </article>
    );
}
