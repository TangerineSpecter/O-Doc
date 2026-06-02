import {useEffect, useState} from 'react';
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
    StickyNote
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
import {Select, SelectOption} from '../components/common/Select';

// 预定义颜色，用于分类图表
const COLORS = ['#3b82f6', '#f97316', '#ec4899', '#10b981', '#8b5cf6', '#6366f1', '#14b8a6', '#f43f5e'];
const WHITEBOARD_STORAGE_KEY = 'odoc-whiteboards';
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

interface WhiteboardDocumentSnapshot {
    createdAt?: number;
}

interface CreationDay {
    date: string;
    articles: number;
    images: number;
    memos: number;
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

const readWhiteboardDailyCounts = (year: number) => {
    const counts = new Map<string, number>();

    try {
        const raw = localStorage.getItem(WHITEBOARD_STORAGE_KEY);
        if (!raw) return counts;

        const documents = JSON.parse(raw) as WhiteboardDocumentSnapshot[];
        if (!Array.isArray(documents)) return counts;

        documents.forEach((document) => {
            if (!document.createdAt) return;
            const createdAt = new Date(document.createdAt);
            if (Number.isNaN(createdAt.getTime()) || createdAt.getFullYear() !== year) return;
            const dateKey = formatDateKey(createdAt);
            counts.set(dateKey, (counts.get(dateKey) || 0) + 1);
        });
    } catch (error) {
        console.warn('Failed to read whiteboard stats', error);
    }

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

const buildHeatmapCells = (year: number, dailyCreation: StatsDashboardData['dailyCreation']): HeatmapCell[] => {
    const serverDailyMap = new Map(dailyCreation.map((item) => [item.date, item]));
    const whiteboardCounts = readWhiteboardDailyCounts(year);
    const cells: HeatmapCell[] = [];

    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31);

    for (let i = 0; i < startDate.getDay(); i += 1) {
        cells.push({
            date: `blank-${i}`,
            articles: 0,
            images: 0,
            memos: 0,
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

        cells.push({
            date: dateKey,
            articles,
            images,
            memos,
            whiteboards,
            total: articles + images + memos + whiteboards,
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

export default function StatisticsPage() {
    const currentYear = new Date().getFullYear();
    const [loading, setLoading] = useState(true);
    const [heatmapLoading, setHeatmapLoading] = useState(false);
    const [data, setData] = useState<StatsDashboardData | null>(null);
    const [selectedYear, setSelectedYear] = useState(currentYear);
    const [heatmapHover, setHeatmapHover] = useState<HeatmapHoverState | null>(null);

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
                }

                const res = await getStatisticsData(selectedYear);
                if (ignore) return;

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
        return (
            <div className="h-screen flex items-center justify-center bg-slate-50">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 text-orange-500 animate-spin"/>
                    <p className="text-slate-400 text-sm">正在分析数据...</p>
                </div>
            </div>
        );
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

    const heatmapCells = buildHeatmapCells(selectedYear, data.dailyCreation);
    const monthMarkers = getMonthMarkers(heatmapCells);
    const maxCreationCount = heatmapCells.reduce((max, item) => Math.max(max, item.total), 0);
    const yearlyCreationTotal = heatmapCells.reduce((total, item) => total + item.total, 0);
    const heatmapColumnCount = Math.ceil(heatmapCells.length / 7);
    const heatmapColumnWidth = 17;
    const heatmapWidth = heatmapColumnCount * heatmapColumnWidth;

    return (
        <div
            className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        内容与行为分析 <span className="text-orange-500">.</span>
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">深度洞察内容资产沉淀与用户阅读习惯。</p>
                </div>
                <button
                    className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-sm hover:text-orange-600 hover:border-orange-200 transition-colors shadow-sm">
                    <Download className="w-4 h-4"/> 导出报表
                </button>
            </div>

            {/* --- 1. 核心资产概览 (KPI Cards) --- */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {/* 1.1 文章总数 */}
                <div
                    className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        <FileText className="w-16 h-16 text-slate-800"/>
                    </div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                            <Layers className="w-5 h-5"/>
                        </div>
                        <span className="text-slate-500 text-xs font-medium">文章总数</span>
                    </div>
                    <div className="text-2xl font-bold text-slate-900 ml-1">
                        {data.kpi.totalArticles.toLocaleString()} <span
                        className="text-xs font-normal text-slate-400">篇</span>
                    </div>
                </div>

                {/* 1.2 总字数 */}
                <div
                    className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Hash className="w-16 h-16 text-orange-500"/>
                    </div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-orange-50 text-orange-600 rounded-lg">
                            <Calendar className="w-5 h-5"/>
                        </div>
                        <span className="text-slate-500 text-xs font-medium">累计创作字数</span>
                    </div>
                    <div className="text-2xl font-bold text-slate-900 ml-1">
                        {formatWordCount(data.kpi.totalWords)} <span
                        className="text-xs font-normal text-slate-400">字</span>
                    </div>
                </div>

                {/* 1.3 资源总数 */}
                <div
                    className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Database className="w-16 h-16 text-emerald-500"/>
                    </div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                            <Database className="w-5 h-5"/>
                        </div>
                        <span className="text-slate-500 text-xs font-medium">资源文件数</span>
                    </div>
                    <div className="text-2xl font-bold text-slate-900 ml-1">
                        {data.kpi.totalAssets.toLocaleString()} <span
                        className="text-xs font-normal text-slate-400">个</span>
                    </div>
                </div>

                {/* 1.4 累计阅读时长 */}
                <div
                    className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Clock className="w-16 h-16 text-pink-500"/>
                    </div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-pink-50 text-pink-600 rounded-lg">
                            <Clock className="w-5 h-5"/>
                        </div>
                        <span className="text-slate-500 text-xs font-medium">累计被阅读时长</span>
                    </div>
                    <div className="text-2xl font-bold text-slate-900 ml-1">
                        {data.kpi.totalDurationHours.toLocaleString()} <span
                        className="text-xs font-normal text-slate-400">小时</span>
                    </div>
                </div>
            </div>

            {/* --- 2. 年度创作热力图 --- */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm mb-8">
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-5">
                    <div>
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-orange-500"/>
                            年度创作热力图
                        </h3>
                        <p className="text-xs text-slate-400 mt-1">
                            {selectedYear} 年共创建 <span className="font-bold text-orange-600">{yearlyCreationTotal}</span> 项内容
                        </p>
                    </div>
                    <div className="w-36">
                        <Select
                            value={String(selectedYear)}
                            options={yearOptions}
                            onChange={(value) => setSelectedYear(Number(value))}
                            showSelectedDescription={false}
                            buttonClassName="min-h-9 py-1.5 text-xs"
                            menuClassName="right-0"
                        />
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 mb-4 text-xs text-slate-500">
                    <div className="flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-blue-500"/>
                        文章
                    </div>
                    <div className="flex items-center gap-1.5">
                        <ImageIcon className="w-3.5 h-3.5 text-emerald-500"/>
                        图片
                    </div>
                    <div className="flex items-center gap-1.5">
                        <StickyNote className="w-3.5 h-3.5 text-pink-500"/>
                        闪念
                    </div>
                    <div className="flex items-center gap-1.5">
                        <PenLine className="w-3.5 h-3.5 text-purple-500"/>
                        白板
                    </div>
                    <div className="ml-auto flex items-center gap-1.5 text-[11px] text-slate-400">
                        少
                        <span className="w-3 h-3 rounded-sm bg-slate-100 border border-slate-100"/>
                        <span className="w-3 h-3 rounded-sm bg-orange-100 border border-orange-100"/>
                        <span className="w-3 h-3 rounded-sm bg-orange-300 border border-orange-300"/>
                        <span className="w-3 h-3 rounded-sm bg-orange-400 border border-orange-400"/>
                        <span className="w-3 h-3 rounded-sm bg-orange-600 border border-orange-600"/>
                        多
                    </div>
                </div>

                <div className="relative overflow-x-auto pb-2 custom-scrollbar">
                    {heatmapLoading && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/60 backdrop-blur-[1px]">
                            <div className="flex items-center gap-2 rounded-full border border-slate-100 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 shadow-sm">
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-500"/>
                                更新热力图
                            </div>
                        </div>
                    )}
                    <div className="min-w-[900px]">
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

                                    return (
                                        <span
                                            key={`${cell.date}-${index}`}
                                            aria-label={tooltip}
                                            onMouseEnter={(event) => setHeatmapHover({
                                                cell,
                                                x: event.clientX,
                                                y: event.clientY
                                            })}
                                            onMouseMove={(event) => setHeatmapHover({
                                                cell,
                                                x: event.clientX,
                                                y: event.clientY
                                            })}
                                            onMouseLeave={() => setHeatmapHover(null)}
                                            className={`w-[14px] h-[14px] rounded-[3px] border transition-transform hover:scale-125 hover:ring-2 hover:ring-orange-500/20 ${getIntensityClass(cell.total, maxCreationCount)}`}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {heatmapHover && (
                <div
                    className="fixed z-50 w-56 rounded-xl border border-slate-100 bg-white p-3 text-xs shadow-xl shadow-slate-900/10 pointer-events-none"
                    style={{
                        left: Math.min(heatmapHover.x + 14, window.innerWidth - 240),
                        top: Math.max(heatmapHover.y - 18, 12),
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
                        <div className="rounded-lg bg-purple-50 px-2 py-1.5 text-purple-600">
                            <div className="text-[10px] text-purple-400">白板</div>
                            <div className="font-mono font-bold">{heatmapHover.cell.whiteboards}</div>
                        </div>
                    </div>
                </div>
            )}

            {/* --- 2. 核心图表区 --- */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">

                {/* 2.1 用户行为透视 */}
                <div
                    className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col h-[380px]">
                    <div className="flex justify-between items-start mb-6">
                        <div>
                            <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                <Clock className="w-4 h-4 text-orange-500"/>
                                用户阅读行为透视 (24h)
                            </h3>
                        </div>
                    </div>

                    <div className="flex-1 w-full text-xs">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={data.hourlyData} margin={{top: 5, right: 20, left: 0, bottom: 5}}>
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
                                    label={{
                                        value: '次数',
                                        angle: -90,
                                        position: 'insideLeft',
                                        fill: '#fdba74',
                                        fontSize: 10
                                    }}
                                />
                                <YAxis
                                    yAxisId="right"
                                    orientation="right"
                                    tick={{fill: '#3b82f6', fontSize: 10}}
                                    axisLine={false}
                                    tickLine={false}
                                    label={{
                                        value: '时长(分)',
                                        angle: 90,
                                        position: 'insideRight',
                                        fill: '#93c5fd',
                                        fontSize: 10
                                    }}
                                />
                                <Tooltip content={<CustomTooltip/>}/>
                                <Legend
                                    iconType="circle"
                                    iconSize={8}
                                    wrapperStyle={{fontSize: '12px', paddingTop: '10px'}}
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
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* 2.2 创作习惯 */}
                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col h-[380px]">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-2">
                        <Calendar className="w-4 h-4 text-emerald-500"/>
                        创作习惯分析
                    </h3>
                    <p className="text-xs text-slate-400 mb-6">历史发文的周分布</p>

                    <div className="flex-1 w-full text-xs">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data.weeklyPublish} barSize={20}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9"/>
                                <XAxis
                                    dataKey="day"
                                    tick={{fill: '#94a3b8', fontSize: 10}}
                                    axisLine={false}
                                    tickLine={false}
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

            {/* --- 3. 内容结构分析 --- */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                {/* 3.1 分类统计 */}
                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm h-[320px] flex flex-col">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
                        <Layers className="w-4 h-4 text-purple-500"/>
                        分类内容占比
                    </h3>
                    {categoryDataWithColor.length > 0 ? (
                        <div className="flex-1 flex items-center">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={categoryDataWithColor}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
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

                {/* 3.2 标签云统计 */}
                <div
                    className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm h-[320px] overflow-y-auto custom-scrollbar">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-6">
                        <Hash className="w-4 h-4 text-indigo-500"/>
                        热门标签分布
                    </h3>
                    <div className="flex flex-wrap gap-3">
                        {data.tagStats.length > 0 ? data.tagStats.map((tag, idx) => (
                            <div key={idx}
                                 className="flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-100 rounded-lg min-w-[100px] hover:border-indigo-200 transition-colors cursor-default">
                                <span className="text-sm text-slate-600">{tag.name}</span>
                                <span
                                    className="text-xs font-bold text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded ml-2">{tag.count}</span>
                            </div>
                        )) : (
                            <div className="w-full text-center text-slate-300 text-sm mt-10">暂无标签数据</div>
                        )}
                    </div>
                </div>
            </div>

            {/* --- 4. 深度榜单 --- */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">

                {/* 4.1 访问次数排行榜 */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden min-h-[300px]">
                    <div
                        className="px-6 py-4 border-b border-slate-50 bg-slate-50/30 flex justify-between items-center">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                            <MousePointer className="w-4 h-4 text-orange-500"/>
                            文章访问次数 TOP 5
                        </h3>
                    </div>
                    <table className="w-full text-sm text-left">
                        <tbody className="divide-y divide-slate-50">
                        {data.topVisits.map((item, idx) => (
                            <tr key={idx} className="hover:bg-orange-50/30 transition-colors">
                                <td className="px-6 py-3.5 w-12 text-center text-slate-400 font-mono text-xs">{idx + 1}</td>
                                <td className="px-2 py-3.5 font-medium text-slate-700 truncate max-w-[180px]"
                                    title={item.title}>{item.title}</td>
                                <td className="px-6 py-3.5 text-right font-bold text-orange-600">{item.value}</td>
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

                {/* 4.2 阅读时长排行榜 */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden min-h-[300px]">
                    <div
                        className="px-6 py-4 border-b border-slate-50 bg-slate-50/30 flex justify-between items-center">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                            <BookOpen className="w-4 h-4 text-blue-500"/>
                            文章阅读时长 TOP 5
                        </h3>
                    </div>
                    <table className="w-full text-sm text-left">
                        <tbody className="divide-y divide-slate-50">
                        {data.topDuration.map((item, idx) => (
                            <tr key={idx} className="hover:bg-blue-50/30 transition-colors">
                                <td className="px-6 py-3.5 w-12 text-center text-slate-400 font-mono text-xs">{idx + 1}</td>
                                <td className="px-2 py-3.5 font-medium text-slate-700 truncate max-w-[180px]"
                                    title={item.title}>{item.title}</td>
                                <td className="px-6 py-3.5 text-right font-bold text-blue-600">{item.value}</td>
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

            <div className="text-center text-xs text-slate-300 pb-8">
                Data updated automatically · {new Date().toLocaleString()}
            </div>

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #e2e8f0; border-radius: 20px; }
            `}</style>

        </div>
    );
}
