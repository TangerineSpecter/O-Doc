import {useEffect, useState} from 'react';
import {
    BookOpen,
    Calendar,
    Clock,
    Database,
    Download,
    FileText,
    Hash,
    Layers,
    Loader2,
    MousePointer
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

// 预定义颜色，用于分类图表
const COLORS = ['#3b82f6', '#f97316', '#ec4899', '#10b981', '#8b5cf6', '#6366f1', '#14b8a6', '#f43f5e'];

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

export default function StatisticsPage() {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<StatsDashboardData | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await getStatisticsData();
                setData(res);
            } catch (error) {
                console.error("Failed to fetch stats:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

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