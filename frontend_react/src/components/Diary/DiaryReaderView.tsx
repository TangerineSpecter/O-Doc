import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
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
    sm: 'text-[16px]',
    base: 'text-[17px] sm:text-[18px]',
    lg: 'text-[19px] sm:text-[21px]',
};

const WIDTH_CLASSES: Record<ReaderWidth, string> = {
    normal: 'max-w-[680px]', // 阅读版心：每行约 36~38 字
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

    // 封面多图轮播状态
    const [heroActiveIdx, setHeroActiveIdx] = useState(0);
    const heroScrollRef = useRef<HTMLDivElement>(null);

    const handleHeroScroll = useCallback(() => {
        if (!heroScrollRef.current) return;
        const {scrollLeft, clientWidth} = heroScrollRef.current;
        if (clientWidth <= 0) return;
        const newIndex = Math.round(scrollLeft / clientWidth);
        setHeroActiveIdx(Math.max(0, Math.min(images.length - 1, newIndex)));
    }, [images.length]);

    const scrollToHeroImage = (index: number) => {
        if (!heroScrollRef.current) return;
        const targetX = index * heroScrollRef.current.clientWidth;
        heroScrollRef.current.scrollTo({left: targetX, behavior: 'smooth'});
    };

    // 方案 3：标题字阶自适应与极端文本防爆兜底
    const titleRef = useRef<HTMLHeadingElement>(null);
    const [titleExpanded, setTitleExpanded] = useState(false);
    const [isClamped, setIsClamped] = useState(false);

    const visualTitleLen = useMemo(() => {
        let len = 0;
        const t = entry.title || '';
        for (let i = 0; i < t.length; i++) {
            len += t.charCodeAt(i) > 255 ? 2 : 1;
        }
        return len;
    }, [entry.title]);

    const titleScaleClass = useMemo(() => {
        if (visualTitleLen <= 32) return '';
        if (visualTitleLen <= 64) return 'diary-title-md';
        return 'diary-title-lg-text';
    }, [visualTitleLen]);

    // 切换日记时重置折叠状态
    useEffect(() => {
        setTitleExpanded(false);
        setIsClamped(false);
    }, [entry.diaryId]);

    // 真正发生 4 行截断（实际高度超出行高限制）时才显示“展开全部”；能完整容纳时不出现按钮
    useLayoutEffect(() => {
        const el = titleRef.current;
        if (!el) return;

        const checkOverflow = () => {
            if (!titleExpanded) {
                // scrollHeight 大于 clientHeight 至少 2px 说明真正被截断了第 5 行及以上
                setIsClamped(el.scrollHeight > el.clientHeight + 2);
            }
        };

        checkOverflow();
        window.addEventListener('resize', checkOverflow);
        return () => window.removeEventListener('resize', checkOverflow);
    }, [entry.title, titleExpanded, titleScaleClass]);

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

            {/* 沉浸封面大片 (Full Hero Cover)：单图展示封面，多图支持左右滑动查看 */}
            {hasHeroCover && (
                <div className="relative mx-auto max-w-[1040px] px-6 pt-6 sm:px-10 sm:pt-10">
                    {images.length > 1 ? (
                        <div className="diary-photo-frame group relative block w-full overflow-hidden rounded-xl sm:rounded-2xl bg-zinc-100 text-left">
                            {/* 横向原生 Scroll Snap 视口 */}
                            <div
                                ref={heroScrollRef}
                                onScroll={handleHeroScroll}
                                className="flex h-full w-full overflow-x-auto scrollbar-hide snap-x snap-mandatory touch-pan-x cursor-grab"
                            >
                                {images.map((id, idx) => (
                                    <div
                                        key={id || idx}
                                        className="relative shrink-0 w-full snap-center aspect-[21/9] sm:aspect-[24/10] select-none cursor-pointer"
                                        onClick={() => setLightboxIdx(idx)}
                                        title="点击全屏查看"
                                    >
                                        <DiaryPhoto
                                            assetId={id}
                                            url={idx === 0 ? entry.coverUrl : ''}
                                            className="h-full w-full object-cover select-none pointer-events-none transition-transform duration-700 ease-out"
                                        />
                                    </div>
                                ))}
                            </div>

                            {/* 桌面端左右悬浮翻页小箭头 */}
                            {heroActiveIdx > 0 && (
                                <button
                                    type="button"
                                    aria-label="查看上一张图片"
                                    onClick={e => {
                                        e.stopPropagation();
                                        scrollToHeroImage(heroActiveIdx - 1);
                                    }}
                                    className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-xs shadow-md opacity-0 transition-all duration-200 group-hover:opacity-100 hover:bg-black/75 hover:scale-110 active:scale-95 z-10"
                                >
                                    <ChevronLeft size={18}/>
                                </button>
                            )}
                            {heroActiveIdx < images.length - 1 && (
                                <button
                                    type="button"
                                    aria-label="查看下一张图片"
                                    onClick={e => {
                                        e.stopPropagation();
                                        scrollToHeroImage(heroActiveIdx + 1);
                                    }}
                                    className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-xs shadow-md opacity-0 transition-all duration-200 group-hover:opacity-100 hover:bg-black/75 hover:scale-110 active:scale-95 z-10"
                                >
                                    <ChevronRight size={18}/>
                                </button>
                            )}

                            {/* 底部居中轮播小圆点指示器 */}
                            <div className="absolute bottom-3 inset-x-0 flex items-center justify-center gap-1.5 pointer-events-none z-10">
                                {images.map((_, dotIdx) => (
                                    <span
                                        key={dotIdx}
                                        className={`h-1.5 rounded-full transition-all duration-300 shadow-xs ${
                                            dotIdx === heroActiveIdx
                                                ? 'w-4 bg-white'
                                                : 'w-1.5 bg-white/50 backdrop-blur-xs'
                                        }`}
                                    />
                                ))}
                            </div>

                            {/* 右下角：张数指示 + 全屏画卷按钮 */}
                            <div className="absolute bottom-3 right-3 flex items-center gap-2 z-10">
                                <span className="diary-num rounded-full bg-zinc-950/70 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
                                    {heroActiveIdx + 1} / {images.length}
                                </span>
                                <button
                                    type="button"
                                    onClick={e => {
                                        e.stopPropagation();
                                        setLightboxIdx(heroActiveIdx);
                                    }}
                                    title="全屏查看当前大图"
                                    className="inline-flex items-center gap-1.5 rounded-full bg-zinc-950/70 px-3 py-1 text-xs text-white backdrop-blur-sm transition-all hover:bg-black active:scale-95"
                                >
                                    <Expand size={13}/>
                                    <span>全屏画卷</span>
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setLightboxIdx(0)}
                            title="点击全屏查看封面大图"
                            className="diary-photo-frame group relative block w-full overflow-hidden rounded-xl sm:rounded-2xl bg-zinc-100 cursor-zoom-in text-left"
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
                    )}
                </div>
            )}

            <div className="mx-auto max-w-[1040px] px-6 pb-16 pt-10 sm:px-10 sm:pb-24 sm:pt-14 lg:grid lg:grid-cols-[180px_minmax(0,1fr)] lg:gap-16">
                {/* 左侧信息栏（桌面端吸顶）：日期与元信息，把正文让给右侧 */}
                <aside
                    className={`hidden text-left lg:block ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}
                >
                    <div className="sticky top-24 space-y-6 text-[13px]">
                        <div>
                            <p className={`diary-display-num text-[64px] font-bold leading-none ${isDark ? 'text-zinc-100' : 'text-zinc-900'}`}>
                                {dateInfo.dayPadded}
                            </p>
                            <p className="diary-num mt-3 tracking-[0.12em]">
                                {dateInfo.year}.{String(dateInfo.month).padStart(2, '0')}
                            </p>
                            <p className="mt-1">
                                {dateInfo.weekdayLong}
                                {timeStr && <span className="diary-num"> · {timeStr}</span>}
                            </p>
                        </div>

                        {(entry.mood || entry.weather) && (
                            <div className="space-y-2">
                                {entry.mood && (
                                    <p className="flex items-center gap-2">
                                        <DiaryMoodIcon mood={entry.mood} size={16}/>
                                        {moodLabel}
                                    </p>
                                )}
                                {entry.weather && (
                                    <p className="flex items-center gap-2">
                                        <WeatherIcon weather={entry.weather} size={14}/>
                                        {weatherLabel}
                                    </p>
                                )}
                            </div>
                        )}

                        <div className="space-y-2">
                            <p className="flex items-center gap-2">
                                <BookOpen size={12}/>
                                <span><span className="diary-num">{wordCount}</span> 字</span>
                            </p>
                            <p className="flex items-center gap-2">
                                <Clock size={12}/>
                                <span>约 <span className="diary-num">{readMins}</span> 分钟</span>
                            </p>
                        </div>

                        {entry.tags.length > 0 && (
                            <div className="flex flex-wrap gap-x-3 gap-y-1">
                                {entry.tags.map(tag => (
                                    <span key={tag} className={isDark ? 'text-zinc-500' : 'text-zinc-400'}>
                                        #{tag}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                </aside>

                <div className={`min-w-0 ${WIDTH_CLASSES[readerWidth]}`}>


                <header className="text-left">
                    <p
                        className={`diary-num flex lg:hidden flex-wrap items-center gap-x-2 text-[13px] font-medium tracking-[0.08em] ${
                            isDark ? 'text-zinc-400' : 'text-zinc-500'
                        }`}
                    >
                        <span>{dateInfo.fullCn}</span>
                        <span aria-hidden="true">·</span>
                        <span>{dateInfo.weekdayLong}</span>
                        {timeStr && (
                            <>
                                <span aria-hidden="true">·</span>
                                <span>{timeStr}</span>
                            </>
                        )}
                    </p>

                    <div className={visualTitleLen > 64 ? 'mt-3 lg:mt-0' : 'mt-4 lg:mt-0'}>
                        <h1
                            ref={titleRef}
                            className={`diary-title ${titleScaleClass} break-words text-left diary-wenkai ${
                                !titleExpanded ? 'diary-title-clamp-4' : ''
                            }`}
                        >
                            {entry.title}
                        </h1>
                        {(isClamped || titleExpanded) && (
                            <button
                                type="button"
                                onClick={() => setTitleExpanded(v => !v)}
                                className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-orange-600 hover:text-orange-700 transition-colors sm:hidden"
                            >
                                {titleExpanded ? '收起标题' : '... 展开全部'}
                            </button>
                        )}
                    </div>

                    <div
                        className={`${
                            visualTitleLen > 64 ? 'mt-3 sm:mt-5' : 'mt-5'
                        } flex lg:hidden flex-wrap items-center gap-x-4 gap-y-2 text-[13px] ${
                            isDark ? 'text-zinc-400' : 'text-zinc-500'
                        }`}
                    >
                        {entry.mood && (
                            <span className="inline-flex items-center gap-1.5">
                                <DiaryMoodIcon mood={entry.mood} size={16}/>
                                {moodLabel}
                            </span>
                        )}
                        {entry.weather && (
                            <span className="inline-flex items-center gap-1.5">
                                <WeatherIcon weather={entry.weather} size={14}/>
                                {weatherLabel}
                            </span>
                        )}
                        <span className="inline-flex items-center gap-1.5">
                            <BookOpen size={12}/>
                            <span className="diary-num">{wordCount}</span> 字
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                            <Clock size={12}/>
                            约 <span className="diary-num">{readMins}</span> 分钟读完
                        </span>
                    </div>

                    {entry.tags.length > 0 && (
                        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] lg:hidden">
                            {entry.tags.map(tag => (
                                <span key={tag} className={isDark ? 'text-zinc-500' : 'text-zinc-400'}>
                                    #{tag}
                                </span>
                            ))}
                        </div>
                    )}
                </header>

                <div className="diary-ornament" aria-hidden="true"/>

                {/* 正文阅读区：文楷、左对齐、宽松行距，随文穿插配图 */}
                <div
                    className={`${SIZE_CLASSES[readerSize]} ${
                        ruled ? 'diary-ruled-lines py-2' : ''
                    } ${indent ? 'diary-indent-p' : ''} break-words diary-wenkai text-left`}
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
                                    className={`text-left ${idx === 0 && blocks.length > 1 ? 'diary-lead-p' : ''}`}
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
                <footer className="mt-20">
                    <div className="diary-ornament" aria-hidden="true"/>
                    <p className={`text-left text-[13px] ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                        写于 <span className="diary-num">{entry.entryDate}</span> · 全文完
                    </p>

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
