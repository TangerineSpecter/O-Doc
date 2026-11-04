import {useSearchParams} from 'react-router-dom';
import {useMemo, useState} from 'react';
import {
    ArrowUpRight,
    BookHeart,
    BookOpen,
    Calendar,
    LayoutGrid,
    List,
    Maximize2,
    PenLine,
    RotateCcw,
    Search,
    Sparkles,
    X,
} from 'lucide-react';
import {useDiary} from '../hooks/useDiary';
import {diaryMoods, type DiaryEntry, type DiaryMood} from '../types/api/diary';
import DiaryBrowseFilters from '../components/Diary/DiaryBrowseFilters';
import {
    getMoodLabel,
    getWeatherLabel,
    matchesDiarySelection,
    type DiaryBrowseSelection,
} from '../components/Diary/diaryBrowse';
import DiaryCalendar from '../components/Diary/DiaryCalendar';
import DiaryCard from '../components/Diary/DiaryCard';
import DiaryTimelineItem from '../components/Diary/DiaryTimelineItem';
import DiaryPhoto from '../components/Diary/DiaryPhoto';
import {WeatherIcon} from '../components/Diary/DiaryMetadata';
import DiaryEditor from '../components/Diary/DiaryEditor';
import DiaryMoodIcon from '../components/Diary/DiaryMoodIcon';
import DiaryReaderView from '../components/Diary/DiaryReaderView';
import {
    countDiaryWords,
    groupEntriesByMonth,
    localDay,
    parseDiaryDate,
} from '../components/Diary/diaryDate';
import '../components/Diary/diary.css';

export default function DiaryPage() {
    const {entries, loading, error, retry, save, remove} = useDiary();
    const [params, setParams] = useSearchParams();
    const [browse, setBrowse] = useState<DiaryBrowseSelection>({mode: 'all', value: ''});
    const [view, setView] = useState<'cards' | 'timeline' | 'reader'>('cards');
    const [keyword, setKeyword] = useState('');
    const [selected, setSelected] = useState('');
    const [month, setMonth] = useState(() => new Date());
    const [editor, setEditor] = useState<DiaryEntry | 'new' | null>(null);
    const [initialMood, setInitialMood] = useState<DiaryMood>('');
    const [readerSelectedId, setReaderSelectedId] = useState<string>('');
    const [mobileCalendarOpen, setMobileCalendarOpen] = useState(false);
    const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
    const [spotlightOpen, setSpotlightOpen] = useState(false);
    const [spotlightIdx, setSpotlightIdx] = useState(0);
    const spotlightEntry = entries.length ? entries[spotlightIdx % entries.length] : null;

    const openSpotlight = () => {
        if (!entries.length) return;
        setSpotlightIdx(Math.floor(Math.random() * entries.length));
        setSpotlightOpen(true);
    };

    const linkedEntry = entries.find(entry => entry.diaryId === params.get('entry'));
    const activeEditor = editor || linkedEntry;

    const closeEditor = () => {
        setEditor(null);
        setInitialMood('');
        if (params.has('entry')) {
            const next = new URLSearchParams(params);
            next.delete('entry');
            setParams(next, {replace: true});
        }
    };

    const filtered = useMemo(
        () =>
            entries
                .filter(
                    entry =>
                        matchesDiarySelection(entry, browse) &&
                        (!selected || entry.entryDate === selected) &&
                        `${entry.title}\n${entry.content}\n${entry.tags.join(' ')}`
                            .toLocaleLowerCase()
                            .includes(keyword.toLocaleLowerCase())
                )
                .sort(
                    (a, b) =>
                        b.entryDate.localeCompare(a.entryDate) || b.createdAt.localeCompare(a.createdAt)
                ),
        [entries, browse, selected, keyword]
    );

    const monthGroups = useMemo(() => groupEntriesByMonth(filtered), [filtered]);

    const stats = useMemo(() => {
        const totalWords = entries.reduce((sum, e) => sum + countDiaryWords(e.content), 0);
        const uniqueDays = new Set(entries.map(e => e.entryDate)).size;
        return {totalWords, uniqueDays};
    }, [entries]);

    const todayInfo = useMemo(() => parseDiaryDate(localDay(new Date())), []);

    const activeEntryIndex =
        activeEditor && activeEditor !== 'new'
            ? filtered.findIndex(e => e.diaryId === activeEditor.diaryId)
            : -1;
    const prevModalEntry = activeEntryIndex > 0 ? filtered[activeEntryIndex - 1] : null;
    const nextModalEntry =
        activeEntryIndex >= 0 && activeEntryIndex < filtered.length - 1
            ? filtered[activeEntryIndex + 1]
            : null;

    const activeInlineEntry =
        filtered.find(e => e.diaryId === readerSelectedId) || filtered[0] || null;
    const inlineIndex = activeInlineEntry
        ? filtered.findIndex(e => e.diaryId === activeInlineEntry.diaryId)
        : -1;
    const prevInlineEntry = inlineIndex > 0 ? filtered[inlineIndex - 1] : null;
    const nextInlineEntry =
        inlineIndex >= 0 && inlineIndex < filtered.length - 1 ? filtered[inlineIndex + 1] : null;

    return (
        <div className="diary-ambient-bg min-h-[calc(100dvh-64px)] text-zinc-900 selection:bg-zinc-950 selection:text-white pb-10 sm:pb-16">
            <main className="mx-auto max-w-7xl px-3.5 py-4 sm:px-6 sm:py-8 lg:px-8">
                {/* 移动端沉浸手账 1 行刊头（高度收敛，让日记卡片首屏直接露头） */}
                <header className="flex sm:hidden items-center justify-between pb-2.5 pt-1 border-b border-zinc-200/70 mb-3">
                    <div className="flex items-baseline gap-2 min-w-0">
                        <h1 className="text-xl font-black tracking-tight text-zinc-900 shrink-0">日记</h1>
                        <span className="truncate text-xs font-medium text-zinc-400">
                            <span className="diary-num font-semibold text-zinc-700">{entries.length}</span> 篇 · {todayInfo.monthPadded}.{todayInfo.dayPadded} {todayInfo.weekdayShort}
                        </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                        {/* 搜索与分类筛选（唤起移动端顶部悬浮搜索框） */}
                        <button
                            type="button"
                            aria-label="打开搜索与分类筛选"
                            onClick={() => setMobileSearchOpen(true)}
                            className={`relative flex h-8 w-8 items-center justify-center rounded-full border transition-all ${
                                keyword || browse.mode !== 'all'
                                    ? 'border-zinc-900 bg-zinc-900 text-white shadow-xs'
                                    : 'border-zinc-200 bg-white text-zinc-600 active:bg-zinc-100'
                            }`}
                            title="搜索与分类筛选"
                        >
                            <Search size={14}/>
                            {(keyword || browse.mode !== 'all') && (
                                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-orange-500 ring-2 ring-white"/>
                            )}
                        </button>

                        {/* 日历抽屉 */}
                        <button
                            type="button"
                            aria-label="打开日历"
                            onClick={() => setMobileCalendarOpen(true)}
                            className={`flex h-8 w-8 items-center justify-center rounded-full border transition-all ${
                                selected
                                    ? 'border-orange-500 bg-orange-50 text-orange-600'
                                    : 'border-zinc-200 bg-white text-zinc-600 active:bg-zinc-100'
                            }`}
                            title="日历与打卡"
                        >
                            <Calendar size={14}/>
                        </button>

                        {/* 往日重温时光胶囊 */}
                        <button
                            type="button"
                            disabled={loading || entries.length === 0}
                            onClick={openSpotlight}
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 bg-white text-amber-500 transition-all active:bg-amber-50 active:scale-95 disabled:opacity-40"
                            title="往日重温 · 时光胶囊"
                        >
                            <Sparkles size={14}/>
                        </button>

                        {/* 视图切换 (画报卡片 ⊞ / 岁月长卷 ≡) */}
                        <button
                            type="button"
                            aria-label={view === 'cards' ? '切换为长卷列表' : '切换为画报卡片'}
                            onClick={() => setView(v => (v === 'cards' ? 'timeline' : 'cards'))}
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-600 transition-all active:bg-zinc-100"
                            title={view === 'cards' ? '切换为长卷列表' : '切换为画报卡片'}
                        >
                            {view === 'cards' ? <List size={14}/> : <LayoutGrid size={14}/>}
                        </button>

                        {/* 写日记小胶囊 */}
                        <button
                            type="button"
                            disabled={loading}
                            onClick={() => {
                                setInitialMood('');
                                setEditor('new');
                            }}
                            className="inline-flex h-8 items-center gap-1 rounded-full bg-zinc-900 px-2.5 text-xs font-semibold text-white shadow-xs active:scale-95 disabled:opacity-50"
                        >
                            <PenLine size={13}/>
                            <span>记</span>
                        </button>
                    </div>
                </header>

                {/* 桌面端舒展刊头（保留宽屏杂志风排版） */}
                <header className="hidden sm:flex flex-col gap-3 pb-4 pt-1 sm:gap-6 sm:pb-8 sm:pt-2 md:flex-row md:items-end md:justify-between">
                    <div>
                        <p className="diary-num text-xs font-medium tracking-[0.08em] text-zinc-500 sm:text-[13px]">
                            {todayInfo.fullCn} · {todayInfo.weekdayLong}
                        </p>
                        <div className="mt-1 flex items-baseline gap-2.5 sm:mt-2">
                            <h1 className="text-2xl font-black tracking-tight text-zinc-900 sm:text-5xl">日记</h1>
                            <p className="text-xs text-zinc-500 sm:text-sm">
                                <span className="diary-num font-semibold text-zinc-800">{entries.length}</span> 篇
                                <span className="mx-1 text-zinc-300 sm:mx-2">/</span>
                                <span className="diary-num font-semibold text-zinc-800">{stats.totalWords.toLocaleString()}</span> 字
                                <span className="mx-1 text-zinc-300 sm:mx-2">/</span>
                                <span className="diary-num font-semibold text-zinc-800">{stats.uniqueDays}</span> 天
                            </p>
                        </div>
                    </div>

                    {/* 桌面端心情选择器与写日记按钮 */}
                    <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-4">
                        <div className="flex max-w-full items-center gap-0.5 overflow-x-auto scrollbar-hide py-0.5">
                            <span className="mr-1.5 shrink-0 text-xs text-zinc-400">今天心情</span>
                            {diaryMoods.map(m => (
                                <button
                                    type="button"
                                    key={m.value}
                                    title={`以「${m.label}」心情写日记`}
                                    disabled={loading}
                                    onClick={() => {
                                        setInitialMood(m.value);
                                        setEditor('new');
                                    }}
                                    className="shrink-0 rounded-full p-1.5 transition-all hover:scale-110 hover:bg-zinc-100 active:scale-95 disabled:opacity-40"
                                >
                                    <DiaryMoodIcon mood={m.value} size={18}/>
                                </button>
                            ))}
                        </div>

                        <button
                            type="button"
                            disabled={loading}
                            onClick={() => {
                                setInitialMood('');
                                setEditor('new');
                            }}
                            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-zinc-900 px-5 text-sm font-semibold text-white transition-colors hover:bg-black disabled:cursor-wait disabled:opacity-50"
                        >
                            <PenLine size={15} strokeWidth={2.2}/>
                            写日记
                        </button>
                    </div>
                </header>

                {/* 桌面端平铺工具栏 */}
                <div className="hidden sm:flex mb-5 flex-col items-stretch gap-3 border-y border-zinc-200/70 py-2.5 sm:mb-8 sm:gap-4 sm:py-3 lg:flex-row lg:items-center lg:justify-between">
                    <DiaryBrowseFilters entries={entries} selection={browse} onChange={setBrowse}/>

                    <div className="flex items-center gap-2 sm:gap-3">
                        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 transition-colors focus-within:border-zinc-900 sm:w-64 sm:flex-initial">
                            <Search size={14} className="shrink-0 text-zinc-400"/>
                            <input
                                aria-label="搜索日记"
                                value={keyword}
                                onChange={e => setKeyword(e.target.value)}
                                placeholder="搜索标题、正文或标签…"
                                className="w-full bg-transparent text-xs sm:text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
                            />
                            {keyword && (
                                <button
                                    type="button"
                                    aria-label="清空搜索关键词"
                                    onClick={() => setKeyword('')}
                                    className="rounded-full p-0.5 text-zinc-400 hover:text-zinc-900"
                                >
                                    <X size={13}/>
                                </button>
                            )}
                        </label>

                        {/* 桌面端/平板端日历快速唤起按钮（lg 大屏有右侧日历，此处隐藏） */}
                        <button
                            type="button"
                            aria-label="打开日历"
                            title="日历与往日"
                            onClick={() => setMobileCalendarOpen(true)}
                            className={`flex lg:hidden h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-all ${
                                selected
                                    ? 'border-orange-500 bg-orange-50 text-orange-600'
                                    : 'border-zinc-200 bg-white text-zinc-600 active:bg-zinc-100'
                            }`}
                        >
                            <Calendar size={14}/>
                        </button>

                        <div className="inline-flex shrink-0 rounded-full bg-zinc-100 p-1">
                            {(
                                [
                                    {id: 'cards', label: '卡片画报', text: '画报', icon: LayoutGrid, mobile: true},
                                    {id: 'timeline', label: '岁月长卷', text: '长卷', icon: List, mobile: true},
                                    {id: 'reader', label: '沉浸书房', text: '书房', icon: BookOpen, mobile: false},
                                ] as const
                            ).map(v => {
                                const Icon = v.icon;
                                const active = view === v.id;
                                return (
                                    <button
                                        type="button"
                                        key={v.id}
                                        aria-label={v.label}
                                        aria-pressed={active}
                                        onClick={() => setView(v.id)}
                                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold transition-all sm:px-3.5 ${
                                            !v.mobile ? 'hidden sm:inline-flex' : ''
                                        } ${
                                            active
                                                ? 'bg-white text-zinc-950 shadow-xs'
                                                : 'text-zinc-500 hover:text-zinc-950'
                                        }`}
                                    >
                                        <Icon size={14}/>
                                        <span className="hidden sm:inline">{v.text}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {!loading && params.has('entry') && !linkedEntry && (
                    <p
                        role="alert"
                        className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                    >
                        这篇日记不存在、已删除或无权查看。
                    </p>
                )}

                {/* 移动端当前搜索与筛选摘要条（悬浮搜索收起后若有过滤条件则显示） */}
                {(keyword || browse.mode !== 'all') && (
                    <div className="mb-3 flex sm:hidden items-center justify-between rounded-xl border border-zinc-200/80 bg-zinc-50/80 px-3.5 py-2 text-xs">
                        <div className="flex items-center gap-1.5 min-w-0 text-zinc-700 font-medium">
                            <Search size={13} className="shrink-0 text-orange-500"/>
                            <span className="truncate">
                                {keyword && <span>“<strong className="font-bold text-zinc-900">{keyword}</strong>”</span>}
                                {keyword && browse.mode !== 'all' && <span className="mx-1 text-zinc-400">·</span>}
                                {browse.mode !== 'all' && (
                                    <span>
                                        {browse.mode === 'mood' && `心情：${getMoodLabel((browse.value || '') as any)}`}
                                        {browse.mode === 'weather' && `天气：${getWeatherLabel((browse.value || '') as any)}`}
                                        {browse.mode === 'tags' && `标签：#${browse.value}`}
                                    </span>
                                )}
                                <span className="ml-1.5 font-normal text-zinc-400">({filtered.length}篇)</span>
                            </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <button
                                type="button"
                                onClick={() => setMobileSearchOpen(true)}
                                className="text-[11px] font-bold text-zinc-700 underline hover:text-black"
                            >
                                调整
                            </button>
                            <button
                                type="button"
                                aria-label="清空搜索与筛选"
                                onClick={() => {
                                    setKeyword('');
                                    setBrowse({mode: 'all', value: ''});
                                }}
                                className="inline-flex items-center gap-0.5 rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-bold text-zinc-700 hover:bg-zinc-300"
                            >
                                <X size={11}/>
                                <span>清空</span>
                            </button>
                        </div>
                    </div>
                )}

                {selected && (
                    <div className="mb-4 flex items-center justify-between rounded-xl border border-zinc-200/80 bg-zinc-50/80 px-3.5 py-2 sm:mb-5">
                        <div className="flex items-center gap-2 text-xs font-medium text-zinc-700">
                            <Calendar size={13} className="text-orange-500"/>
                            <span>已筛选日期：<strong className="font-bold text-zinc-900">{selected}</strong></span>
                        </div>
                        <button
                            type="button"
                            onClick={() => setSelected('')}
                            className="inline-flex items-center gap-1 rounded-full bg-zinc-950 px-2.5 py-1 text-[11px] font-bold text-white shadow-2xs hover:bg-black"
                        >
                            <span>清除筛选</span>
                            <X size={12}/>
                        </button>
                    </div>
                )}

                {/* 主体区域：左侧内容流 + 右侧月历卡 */}
                <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
                    <section aria-label="日记列表" className="min-w-0">
                        {loading ? (
                            <div role="status" className="grid gap-4 sm:gap-5 sm:grid-cols-2 xl:grid-cols-3">
                                <span className="sr-only">正在加载日记</span>
                                {[1, 2, 3, 4, 5, 6].map(n => (
                                    <div key={n} className="h-64 animate-pulse rounded-2xl bg-white/60 border border-zinc-200/50 shadow-xs"/>
                                ))}
                            </div>
                        ) : error ? (
                            <div
                                role="alert"
                                className="diary-art-card p-12 text-center"
                            >
                                <p className="text-sm font-medium text-zinc-600">{error}</p>
                                <button
                                    type="button"
                                    onClick={retry}
                                    className="mt-4 rounded-full bg-zinc-950 px-5 py-2 text-xs font-semibold text-white shadow-xs"
                                >
                                    重新加载
                                </button>
                            </div>
                        ) : !filtered.length ? (
                            <div className="diary-art-card px-6 py-20 text-center">
                                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100/80 text-zinc-700 shadow-2xs">
                                    <BookHeart size={26}/>
                                </div>
                                <h2 className="mt-5 text-base font-bold text-zinc-900">
                                    {entries.length ? '没有找到匹配的日记' : '从今天开始记录生活'}
                                </h2>
                                <p className="mt-1.5 text-sm text-zinc-500">
                                    {entries.length
                                        ? '试试其他关键词、心情、天气、标签或日期。'
                                        : '每一次随手写下的文字，都是日后的珍贵回忆。'}
                                </p>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (entries.length) {
                                            setBrowse({mode: 'all', value: ''});
                                            setKeyword('');
                                            setSelected('');
                                        } else {
                                            setInitialMood('');
                                            setEditor('new');
                                        }
                                    }}
                                    className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-zinc-950 px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-black"
                                >
                                    {entries.length ? '清除筛选条件' : '写第一篇日记'}
                                </button>
                            </div>
                        ) : view === 'cards' ? (
                            /* 视图 1：现代错落流式画报排版 (Masonry Editorial Flow) */
                            <div className="columns-1 sm:columns-2 xl:columns-3 gap-4 sm:gap-5 [column-fill:_balance]">
                                {filtered.map(entry => (
                                    <DiaryCard
                                        key={entry.diaryId}
                                        entry={entry}
                                        onOpen={() => setEditor(entry)}
                                    />
                                ))}
                            </div>
                        ) : view === 'timeline' ? (
                            /* 视图 2：岁月长卷（真正的清爽时间流列表） */
                            <div className="space-y-8 sm:space-y-10">
                                {monthGroups.map(group => (
                                    <div key={group.yearMonth} className="space-y-3">
                                        <div className="flex items-center justify-between border-b border-zinc-200/80 pb-2.5 px-1">
                                            <div className="flex items-baseline gap-2">
                                                <h2 className="text-base sm:text-lg font-black tracking-tight text-zinc-950">
                                                    {group.year} 年 {group.month} 月
                                                </h2>
                                                <span className="text-xs font-medium text-zinc-400">
                                                    / {group.entries.length} 篇生活碎片
                                                </span>
                                            </div>
                                            <span className="diary-num text-xs font-semibold text-zinc-500">
                                                {group.totalWords.toLocaleString()} 字
                                            </span>
                                        </div>

                                        <div className="rounded-2xl border border-zinc-200/80 bg-white p-1 divide-y divide-zinc-100 shadow-2xs">
                                            {group.entries.map(entry => (
                                                <DiaryTimelineItem
                                                    key={entry.diaryId}
                                                    entry={entry}
                                                    onOpen={() => setEditor(entry)}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            /* 视图 3：沉浸书房（左侧目录列表 + 右侧纯净全文） */
                            <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
                                <div className="max-h-[82dvh] space-y-2 overflow-y-auto rounded-2xl border border-black/[0.06] bg-white/85 p-3 shadow-xs backdrop-blur-md scrollbar-hide">
                                    <div className="flex items-center justify-between px-3 py-2 text-xs font-bold text-zinc-400 uppercase tracking-wider">
                                        <span>文章目录 ({filtered.length})</span>
                                        <span>点击阅读</span>
                                    </div>
                                    {filtered.map(item => {
                                        const isCurrent = activeInlineEntry?.diaryId === item.diaryId;
                                        const d = parseDiaryDate(item.entryDate);
                                        return (
                                            <button
                                                type="button"
                                                key={item.diaryId}
                                                onClick={() => setReaderSelectedId(item.diaryId)}
                                                className={`w-full rounded-xl border p-3.5 text-left transition-all ${
                                                    isCurrent
                                                        ? 'border-zinc-950 bg-zinc-950 text-white shadow-xs'
                                                        : 'border-transparent bg-zinc-50/60 text-zinc-900 hover:border-zinc-200 hover:bg-white hover:shadow-2xs'
                                                }`}
                                            >
                                                <div className="flex items-center justify-between text-[11px]">
                                                    <span
                                                        className={`font-semibold ${
                                                            isCurrent ? 'text-zinc-300' : 'text-zinc-400'
                                                        }`}
                                                    >
                                                        {item.entryDate}（{d.weekdayShort}）
                                                    </span>
                                                    {item.mood && <DiaryMoodIcon mood={item.mood} size={15}/>}
                                                </div>
                                                <p className="mt-1.5 truncate text-sm font-bold">
                                                    {item.title}
                                                </p>
                                            </button>
                                        );
                                    })}
                                </div>

                                {activeInlineEntry && (
                                    <div className="diary-art-card overflow-hidden">
                                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 bg-white/60 px-6 py-3.5 backdrop-blur-xs">
                                            <span className="text-xs font-semibold text-zinc-400">
                                                第 {inlineIndex + 1} / {filtered.length} 篇
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => setEditor(activeInlineEntry)}
                                                className="inline-flex items-center gap-1.5 rounded-full bg-zinc-950 px-4 py-1.5 text-xs font-bold text-white transition-all hover:bg-black shadow-xs"
                                            >
                                                <Maximize2 size={12}/>
                                                全屏沉浸阅读
                                            </button>
                                        </div>

                                        <DiaryReaderView
                                            entry={activeInlineEntry}
                                            showControlsBar
                                            prevEntry={prevInlineEntry}
                                            nextEntry={nextInlineEntry}
                                            onSelectEntry={next => setReaderSelectedId(next.diaryId)}
                                        />
                                    </div>
                                )}
                            </div>
                        )}
                    </section>

                    {/* 桌面端常驻右侧侧边栏 */}
                    <div className="hidden lg:block">
                        <DiaryCalendar
                            month={month}
                            onMonth={setMonth}
                            entries={entries}
                            selected={selected}
                            onSelect={setSelected}
                            onOpenEntry={entry => setEditor(entry)}
                        />
                    </div>
                </div>

                {/* 移动端悬浮搜索框与筛选浮层 */}
                {mobileSearchOpen && (
                    <div
                        data-modal-scroll-lock
                        className="fixed inset-0 z-[100] flex flex-col items-center justify-start bg-black/40 backdrop-blur-xs p-3.5 pt-4 transition-opacity sm:hidden"
                        onClick={() => setMobileSearchOpen(false)}
                    >
                        <div
                            role="dialog"
                            aria-modal="true"
                            aria-label="搜索与分类筛选"
                            className="w-full max-w-lg rounded-2xl bg-white p-3.5 shadow-2xl border border-zinc-200/90 animate-in slide-in-from-top-3 duration-200"
                            onClick={e => e.stopPropagation()}
                        >
                            {/* 顶部搜索输入框与完成按钮 */}
                            <div className="flex items-center gap-2">
                                <label className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50/80 px-3 py-1.5 transition-colors focus-within:border-zinc-900 focus-within:bg-white">
                                    <Search size={14} className="shrink-0 text-zinc-400"/>
                                    <input
                                        aria-label="搜索日记"
                                        value={keyword}
                                        onChange={e => setKeyword(e.target.value)}
                                        placeholder="搜索标题、正文或标签…"
                                        className="w-full bg-transparent text-xs text-zinc-900 outline-none placeholder:text-zinc-400"
                                        autoFocus
                                    />
                                    {keyword && (
                                        <button
                                            type="button"
                                            aria-label="清空搜索关键词"
                                            onClick={() => setKeyword('')}
                                            className="rounded-full p-0.5 text-zinc-400 hover:text-zinc-900"
                                        >
                                            <X size={13}/>
                                        </button>
                                    )}
                                </label>
                                <button
                                    type="button"
                                    onClick={() => setMobileSearchOpen(false)}
                                    className="shrink-0 rounded-full bg-zinc-900 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs active:scale-95"
                                >
                                    完成
                                </button>
                            </div>

                            {/* 分类筛选标签条（全部/心情/天气/标签） */}
                            <div className="mt-2.5 pt-2 border-t border-zinc-150/70">
                                <DiaryBrowseFilters entries={entries} selection={browse} onChange={setBrowse}/>
                            </div>

                            {/* 匹配结果篇数与重置按钮 */}
                            {(keyword || browse.mode !== 'all') && (
                                <div className="mt-2.5 pt-2 border-t border-zinc-100 flex items-center justify-between text-[11px] text-zinc-500">
                                    <span>
                                        匹配到 <strong className="font-bold text-zinc-900">{filtered.length}</strong> 篇日记
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setKeyword('');
                                            setBrowse({mode: 'all', value: ''});
                                        }}
                                        className="font-semibold text-orange-600 hover:underline"
                                    >
                                        重置筛选
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* 移动端日历抽屉模态框 */}
                {mobileCalendarOpen && (
                    <div
                        data-modal-scroll-lock
                        className="fixed inset-0 z-[100] flex flex-col justify-end bg-black/50 backdrop-blur-xs transition-opacity lg:hidden"
                        onClick={() => setMobileCalendarOpen(false)}
                    >
                        <div
                            role="dialog"
                            aria-modal="true"
                            aria-label="日历与日期筛选"
                            className="max-h-[88dvh] w-full overflow-y-auto rounded-t-3xl bg-white px-4 pt-3 pb-6 shadow-2xl transition-transform animate-in slide-in-from-bottom scrollbar-hide"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="mx-auto mb-2.5 h-1.5 w-12 rounded-full bg-zinc-200"/>
                            <div className="mb-2 flex items-center justify-between px-1">
                                <h3 className="text-sm font-bold text-zinc-900">日历与日期筛选</h3>
                                <button
                                    type="button"
                                    aria-label="关闭日历"
                                    onClick={() => setMobileCalendarOpen(false)}
                                    className="rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-800"
                                >
                                    <X size={18}/>
                                </button>
                            </div>
                            <DiaryCalendar
                                month={month}
                                onMonth={setMonth}
                                entries={entries}
                                selected={selected}
                                onSelect={day => {
                                    setSelected(day);
                                    setMobileCalendarOpen(false);
                                }}
                                onOpenEntry={entry => {
                                    setMobileCalendarOpen(false);
                                    setEditor(entry);
                                }}
                                variant="plain"
                                hideSpotlight={true}
                            />
                        </div>
                    </div>
                )}

                {/* 往日重温时光卡片抽屉/弹窗 */}
                {spotlightOpen && spotlightEntry && (
                    <div
                        data-modal-scroll-lock
                        className="fixed inset-0 z-[100] flex flex-col justify-end sm:justify-center items-center bg-black/50 backdrop-blur-xs transition-opacity p-0 sm:p-4"
                        onClick={() => setSpotlightOpen(false)}
                    >
                        <div
                            role="dialog"
                            aria-modal="true"
                            aria-label="往日重温"
                            className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-white p-5 sm:p-6 shadow-2xl transition-transform animate-in slide-in-from-bottom sm:zoom-in-95 scrollbar-hide max-h-[90dvh] overflow-y-auto"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="mx-auto mb-2.5 h-1.5 w-12 rounded-full bg-zinc-200 sm:hidden"/>

                            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
                                <div className="flex items-center gap-2">
                                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-50 text-amber-500">
                                        <Sparkles size={15}/>
                                    </span>
                                    <h3 className="text-sm font-bold text-zinc-900">往日重温 · 时光记忆</h3>
                                </div>
                                <div className="flex items-center gap-2">
                                    {entries.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => setSpotlightIdx(n => (n + 1) % entries.length)}
                                            className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 active:scale-95"
                                        >
                                            <RotateCcw size={11}/>
                                            <span>换一篇</span>
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        aria-label="关闭"
                                        onClick={() => setSpotlightOpen(false)}
                                        className="rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-800"
                                    >
                                        <X size={18}/>
                                    </button>
                                </div>
                            </div>

                            {/* 记忆卡片内容区 */}
                            <div className="mt-4 space-y-3">
                                {(spotlightEntry.coverUrl || (spotlightEntry.imageAssetIds && spotlightEntry.imageAssetIds.length > 0)) && (
                                    <div className="relative h-40 sm:h-48 w-full overflow-hidden rounded-2xl bg-zinc-100 border border-zinc-200/60 shadow-2xs">
                                        <DiaryPhoto
                                            assetId={spotlightEntry.imageAssetIds?.[0] || spotlightEntry.coverAssetId}
                                            url={spotlightEntry.coverUrl}
                                            className="h-full w-full object-cover"
                                        />
                                    </div>
                                )}

                                <div>
                                    <div className="flex items-center justify-between text-xs text-zinc-400">
                                        <span className="font-semibold text-zinc-600">
                                            {parseDiaryDate(spotlightEntry.entryDate).fullCn} · {parseDiaryDate(spotlightEntry.entryDate).weekdayLong}
                                        </span>
                                        <div className="flex items-center gap-1.5">
                                            {spotlightEntry.mood && (
                                                <span title={getMoodLabel(spotlightEntry.mood)}>
                                                    <DiaryMoodIcon mood={spotlightEntry.mood} size={15}/>
                                                </span>
                                            )}
                                            {spotlightEntry.weather && (
                                                <span title={getWeatherLabel(spotlightEntry.weather)}>
                                                    <WeatherIcon weather={spotlightEntry.weather} size={13}/>
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <h4 className="diary-wenkai mt-2 text-base sm:text-lg font-bold text-zinc-900">
                                        {spotlightEntry.title || '无标题日记'}
                                    </h4>

                                    <p className="diary-wenkai line-clamp-3 text-xs sm:text-sm leading-relaxed text-zinc-600 mt-1.5">
                                        {spotlightEntry.content.replace(/^#+\s+/gm, '').replace(/^>\s?/gm, '').trim()}
                                    </p>
                                </div>
                            </div>

                            {/* 底部展卷阅读 */}
                            <div className="mt-5 pt-3 border-t border-zinc-100 flex items-center justify-between">
                                <span className="text-xs text-zinc-400">
                                    {countDiaryWords(spotlightEntry.content)} 字
                                </span>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSpotlightOpen(false);
                                        setEditor(spotlightEntry);
                                    }}
                                    className="inline-flex items-center gap-1.5 rounded-full bg-zinc-950 px-5 py-2 text-xs font-bold text-white shadow-xs transition-transform active:scale-95 hover:bg-black"
                                >
                                    <BookOpen size={13}/>
                                    <span>展卷阅读全文</span>
                                    <ArrowUpRight size={13}/>
                                </button>
                            </div>
                        </div>
                    </div>
                )}



                {activeEditor && (
                    <DiaryEditor
                        key={activeEditor === 'new' ? `new-${initialMood}` : activeEditor.diaryId}
                        entry={activeEditor === 'new' ? undefined : activeEditor}
                        initialMood={initialMood}
                        prevEntry={prevModalEntry}
                        nextEntry={nextModalEntry}
                        onSelectEntry={next => setEditor(next)}
                        onClose={closeEditor}
                        onSave={save}
                        onDelete={remove}
                    />
                )}
            </main>
        </div>
    );
}
