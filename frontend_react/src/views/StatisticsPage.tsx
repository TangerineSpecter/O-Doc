import {
    FileText, Database, Clock, Layers, Hash, Calendar,
    MousePointer, BookOpen, Download
} from 'lucide-react';
// 1. 引入 Recharts 组件
import {
    LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

// --- 模拟数据 ---

// 0-24h 趋势数据
const HOURLY_DATA = Array.from({ length: 24 }).map((_, i) => ({
    hour: `${i.toString().padStart(2, '0')}:00`,
    visits: Math.floor(Math.random() * 300) + 50 + (i > 9 && i < 22 ? 200 : 0), // 访问量
    duration: Math.floor(Math.random() * 60) + 10 + (i > 19 ? 40 : 0), // 阅读时长(分钟)
}));

// 周发布数据
const WEEKLY_PUBLISH = [
    { day: '周一', count: 12 },
    { day: '周二', count: 18 },
    { day: '周三', count: 25 },
    { day: '周四', count: 22 },
    { day: '周五', count: 15 },
    { day: '周六', count: 8 },
    { day: '周日', count: 5 },
];

// 分类数据 (用于饼图)
const CATEGORY_STATS = [
    { name: '研发', value: 145, color: '#3b82f6' }, // blue-500
    { name: '产品', value: 89, color: '#f97316' },  // orange-500
    { name: '设计', value: 64, color: '#ec4899' },  // pink-500
    { name: '运维', value: 42, color: '#10b981' },  // emerald-500
    { name: '其他', value: 28, color: '#94a3b8' },  // slate-400
];

// 标签数据
const TAG_STATS = [
    { name: 'React', count: 45 },
    { name: 'Docker', count: 38 },
    { name: 'API', count: 32 },
    { name: '数据库', count: 28 },
    { name: '性能优化', count: 21 },
    { name: '微服务', count: 19 },
];

const TOP_VISITS = [
    { id: 1, title: 'Docker 容器化最佳实践', value: '12,405' },
    { id: 2, title: 'React Hooks 深度解析', value: '8,932' },
    { id: 3, title: 'Nginx 反向代理配置', value: '6,721' },
    { id: 4, title: 'MySQL 索引优化指南', value: '5,432' },
    { id: 5, title: 'Spring Boot 3.0 新特性', value: '4,120' },
];

const TOP_DURATION = [
    { id: 1, title: '分布式系统架构设计', value: '892h' },
    { id: 2, title: 'JavaScript 高级程序设计笔记', value: '645h' },
    { id: 3, title: 'Linux 内核源码分析', value: '520h' },
    { id: 4, title: 'Kubernetes 集群搭建实战', value: '480h' },
    { id: 5, title: '算法导论 - 动态规划', value: '415h' },
];

interface CustomTooltipProps {
    active?: boolean;
    payload?: any[];
    label?: string;
}

// --- 自定义 Tooltip 组件 (为了匹配 UI 风格) ---
const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-white p-3 border border-slate-100 shadow-lg rounded-xl text-xs">
                <p className="font-bold text-slate-700 mb-2">{label}</p>
                {payload.map((entry, index) => (
                    <div key={index} className="flex items-center gap-2 mb-1 last:mb-0">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }}></div>
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
    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        内容与行为分析 <span className="text-orange-500">.</span>
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">深度洞察内容资产沉淀与用户阅读习惯。</p>
                </div>
                <button className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-sm hover:text-orange-600 hover:border-orange-200 transition-colors shadow-sm">
                    <Download className="w-4 h-4" /> 导出报表
                </button>
            </div>

            {/* --- 1. 核心资产概览 (KPI Cards) --- */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {/* 1.1 文章总数 */}
                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        <FileText className="w-16 h-16 text-slate-800" />
                    </div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                            <Layers className="w-5 h-5" />
                        </div>
                        <span className="text-slate-500 text-xs font-medium">文章总数</span>
                    </div>
                    <div className="text-2xl font-bold text-slate-900 ml-1">368 <span className="text-xs font-normal text-slate-400">篇</span></div>
                </div>

                {/* 1.2 总字数 */}
                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Hash className="w-16 h-16 text-orange-500" />
                    </div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-orange-50 text-orange-600 rounded-lg">
                            <Calendar className="w-5 h-5" />
                        </div>
                        <span className="text-slate-500 text-xs font-medium">累计创作字数</span>
                    </div>
                    <div className="text-2xl font-bold text-slate-900 ml-1">1.2m <span className="text-xs font-normal text-slate-400">字</span></div>
                </div>

                {/* 1.3 资源总数 */}
                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Database className="w-16 h-16 text-emerald-500" />
                    </div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                            <Database className="w-5 h-5" />
                        </div>
                        <span className="text-slate-500 text-xs font-medium">资源文件数</span>
                    </div>
                    <div className="text-2xl font-bold text-slate-900 ml-1">124 <span className="text-xs font-normal text-slate-400">个</span></div>
                </div>

                {/* 1.4 累计阅读时长 */}
                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Clock className="w-16 h-16 text-pink-500" />
                    </div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-pink-50 text-pink-600 rounded-lg">
                            <Clock className="w-5 h-5" />
                        </div>
                        <span className="text-slate-500 text-xs font-medium">累计被阅读时长</span>
                    </div>
                    <div className="text-2xl font-bold text-slate-900 ml-1">1,280 <span className="text-xs font-normal text-slate-400">小时</span></div>
                </div>
            </div>

            {/* --- 2. 核心图表区 --- */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">

                {/* 2.1 用户行为透视 (Recharts 双轴图表) */}
                <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col h-[380px]">
                    <div className="flex justify-between items-start mb-6">
                        <div>
                            <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                <Clock className="w-4 h-4 text-orange-500" />
                                用户阅读行为透视 (24h)
                            </h3>
                        </div>
                    </div>

                    <div className="flex-1 w-full text-xs">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={HOURLY_DATA} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis
                                    dataKey="hour"
                                    tick={{ fill: '#94a3b8', fontSize: 10 }}
                                    axisLine={false}
                                    tickLine={false}
                                    interval={3} // 每隔3个显示一个
                                />
                                {/* 左轴：访问次数 */}
                                <YAxis
                                    yAxisId="left"
                                    tick={{ fill: '#f97316', fontSize: 10 }}
                                    axisLine={false}
                                    tickLine={false}
                                    label={{ value: '次数', angle: -90, position: 'insideLeft', fill: '#fdba74', fontSize: 10 }}
                                />
                                {/* 右轴：阅读时长 */}
                                <YAxis
                                    yAxisId="right"
                                    orientation="right"
                                    tick={{ fill: '#3b82f6', fontSize: 10 }}
                                    axisLine={false}
                                    tickLine={false}
                                    label={{ value: '时长(分)', angle: 90, position: 'insideRight', fill: '#93c5fd', fontSize: 10 }}
                                />
                                <Tooltip content={<CustomTooltip />} />
                                <Legend
                                    iconType="circle"
                                    iconSize={8}
                                    wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}
                                />
                                {/* 曲线配置 */}
                                <Line
                                    yAxisId="left"
                                    type="monotone"
                                    dataKey="visits"
                                    name="访问次数"
                                    stroke="#f97316"
                                    strokeWidth={2}
                                    dot={false}
                                    activeDot={{ r: 4, strokeWidth: 0 }}
                                    unit="次"
                                />
                                <Line
                                    yAxisId="right"
                                    type="monotone"
                                    dataKey="duration"
                                    name="平均阅读时长"
                                    stroke="#3b82f6"
                                    strokeWidth={2}
                                    strokeDasharray="4 4"
                                    dot={false}
                                    activeDot={{ r: 4, strokeWidth: 0 }}
                                    unit="分"
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* 2.2 创作习惯 (Recharts 柱状图) */}
                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col h-[380px]">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-2">
                        <Calendar className="w-4 h-4 text-emerald-500" />
                        创作习惯分析
                    </h3>
                    <p className="text-xs text-slate-400 mb-6">每周各天发文分布</p>

                    <div className="flex-1 w-full text-xs">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={WEEKLY_PUBLISH} barSize={20}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis
                                    dataKey="day"
                                    tick={{ fill: '#94a3b8', fontSize: 10 }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <YAxis hide />
                                <Tooltip
                                    cursor={{ fill: '#f1f5f9' }}
                                    content={<CustomTooltip />}
                                />
                                <Bar
                                    dataKey="count"
                                    name="发文数"
                                    fill="#10b981"
                                    radius={[4, 4, 0, 0]}
                                    unit="篇"
                                >
                                    {/* 渐变色填充 */}
                                    {WEEKLY_PUBLISH.map((_, index) => (
                                        <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#10b981' : '#34d399'} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* --- 3. 内容结构分析 (分类饼图 & 标签云) --- */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                {/* 3.1 分类统计 (Recharts 饼图) */}
                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm h-[320px] flex flex-col">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
                        <Layers className="w-4 h-4 text-purple-500" />
                        分类内容占比
                    </h3>
                    <div className="flex-1 flex items-center">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={CATEGORY_STATS}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {CATEGORY_STATS.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} strokeWidth={0} />
                                    ))}
                                </Pie>
                                <Tooltip content={<CustomTooltip />} />
                                <Legend
                                    layout="vertical"
                                    verticalAlign="middle"
                                    align="right"
                                    iconType="circle"
                                    iconSize={8}
                                    wrapperStyle={{ fontSize: '11px', color: '#64748b' }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* 3.2 标签云统计 (保持 CSS 实现，因为标签云不适合标准图表) */}
                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm h-[320px] overflow-y-auto custom-scrollbar">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-6">
                        <Hash className="w-4 h-4 text-indigo-500" />
                        热门标签分布
                    </h3>
                    <div className="flex flex-wrap gap-3">
                        {TAG_STATS.map((tag, idx) => (
                            <div key={idx} className="flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-100 rounded-lg min-w-[100px] hover:border-indigo-200 transition-colors cursor-default">
                                <span className="text-sm text-slate-600">{tag.name}</span>
                                <span className="text-xs font-bold text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded ml-2">{tag.count}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* --- 4. 深度榜单 (Top Rankings) --- */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">

                {/* 4.1 访问次数排行榜 */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-50 bg-slate-50/30 flex justify-between items-center">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                            <MousePointer className="w-4 h-4 text-orange-500" />
                            文章访问次数 TOP 5
                        </h3>
                    </div>
                    <table className="w-full text-sm text-left">
                        <tbody className="divide-y divide-slate-50">
                            {TOP_VISITS.map((item, idx) => (
                                <tr key={idx} className="hover:bg-orange-50/30 transition-colors">
                                    <td className="px-6 py-3.5 w-12 text-center text-slate-400 font-mono text-xs">{idx + 1}</td>
                                    <td className="px-2 py-3.5 font-medium text-slate-700 truncate max-w-[180px]" title={item.title}>{item.title}</td>
                                    <td className="px-6 py-3.5 text-right font-bold text-orange-600">{item.value}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* 4.2 阅读时长排行榜 */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-50 bg-slate-50/30 flex justify-between items-center">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                            <BookOpen className="w-4 h-4 text-blue-500" />
                            文章阅读时长 TOP 5
                        </h3>
                    </div>
                    <table className="w-full text-sm text-left">
                        <tbody className="divide-y divide-slate-50">
                            {TOP_DURATION.map((item, idx) => (
                                <tr key={idx} className="hover:bg-blue-50/30 transition-colors">
                                    <td className="px-6 py-3.5 w-12 text-center text-slate-400 font-mono text-xs">{idx + 1}</td>
                                    <td className="px-2 py-3.5 font-medium text-slate-700 truncate max-w-[180px]" title={item.title}>{item.title}</td>
                                    <td className="px-6 py-3.5 text-right font-bold text-blue-600">{item.value}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="text-center text-xs text-slate-300 pb-8">
                Data updated automatically · Server Time: 2025-11-20 14:30
            </div>

            {/* 内联样式修复 scrollbar */}
            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #e2e8f0; border-radius: 20px; }
            `}</style>

        </div>
    );
}
