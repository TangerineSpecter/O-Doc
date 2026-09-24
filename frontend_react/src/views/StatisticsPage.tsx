import {useEffect, useRef, useState} from 'react';
import {
    BookOpen,
    Calendar,
    Clock,
    Database,
    Download,
    FileText,
    Hash,
    Image as ImageIcon,
    Layers,
    Loader2,
    MousePointer,
    PenLine,
    Sparkles,
    StickyNote,
    X
} from 'lucide-react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Legend,
    Line,
    LineChart,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis
} from 'recharts';
import {getStatisticsData, StatsDashboardData} from '../api/stats';
import {getWhiteboardList} from '../api/whiteboard';
import {Select, SelectOption} from '../components/common/Select';
import PageLoading from '../components/common/PageLoading';

// 预定义颜色，用于分类图表
const COLORS = ['#3b82f6', '#f97316', '#ec4899', '#10b981', '#8b5cf6', '#6366f1', '#14b8a6', '#f43f5e'];
const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];
const MONTH_LABELS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

interface CustomTooltipProps {
    active?: boolean;
    payload?: any[];
    label?: string;
}

const CustomTooltip = ({active, payload, label}: CustomTooltipProps) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-white p-3 border border-slate-100 shadow-lg rounded-xl text-xs z-50">
                <p className="font-bold text-slate-700 mb-2">{label}</p>
                {payload.map((entry, index) => (
                    <div key={index} className="flex items-center gap-2 mb-1 last:mb-0">
                        <div className="w-2 h-2 rounded-full" style={{backgroundColor: entry.color}}></div>
                        <span className="text-slate-500">{entry.name}:</span>
                        <span className="font-mono font-bold text-slate-700">
                            {entry.value} {entry.unit}
                        </span>
                    </div>
                ))}
            </div>
        );
    }
    return null;
};

interface CreationDay {
    date: string;
    articles: number;
    images: number;
    memos: number;
    prompts: number;
    whiteboards: number;
    total: number;
}

type HeatmapCell = CreationDay & {
    isBlank?: boolean;
    dayOfWeek: number;
};

interface HeatmapHoverState {
    cell: HeatmapCell;
    x: number;
    y: number;
}

const formatDateKey = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const buildWhiteboardDailyCounts = (year: number, documents: {createdAt: number}[]) => {
    const counts = new Map<string, number>();
    documents.forEach((document) => {
        const createdAt = new Date(document.createdAt);
        if (Number.isNaN(createdAt.getTime()) || createdAt.getFullYear() !== year) return;
        const dateKey = formatDateKey(createdAt);
        counts.set(dateKey, (counts.get(dateKey) || 0) + 1);
    });
    return counts;
};

const getIntensityClass = (count: number, maxCount: number) => {
    if (count <= 0 || maxCount <= 0) return 'bg-slate-100 border-slate-100';
    const ratio = count / maxCount;
    if (ratio >= 0.75) return 'bg-orange-600 border-orange-600';
    if (ratio >= 0.5) return 'bg-orange-400 border-orange-400';
    if (ratio >= 0.25) return 'bg-orange-300 border-orange-300';
    return 'bg-orange-100 border-orange-100';
};

const buildHeatmapCells = (year: number, dailyCreation: StatsDashboardData['dailyCreation'], whiteboardCounts: Map<string, number>): HeatmapCell[] => {
    const serverDailyMap = new Map(dailyCreation.map((item) => [item.date, item]));
    const cells: HeatmapCell[] = [];

    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31);

    for (let i = 0; i < startDate.getDay(); i += 1) {
        cells.push({
            date: `blank-${i}`,
            articles: 0,
            images: 0,
            memos: 0,
            prompts: 0,
            whiteboards: 0,
            total: 0,
            isBlank: true,
            dayOfWeek: i,
        });
    }

    for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
        const dateKey = formatDateKey(date);
        const serverItem = serverDailyMap.get(dateKey);
        const whiteboards = whiteboardCounts.get(dateKey) || 0;
        const articles = serverItem?.articles || 0;
        const images = serverItem?.images || 0;
        const memos = serverItem?.memos || 0;
        const prompts = serverItem?.prompts || 0;

        cells.push({
            date: dateKey,
            articles,
            images,
            memos,
            prompts,
            whiteboards,
            total: articles + images + memos + prompts + whiteboards,
            dayOfWeek: date.getDay(),
        });
    }

    return cells;
};

const getMonthMarkers = (cells: HeatmapCell[]) => {
    const markers: {label: string; column: number}[] = [];
    let previousMonth = -1;

    cells.forEach((cell, index) => {
        if (cell.isBlank) return;
        const date = new Date(`${cell.date}T00:00:00`);
        const month = date.getMonth();
        if (month === previousMonth) return;

        previousMonth = month;
        markers.push({
            label: MONTH_LABELS[month],
            column: Math.floor(index / 7) + 1,
        });
    });

    return markers;
};

const formatHeatmapDate = (dateKey: string) => {
    const date = new Date(`${dateKey}T00:00:00`);
    if (Number.isNaN(date.getTime())) return dateKey;

    return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long',
    });
};

const formatShortHeatmapDate = (dateKey: string) => {
    const date = new Date(`${dateKey}T00:00:00`);
    if (Number.isNaN(date.getTime())) return dateKey;

    return date.toLocaleDateString('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        weekday: 'short',
    });
};

export default function StatisticsPage() {
    const currentYear = new Date().getFullYear();
    const [loading, setLoading] = useState(true);
    const [heatmapLoading, setHeatmapLoading] = useState(false);
    const [data, setData] = useState<StatsDashboardData | null>(null);
    const [selectedYear, setSelectedYear] = useState(currentYear);
    const [heatmapHover, setHeatmapHover] = useState<HeatmapHoverState | null>(null);
    const [selectedCell, setSelectedCell] = useState<HeatmapCell | null>(null);
    const [whiteboardCounts, setWhiteboardCounts] = useState<Map<string, number>>(new Map());
    const heatmapTooltipRef = useRef<HTMLDivElement | null>(null);
    const heatmapHoverPositionRef = useRef({x: 0, y: 0});
    const heatmapHoverFrameRef = useRef<number | null>(null);

    const updateHeatmapTooltipPosition = (x: number, y: number) => {
        heatmapHoverPositionRef.current = {x, y};
        if (heatmapHoverFrameRef.current !== null) return;

        heatmapHoverFrameRef.current = window.requestAnimationFrame(() => {
            heatmapHoverFrameRef.current = null;
            const tooltip = heatmapTooltipRef.current;
            if (!tooltip) return;

            const {x: pointerX, y: pointerY} = heatmapHoverPositionRef.current;
            const left = Math.min(pointerX + 14, window.innerWidth - 240);
            const top = Math.max(pointerY - 18, 12);
            tooltip.style.transform = `translate3d(${left}px, ${top}px, 0)`;
        });
    };

    const clearHeatmapHover = () => {
        if (heatmapHoverFrameRef.current !== null) {
            window.cancelAnimationFrame(heatmapHoverFrameRef.current);
            heatmapHoverFrameRef.current = null;
        }
        setHeatmapHover(null);
    };

    useEffect(() => () => {
        if (heatmapHoverFrameRef.current !== null) {
            window.cancelAnimationFrame(heatmapHoverFrameRef.current);
        }
    }, []);

    useEffect(() => {
        let ignore = false;

        const fetchData = async () => {
            const isInitialLoad = data === null;
            try {
                if (isInitialLoad) {
                    setLoading(true);
                } else {
                    setHeatmapLoading(true);
                    setHeatmapHover(null);
                    setSelectedCell(null);
                }

                const [res, whiteboards] = await Promise.all([
                    getStatisticsData(selectedYear),
                    getWhiteboardList().catch((error) => {
                        console.warn('Failed to fetch whiteboard stats:', error);
                        return [];
                    }),
                ]);
                if (ignore) return;

                setWhiteboardCounts(buildWhiteboardDailyCounts(selectedYear, whiteboards));

                setData((prev) => {
                    if (!prev) return res;
                    return {
                        ...prev,
                        dailyCreation: res.dailyCreation,
                        selectedYear: res.selectedYear,
                    };
                });
            } catch (error) {
                console.error("Failed to fetch stats:", error);
            } finally {
                if (ignore) return;
                if (isInitialLoad) {
                    setLoading(false);
                } else {
                    setHeatmapLoading(false);
                }
            }
        };

        fetchData();

        return () => {
            ignore = true;
        };
    }, [selectedYear]);

    if (loading) {
        return <PageLoading message="正在分析数据..." minHeight="min-h-[calc(100vh-160px)]" />;
    }

    if (!data) return null;

    // 为分类数据添加颜色
    const categoryDataWithColor = data.categoryStats.map((item, index) => ({
        ...item,
        color: COLORS[index % COLORS.length]
    }));

    // 格式化字数 (例如 1.2m)
    const formatWordCount = (count: number) => {
        if (count > 1000000) return (count / 1000000).toFixed(1) + 'm';
        if (count > 1000) return (count / 1000).toFixed(1) + 'k';
        return count.toString();
    };

    const yearOptions: SelectOption<string>[] = Array.from({length: 6}, (_, index) => {
        const year = currentYear - index;
        return {
            value: String(year),
            label: `${year} 年`,
            description: year === currentYear ? '今年' : '历史年份',
        };
    });

    const heatmapCells = buildHeatmapCells(selectedYear, data.dailyCreation, whiteboardCounts);
    const monthMarkers = getMonthMarkers(heatmapCells);
    const maxCreationCount = heatmapCells.reduce((max, item) => Math.max(max, item.total), 0);
    const yearlyCreationTotal = heatmapCells.reduce((total, item) => total + item.total, 0);
    const activeDaysCount = heatmapCells.filter((item) => !item.isBlank && item.total > 0).length;
    const heatmapColumnCount = Math.ceil(heatmapCells.length / 7);
    const heatmapColumnWidth = 17;
    const heatmapWidth = heatmapColumnCount * heatmapColumnWidth;

    return (
        <div
            className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 py-4 sm:py-8">

            {/* Header */}
            <div className="flex items-center justify-between gap-3 mb-5 sm:mb-8">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-1.5 sm:gap-2">
                        内容与行为分析 <span className="text-orange-500">.</span>
                    </h1>
                    <p className="text-slate-500 text-xs sm:text-sm mt-0.5 sm:mt-1 line-clamp-1 sm:line-clamp-none">深度洞察内容资产沉淀与用户阅读习惯。</p>
                </div>
                <button
                    className="flex shrink-0 items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs sm:text-sm hover:text-orange-600 hover:border-orange-200 transition-colors shadow-sm">
                    <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4"/> 导出报表
                </button>
            </div>

            {/* --- 1. 核心资产概览 (KPI Cards) --- 移动端一体化紧凑收拢，桌面端4列舒展 */}
            <div className="mb-4 sm:mb-8">
                {/* 移动端专属：一体化收紧微组件看板 (高度减半，紧凑饱满) */}
                <div className="sm:hidden rounded-2xl border border-slate-200/80 bg-white p-2 shadow-sm grid grid-cols-2 gap-1.5">
                    {/* 1.1 文章总数 */}
                    <div className="flex items-center gap-2.5 rounded-xl bg-slate-50/70 p-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                            <Layers className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-[11px] font-medium text-slate-400">文章总数</div>
                            <div className="truncate text-sm font-bold text-slate-900 mt-0.5">
                                {data.kpi.totalArticles.toLocaleString()} <span className="text-[10px] font-normal text-slate-400">篇</span>
                            </div>
                        </div>
                    </div>

                    {/* 1.2 累计字数 */}
                    <div className="flex items-center gap-2.5 rounded-xl bg-slate-50/70 p-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
                            <Calendar className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-[11px] font-medium text-slate-400">累计字数</div>
                            <div className="truncate text-sm font-bold text-slate-900 mt-0.5">
                                {formatWordCount(data.kpi.totalWords)} <span className="text-[10px] font-normal text-slate-400">字</span>
                            </div>
                        </div>
                    </div>

                    {/* 1.3 资源文件 */}
                    <div className="flex items-center gap-2.5 rounded-xl bg-slate-50/70 p-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                            <Database className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-[11px] font-medium text-slate-400">资源文件</div>
                            <div className="truncate text-sm font-bold text-slate-900 mt-0.5">
                                {data.kpi.totalAssets.toLocaleString()} <span className="text-[10px] font-normal text-slate-400">个</span>
                            </div>
                        </div>
                    </div>

                    {/* 1.4 阅读时长 */}
                    <div className="flex items-center gap-2.5 rounded-xl bg-slate-50/70 p-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-pink-50 text-pink-600">
                            <Clock className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-[11px] font-medium text-slate-400">阅读时长</div>
                            <div className="truncate text-sm font-bold text-slate-900 mt-0.5">
                                {data.kpi.totalDurationHours.toLocaleString()} <span className="text-[10px] font-normal text-slate-400">小时</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 桌面端专属：4 列豪华展示大卡片 */}
                <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* 1.1 文章总数 */}
                    <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
                            <FileText className="w-16 h-16 text-slate-800"/>
                        </div>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg shrink-0">
                                <Layers className="w-5 h-5"/>
                            </div>
                            <span className="text-slate-500 text-xs font-medium truncate">文章总数</span>
                        </div>
                        <div className="text-2xl font-bold text-slate-900 ml-1">
                            {data.kpi.totalArticles.toLocaleString()} <span className="text-xs font-normal text-slate-400">篇</span>
                        </div>
                    </div>

                    {/* 1.2 总字数 */}
                    <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
                            <Hash className="w-16 h-16 text-orange-500"/>
                        </div>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-orange-50 text-orange-600 rounded-lg shrink-0">
                                <Calendar className="w-5 h-5"/>
                            </div>
                            <span className="text-slate-500 text-xs font-medium truncate">累计字数</span>
                        </div>
                        <div className="text-2xl font-bold text-slate-900 ml-1">
                            {formatWordCount(data.kpi.totalWords)} <span className="text-xs font-normal text-slate-400">字</span>
                        </div>
                    </div>

                    {/* 1.3 资源总数 */}
                    <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
                            <Database className="w-16 h-16 text-emerald-500"/>
                        </div>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg shrink-0">
                                <Database className="w-5 h-5"/>
                            </div>
                            <span className="text-slate-500 text-xs font-medium truncate">资源文件</span>
                        </div>
                        <div className="text-2xl font-bold text-slate-900 ml-1">
                            {data.kpi.totalAssets.toLocaleString()} <span className="text-xs font-normal text-slate-400">个</span>
                        </div>
                    </div>

                    {/* 1.4 累计阅读时长 */}
                    <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
                            <Clock className="w-16 h-16 text-pink-500"/>
                        </div>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-pink-50 text-pink-600 rounded-lg shrink-0">
                                <Clock className="w-5 h-5"/>
                            </div>
                            <span className="text-slate-500 text-xs font-medium truncate">阅读时长</span>
                        </div>
                        <div className="text-2xl font-bold text-slate-900 ml-1">
                            {data.kpi.totalDurationHours.toLocaleString()} <span className="text-xs font-normal text-slate-400">小时</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* --- 2. 年度创作热力图 --- */}
            <div className="bg-white p-4 sm:p-5 rounded-xl sm:rounded-2xl border border-slate-100 shadow-sm mb-5 sm:mb-8">
                <div className="flex flex-row items-center justify-between gap-2 mb-3 sm:mb-5">
                    <div>
                        <h3 className="text-sm sm:text-base font-bold text-slate-800 flex items-center gap-1.5 sm:gap-2">
                            <Calendar className="w-4 h-4 text-orange-500"/>
                            年度创作热力图
                        </h3>
                        <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5 sm:mt-1">
                            {selectedYear} 年共创建 <span className="font-bold text-orange-600">{yearlyCreationTotal}</span> 项内容
                        </p>
                    </div>
                    <div className="w-28 sm:w-36">
                        <Select
                            value={String(selectedYear)}
                            options={yearOptions}
                            onChange={(value) => setSelectedYear(Number(value))}
                            showSelectedDescription={false}
                            buttonClassName="min-h-8 sm:min-h-9 py-1 text-xs"
                            menuClassName="right-0"
                        />
                    </div>
                </div>

                {/* 图例与移动端提示 */}
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3 text-xs text-slate-500">
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-[11px] sm:text-xs">
                        <div className="flex items-center gap-1">
                            <FileText className="w-3 h-3 text-blue-500"/>
                            文章
                        </div>
                        <div className="flex items-center gap-1">
                            <ImageIcon className="w-3 h-3 text-emerald-500"/>
                            图片
                        </div>
                        <div className="flex items-center gap-1">
                            <StickyNote className="w-3 h-3 text-pink-500"/>
                            闪念
                        </div>
                        <div className="flex items-center gap-1">
                            <PenLine className="w-3 h-3 text-purple-500"/>
                            白板
                        </div>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] sm:text-[11px] text-slate-400">
                        少
                        <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-sm bg-slate-100 border border-slate-100"/>
                        <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-sm bg-orange-100 border border-orange-100"/>
                        <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-sm bg-orange-300 border border-orange-300"/>
                        <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-sm bg-orange-400 border border-orange-400"/>
                        <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-sm bg-orange-600 border border-orange-600"/>
                        多
                    </div>
                </div>

                {/* 热力图网格滚动区域（移动端与PC均隐藏滚动条） */}
                <div className="relative overflow-x-auto pb-2 scrollbar-hide no-scrollbar touch-pan-x">
                    {heatmapLoading && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/60 backdrop-blur-[1px]">
                            <div className="flex items-center gap-2 rounded-full border border-slate-100 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 shadow-sm">
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-500"/>
                                更新热力图
                            </div>
                        </div>
                    )}
                    <div className="min-w-[760px] sm:min-w-[900px]">
                        <div
                            className="relative ml-7 mb-1 h-5 text-[10px] leading-4 text-slate-400"
                            style={{width: heatmapWidth}}
                        >
                            {monthMarkers.map((marker) => (
                                <span
                                    key={`${marker.label}-${marker.column}`}
                                    className="absolute top-0 whitespace-nowrap"
                                    style={{left: (marker.column - 1) * heatmapColumnWidth}}
                                >
                                    {marker.label}
                                </span>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <div className="grid grid-rows-7 gap-[3px] pt-[1px] text-[10px] leading-[14px] text-slate-400">
                                {WEEKDAY_LABELS.map((label, index) => (
                                    <span key={label} className={index % 2 === 0 ? 'opacity-0' : ''}>
                                        {label}
                                    </span>
                                ))}
                            </div>
                            <div className="grid grid-flow-col grid-rows-7 gap-[3px]">
                                {heatmapCells.map((cell, index) => {
                                    if (cell.isBlank) {
                                        return <span key={cell.date} className="w-[14px] h-[14px]"/>;
                                    }

                                    const tooltip = `${formatHeatmapDate(cell.date)}，共创建 ${cell.total} 项内容`;
                                    const isCurrentSelected = selectedCell?.date === cell.date;

                                    return (
                                        <span
                                            key={`${cell.date}-${index}`}
                                            aria-label={tooltip}
                                            onClick={() => setSelectedCell(isCurrentSelected ? null : cell)}
                                            onMouseEnter={(event) => {
                                                setHeatmapHover({cell, x: event.clientX, y: event.clientY});
                                                updateHeatmapTooltipPosition(event.clientX, event.clientY);
                                            }}
                                            onMouseMove={(event) => updateHeatmapTooltipPosition(event.clientX, event.clientY)}
                                            onMouseLeave={clearHeatmapHover}
                                            className={`w-[14px] h-[14px] rounded-[3px] border cursor-pointer transition-transform hover:scale-125 hover:ring-2 hover:ring-orange-500/20 ${isCurrentSelected ? 'ring-2 ring-orange-500 scale-125 z-10' : ''} ${getIntensityClass(cell.total, maxCreationCount)}`}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>

                {/* 热力图底部交互情报栏（高度恒定锁定，彻底消灭布局位移） */}
                <div className="mt-3 pt-2.5 border-t border-slate-100">
                    <div
                        className={`h-11 sm:h-10 px-2.5 sm:px-3 rounded-xl transition-all duration-200 flex items-center justify-between gap-2 overflow-hidden ${
                            selectedCell
                                ? 'bg-orange-50/80 border border-orange-200/70'
                                : 'bg-slate-50/70 border border-slate-100/80'
                        }`}
                    >
                        {selectedCell ? (
                            <>
                                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 min-w-0">
                                    <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0 animate-pulse"/>
                                    <span className="font-semibold text-slate-800 text-[11px] sm:text-xs truncate">
                                        <span className="sm:hidden">{formatShortHeatmapDate(selectedCell.date)}</span>
                                        <span className="hidden sm:inline">{formatHeatmapDate(selectedCell.date)}</span>
                                    </span>
                                    <span className="text-[11px] sm:text-xs font-bold text-orange-600 font-mono bg-orange-100/80 px-1.5 py-0.5 rounded shrink-0">
                                        共 {selectedCell.total} 项
                                    </span>
                                </div>
                                <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto scrollbar-hide no-scrollbar py-0.5 shrink-0">
                                    <span
                                        className={`px-1.5 py-0.5 rounded text-[11px] font-mono flex items-center gap-1 shrink-0 ${
                                            selectedCell.articles > 0 ? 'bg-blue-100/80 text-blue-700 font-semibold' : 'bg-white/60 text-slate-400'
                                        }`}
                                        title={`文章: ${selectedCell.articles}`}
                                    >
                                        <FileText className="w-3 h-3 text-blue-500 shrink-0"/>
                                        <span className="hidden xs:inline">文章</span> {selectedCell.articles}
                                    </span>
                                    <span
                                        className={`px-1.5 py-0.5 rounded text-[11px] font-mono flex items-center gap-1 shrink-0 ${
                                            selectedCell.images > 0 ? 'bg-emerald-100/80 text-emerald-700 font-semibold' : 'bg-white/60 text-slate-400'
                                        }`}
                                        title={`图片: ${selectedCell.images}`}
                                    >
                                        <ImageIcon className="w-3 h-3 text-emerald-500 shrink-0"/>
                                        <span className="hidden xs:inline">图片</span> {selectedCell.images}
                                    </span>
                                    <span
                                        className={`px-1.5 py-0.5 rounded text-[11px] font-mono flex items-center gap-1 shrink-0 ${
                                            selectedCell.memos > 0 ? 'bg-pink-100/80 text-pink-700 font-semibold' : 'bg-white/60 text-slate-400'
                                        }`}
                                        title={`闪念: ${selectedCell.memos}`}
                                    >
                                        <StickyNote className="w-3 h-3 text-pink-500 shrink-0"/>
                                        <span className="hidden xs:inline">闪念</span> {selectedCell.memos}
                                    </span>
                                    <span
                                        className={`px-1.5 py-0.5 rounded text-[11px] font-mono flex items-center gap-1 shrink-0 ${
                                            selectedCell.prompts > 0 ? 'bg-amber-100/80 text-amber-700 font-semibold' : 'bg-white/60 text-slate-400'
                                        }`}
                                        title={`提示词: ${selectedCell.prompts}`}
                                    >
                                        <Sparkles className="w-3 h-3 text-amber-500 shrink-0"/>
                                        <span className="hidden xs:inline">提示词</span> {selectedCell.prompts}
                                    </span>
                                    <span
                                        className={`px-1.5 py-0.5 rounded text-[11px] font-mono flex items-center gap-1 shrink-0 ${
                                            selectedCell.whiteboards > 0 ? 'bg-purple-100/80 text-purple-700 font-semibold' : 'bg-white/60 text-slate-400'
                                        }`}
                                        title={`白板: ${selectedCell.whiteboards}`}
                                    >
                                        <PenLine className="w-3 h-3 text-purple-500 shrink-0"/>
                                        <span className="hidden xs:inline">白板</span> {selectedCell.whiteboards}
                                    </span>
                                    <button
                                        onClick={() => setSelectedCell(null)}
                                        className="p-1 text-slate-400 hover:text-slate-700 hover:bg-orange-100/80 rounded-full transition-colors shrink-0 ml-0.5"
                                        title="取消选中"
                                    >
                                        <X className="w-3.5 h-3.5"/>
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-slate-500 truncate">
                                    <Sparkles className="w-3.5 h-3.5 text-orange-400 shrink-0"/>
                                    <span className="truncate">轻触或点击任意格子查看单日明细</span>
                                </div>
                                <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono shrink-0">
                                    <span>活跃 <strong className="text-slate-700 font-semibold">{activeDaysCount}</strong> 天</span>
                                    <span className="text-slate-200">|</span>
                                    <span>峰值 <strong className="text-orange-600 font-semibold">{maxCreationCount}</strong> 项</span>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* 桌面端悬浮浮层 */}
            {heatmapHover && (
                <div
                    ref={heatmapTooltipRef}
                    className="hidden sm:block fixed z-50 w-56 rounded-xl border border-slate-100 bg-white p-3 text-xs shadow-xl shadow-slate-900/10 pointer-events-none"
                    style={{
                        left: 0,
                        top: 0,
                        transform: `translate3d(${Math.min(heatmapHover.x + 14, window.innerWidth - 240)}px, ${Math.max(heatmapHover.y - 18, 12)}px, 0)`,
                    }}
                >
                    <div className="font-bold text-slate-800">{formatHeatmapDate(heatmapHover.cell.date)}</div>
                    <div className="mt-1 text-slate-500">
                        共创建 <span className="font-mono font-bold text-orange-600">{heatmapHover.cell.total}</span> 项内容
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                        <div className="rounded-lg bg-blue-50 px-2 py-1.5 text-blue-600">
                            <div className="text-[10px] text-blue-400">文章</div>
                            <div className="font-mono font-bold">{heatmapHover.cell.articles}</div>
                        </div>
                        <div className="rounded-lg bg-emerald-50 px-2 py-1.5 text-emerald-600">
                            <div className="text-[10px] text-emerald-400">图片</div>
                            <div className="font-mono font-bold">{heatmapHover.cell.images}</div>
                        </div>
                        <div className="rounded-lg bg-pink-50 px-2 py-1.5 text-pink-600">
                            <div className="text-[10px] text-pink-400">闪念</div>
                            <div className="font-mono font-bold">{heatmapHover.cell.memos}</div>
                        </div>
                        <div className="rounded-lg bg-amber-50 px-2 py-1.5 text-amber-600">
                            <div className="text-[10px] text-amber-500">提示词</div>
                            <div className="font-mono font-bold">{heatmapHover.cell.prompts}</div>
                        </div>
                        <div className="rounded-lg bg-purple-50 px-2 py-1.5 text-purple-600">
                            <div className="text-[10px] text-purple-400">白板</div>
                            <div className="font-mono font-bold">{heatmapHover.cell.whiteboards}</div>
                        </div>
                    </div>
                </div>
            )}

            {/* --- 3. 核心图表区 --- */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 mb-5 sm:mb-8">

                {/* 3.1 用户行为透视 */}
                <div
                    className="min-w-0 lg:col-span-2 bg-white p-4 sm:p-6 rounded-xl sm:rounded-2xl border border-slate-100 shadow-sm flex flex-col h-[280px] sm:h-[380px]">
                    <div className="flex justify-between items-start mb-3 sm:mb-6">
                        <div>
                            <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm sm:text-base">
                                <Clock className="w-4 h-4 text-orange-500"/>
                                用户阅读行为透视 (24h)
                            </h3>
                        </div>
                    </div>

                    <div className="flex-1 w-full text-xs outline-none focus:outline-none select-none [&_*]:outline-none">
                        <ResponsiveContainer width="100%" height="100%" className="outline-none focus:outline-none">
                            <LineChart data={data.hourlyData} margin={{top: 5, right: 10, left: -10, bottom: 5}} className="outline-none focus:outline-none">
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9"/>
                                <XAxis
                                    dataKey="hour"
                                    tick={{fill: '#94a3b8', fontSize: 10}}
                                    axisLine={false}
                                    tickLine={false}
                                    interval={3}
                                />
                                <YAxis
                                    yAxisId="left"
                                    tick={{fill: '#f97316', fontSize: 10}}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <YAxis
                                    yAxisId="right"
                                    orientation="right"
                                    tick={{fill: '#3b82f6', fontSize: 10}}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <Tooltip content={<CustomTooltip/>}/>
                                <Legend
                                    iconType="circle"
                                    iconSize={8}
                                    wrapperStyle={{fontSize: '11px', paddingTop: '6px'}}
                                />
                                <Line
                                    yAxisId="left"
                                    type="monotone"
                                    dataKey="visits"
                                    name="访问次数"
                                    stroke="#f97316"
                                    strokeWidth={2}
                                    dot={false}
                                    activeDot={{r: 4, strokeWidth: 0}}
                                    unit="次"
                                    isAnimationActive={false}
                                />
                                <Line
                                    yAxisId="right"
                                    type="monotone"
                                    dataKey="duration"
                                    name="阅读时长"
                                    stroke="#3b82f6"
                                    strokeWidth={2}
                                    strokeDasharray="4 4"
                                    dot={false}
                                    activeDot={{r: 4, strokeWidth: 0}}
                                    unit="分"
                                    isAnimationActive={false}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* 3.2 创作习惯 */}
                <div className="min-w-0 bg-white p-4 sm:p-6 rounded-xl sm:rounded-2xl border border-slate-100 shadow-sm flex flex-col h-[260px] sm:h-[380px]">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-1 sm:mb-2 text-sm sm:text-base">
                        <Calendar className="w-4 h-4 text-emerald-500"/>
                        创作习惯分析
                    </h3>
                    <p className="text-[11px] sm:text-xs text-slate-400 mb-3 sm:mb-6">历史发文的周分布</p>

                    <div className="flex-1 w-full text-xs outline-none focus:outline-none select-none [&_*]:outline-none">
                        <ResponsiveContainer width="100%" height="100%" className="outline-none focus:outline-none">
                            <BarChart data={data.weeklyPublish} barSize={20} margin={{top: 10, right: 12, left: 12, bottom: 5}} className="outline-none focus:outline-none">
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9"/>
                                <XAxis
                                    dataKey="day"
                                    tick={{fill: '#94a3b8', fontSize: 11}}
                                    axisLine={false}
                                    tickLine={false}
                                    interval={0}
                                    padding={{left: 12, right: 12}}
                                />
                                <YAxis hide/>
                                <Tooltip
                                    cursor={{fill: '#f1f5f9'}}
                                    content={<CustomTooltip/>}
                                />
                                <Bar
                                    dataKey="count"
                                    name="发文数"
                                    fill="#10b981"
                                    radius={[4, 4, 0, 0]}
                                    unit="篇"
                                    isAnimationActive={false}
                                >
                                    {data.weeklyPublish.map((_, index) => (
                                         <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#10b981' : '#34d399'}/>
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* --- 4. 内容结构分析 --- */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-5 sm:mb-8">
                {/* 4.1 分类统计 */}
                <div className="min-w-0 bg-white p-4 sm:p-6 rounded-xl sm:rounded-2xl border border-slate-100 shadow-sm h-[300px] sm:h-[320px] flex flex-col">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-3 sm:mb-4 text-sm sm:text-base">
                        <Layers className="w-4 h-4 text-purple-500"/>
                        分类内容占比
                    </h3>
                    {categoryDataWithColor.length > 0 ? (
                        <div className="flex-1 flex items-center outline-none focus:outline-none select-none [&_*]:outline-none">
                            <ResponsiveContainer width="100%" height="100%" className="outline-none focus:outline-none">
                                <PieChart className="outline-none focus:outline-none">
                                    <Pie
                                        data={categoryDataWithColor}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={50}
                                        outerRadius={72}
                                        paddingAngle={4}
                                        dataKey="value"
                                        isAnimationActive={false}
                                    >
                                        {categoryDataWithColor.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} strokeWidth={0}/>
                                        ))}
                                    </Pie>
                                    <Tooltip content={<CustomTooltip/>}/>
                                    <Legend
                                        layout="vertical"
                                        verticalAlign="middle"
                                        align="right"
                                        iconType="circle"
                                        iconSize={8}
                                        wrapperStyle={{fontSize: '11px', color: '#64748b'}}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-slate-300 text-sm">
                            暂无分类数据
                        </div>
                    )}
                </div>

                {/* 4.2 标签云统计 */}
                <div
                    className="min-w-0 bg-white p-4 sm:p-6 rounded-xl sm:rounded-2xl border border-slate-100 shadow-sm h-[260px] sm:h-[320px] overflow-y-auto scrollbar-hide no-scrollbar">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-3 sm:mb-6 text-sm sm:text-base">
                        <Hash className="w-4 h-4 text-indigo-500"/>
                        热门标签分布
                    </h3>
                    <div className="flex flex-wrap gap-2 sm:gap-3">
                        {data.tagStats.length > 0 ? data.tagStats.map((tag, idx) => (
                            <div key={idx}
                                 className="flex items-center justify-between px-2.5 py-1.5 bg-slate-50 border border-slate-100 rounded-lg text-xs hover:border-indigo-200 transition-colors cursor-default">
                                <span className="text-slate-600 truncate max-w-[120px]">{tag.name}</span>
                                <span
                                    className="font-bold text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded ml-2 text-[10px]">{tag.count}</span>
                            </div>
                        )) : (
                            <div className="w-full text-center text-slate-300 text-sm mt-10">暂无标签数据</div>
                        )}
                    </div>
                </div>
            </div>

            {/* --- 5. 深度榜单 --- */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-5 sm:mb-8">

                {/* 5.1 访问次数排行榜 */}
                <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-100 shadow-sm overflow-hidden min-h-[260px]">
                    <div
                        className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-50 bg-slate-50/30 flex justify-between items-center">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm sm:text-base">
                            <MousePointer className="w-4 h-4 text-orange-500"/>
                            文章访问次数 TOP 5
                        </h3>
                    </div>
                    <table className="w-full text-xs sm:text-sm text-left">
                        <tbody className="divide-y divide-slate-50">
                        {data.topVisits.map((item, idx) => (
                            <tr key={idx} className="hover:bg-orange-50/30 transition-colors">
                                <td className="px-3 sm:px-6 py-2.5 sm:py-3.5 w-8 sm:w-12 text-center text-slate-400 font-mono text-xs">{idx + 1}</td>
                                <td className="px-2 py-2.5 sm:py-3.5 font-medium text-slate-700 truncate max-w-[140px] sm:max-w-[200px]"
                                    title={item.title}>{item.title}</td>
                                <td className="px-3 sm:px-6 py-2.5 sm:py-3.5 text-right font-bold text-orange-600">{item.value}</td>
                            </tr>
                        ))}
                        {data.topVisits.length === 0 && (
                            <tr>
                                <td colSpan={3} className="text-center py-10 text-slate-300">暂无数据</td>
                            </tr>
                        )}
                        </tbody>
                    </table>
                </div>

                {/* 5.2 阅读时长排行榜 */}
                <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-100 shadow-sm overflow-hidden min-h-[260px]">
                    <div
                        className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-50 bg-slate-50/30 flex justify-between items-center">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm sm:text-base">
                            <BookOpen className="w-4 h-4 text-blue-500"/>
                            文章阅读时长 TOP 5
                        </h3>
                    </div>
                    <table className="w-full text-xs sm:text-sm text-left">
                        <tbody className="divide-y divide-slate-50">
                        {data.topDuration.map((item, idx) => (
                            <tr key={idx} className="hover:bg-blue-50/30 transition-colors">
                                <td className="px-3 sm:px-6 py-2.5 sm:py-3.5 w-8 sm:w-12 text-center text-slate-400 font-mono text-xs">{idx + 1}</td>
                                <td className="px-2 py-2.5 sm:py-3.5 font-medium text-slate-700 truncate max-w-[140px] sm:max-w-[200px]"
                                    title={item.title}>{item.title}</td>
                                <td className="px-3 sm:px-6 py-2.5 sm:py-3.5 text-right font-bold text-blue-600">{item.value}</td>
                            </tr>
                        ))}
                        {data.topDuration.length === 0 && (
                            <tr>
                                <td colSpan={3} className="text-center py-10 text-slate-300">暂无数据</td>
                            </tr>
                        )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="text-center text-xs text-slate-400 pb-8">
                数据已自动更新 · {new Date().toLocaleString()}
            </div>

        </div>
    );
}
