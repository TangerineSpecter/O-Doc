import React, { useState } from 'react';
import { 
    FileText, Database, Clock, Layers, Hash, Calendar, 
    TrendingUp, BarChart2, MousePointer, BookOpen, Download 
} from 'lucide-react';

// --- 1. 轻量级图表组件 (SVG实现) ---

// 24小时双曲线图 (访问量 vs 阅读时长)
const DualLineChart = ({ data }) => {
    const width = 100;
    const height = 50;
    const padding = 2;
    
    // 数据归一化辅助函数
    const normalize = (val, max, min) => {
        return height - padding - ((val - min) / (max - min)) * (height - 2 * padding);
    };

    const maxVisits = Math.max(...data.map(d => d.visits));
    const minVisits = Math.min(...data.map(d => d.visits));
    const maxDuration = Math.max(...data.map(d => d.duration));
    const minDuration = Math.min(...data.map(d => d.duration));

    // 生成路径点
    const pointsVisits = data.map((d, i) => 
        `${(i / (data.length - 1)) * width},${normalize(d.visits, maxVisits, minVisits)}`
    ).join(' ');

    const pointsDuration = data.map((d, i) => 
        `${(i / (data.length - 1)) * width},${normalize(d.duration, maxDuration, minDuration)}`
    ).join(' ');

    return (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
            {/* 网格线 (辅助) */}
            <line x1="0" y1={height/2} x2={width} y2={height/2} stroke="#f1f5f9" strokeWidth="0.5" strokeDasharray="2 2" />
            
            {/* 曲线 1: 访问次数 (橙色) */}
            <polyline 
                points={pointsVisits} 
                fill="none" 
                stroke="#f97316" 
                strokeWidth="1.5" 
                strokeLinecap="round" 
                strokeLinejoin="round"
                className="drop-shadow-sm"
            />
            {/* 曲线 2: 阅读时长 (蓝色) */}
            <polyline 
                points={pointsDuration} 
                fill="none" 
                stroke="#3b82f6" 
                strokeWidth="1.5" 
                strokeLinecap="round" 
                strokeLinejoin="round"
                strokeDasharray="3 1" // 虚线区分
                className="drop-shadow-sm opacity-60"
            />

            {/* Hover 点 (仅示意) */}
            {data.map((d, i) => i % 4 === 0 && (
                <circle key={i} cx={(i / (data.length - 1)) * width} cy={normalize(d.visits, maxVisits, minVisits)} r="1.5" fill="white" stroke="#f97316" strokeWidth="1" />
            ))}
        </svg>
    );
};

// 简单的柱状图 (周发布统计)
const BarChart = ({ data, color = "#10b981" }) => {
    const max = Math.max(...data.map(d => d.count));
    
    return (
        <div className="flex justify-between items-end h-full gap-2 px-2">
            {data.map((item, index) => (
                <div key={index} className="flex flex-col items-center gap-1 flex-1 group">
                    <div className="relative w-full bg-slate-100 rounded-t-sm h-full flex items-end overflow-hidden">
                        <div 
                            className="w-full rounded-t-sm transition-all duration-500 group-hover:opacity-80 relative"
                            style={{ 
                                height: `${(item.count / max) * 100}%`,
                                backgroundColor: color
                            }}
                        >
                             {/* Tooltip */}
                             <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] py-0.5 px-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                                {item.count} 篇
                            </div>
                        </div>
                    </div>
                    <span className="text-[10px] text-slate-400 font-medium">{item.day}</span>
                </div>
            ))}
        </div>
    );
};

// --- 2. 模拟数据 ---

// 0-24h 趋势数据
const HOURLY_DATA = Array.from({ length: 24 }).map((_, i) => ({
    hour: i,
    visits: Math.floor(Math.random() * 300) + 50 + (i > 9 && i < 22 ? 200 : 0), // 白天高
    duration: Math.floor(Math.random() * 5000) + 1000 + (i > 19 ? 3000 : 0), // 晚上阅读时间长
}));

// 周发布数据
const WEEKLY_PUBLISH = [
    { day: 'Mon', count: 12 },
    { day: 'Tue', count: 18 },
    { day: 'Wed', count: 25 },
    { day: 'Thu', count: 22 },
    { day: 'Fri', count: 15 },
    { day: 'Sat', count: 8 },
    { day: 'Sun', count: 5 },
];

// 分类数据
const CATEGORY_STATS = [
    { name: '研发', count: 145, color: 'bg-blue-500' },
    { name: '产品', count: 89, color: 'bg-orange-500' },
    { name: '设计', count: 64, color: 'bg-pink-500' },
    { name: '运维', count: 42, color: 'bg-emerald-500' },
    { name: '其他', count: 28, color: 'bg-slate-400' },
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

// 排行榜数据
const TOP_VISITS = [
    { id: 1, title: 'Docker 容器化最佳实践', value: '12,405 次' },
    { id: 2, title: 'React Hooks 深度解析', value: '8,932 次' },
    { id: 3, title: 'Nginx 反向代理配置', value: '6,721 次' },
    { id: 4, title: 'MySQL 索引优化指南', value: '5,432 次' },
    { id: 5, title: 'Spring Boot 3.0 新特性', value: '4,120 次' },
];

const TOP_DURATION = [
    { id: 1, title: '分布式系统架构设计', value: '892 小时' },
    { id: 2, title: 'JavaScript 高级程序设计笔记', value: '645 小时' },
    { id: 3, title: 'Linux 内核源码分析', value: '520 小时' },
    { id: 4, title: 'Kubernetes 集群搭建实战', value: '480 小时' },
    { id: 5, title: '算法导论 - 动态规划', value: '415 小时' },
];

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
                            <TrendingUp className="w-5 h-5" />
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
                
                {/* 2.1 用户行为透视 (24小时分布) - 占据 2/3 宽度 */}
                <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col">
                    <div className="flex justify-between items-start mb-6">
                        <div>
                            <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                <Clock className="w-4 h-4 text-orange-500" />
                                用户阅读行为透视 (24h)
                            </h3>
                            <p className="text-xs text-slate-400 mt-1">每个小时的 <span className="text-orange-500 font-medium">访问次数</span> 与 <span className="text-blue-500 font-medium">阅读时长</span> 分布对比</p>
                        </div>
                        <div className="flex items-center gap-3 text-[10px] font-medium">
                            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-orange-500"></span>访问次</span>
                            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500"></span>时长</span>
                        </div>
                    </div>
                    
                    <div className="flex-1 w-full min-h-[220px]">
                        <DualLineChart data={HOURLY_DATA} />
                    </div>
                    
                    {/* X轴 Label */}
                    <div className="flex justify-between text-[10px] text-slate-300 mt-2 font-mono px-1">
                        <span>00:00</span>
                        <span>04:00</span>
                        <span>08:00</span>
                        <span>12:00</span>
                        <span>16:00</span>
                        <span>20:00</span>
                        <span>23:59</span>
                    </div>
                </div>

                {/* 2.2 创作习惯 (周发布统计) - 占据 1/3 宽度 */}
                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-1">
                        <Calendar className="w-4 h-4 text-emerald-500" />
                        创作习惯分析
                    </h3>
                    <p className="text-xs text-slate-400 mb-6">统计每周各天的发文数量分布</p>
                    
                    <div className="flex-1 w-full min-h-[180px]">
                        <BarChart data={WEEKLY_PUBLISH} color="#10b981" />
                    </div>
                </div>
            </div>

            {/* --- 3. 内容结构分析 (分类 & 标签) --- */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                {/* 3.1 分类统计 */}
                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-6">
                        <Layers className="w-4 h-4 text-purple-500" />
                        分类内容占比
                    </h3>
                    <div className="space-y-4">
                        {CATEGORY_STATS.map((cat, idx) => (
                            <div key={idx} className="flex items-center gap-3 text-sm">
                                <span className="w-16 text-slate-600 truncate">{cat.name}</span>
                                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                    <div className={`h-full ${cat.color} rounded-full`} style={{ width: `${(cat.count / 145) * 100}%` }}></div>
                                </div>
                                <span className="w-12 text-right font-mono text-slate-500">{cat.count}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 3.2 标签云统计 */}
                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-6">
                        <Hash className="w-4 h-4 text-indigo-500" />
                        热门标签分布
                    </h3>
                    <div className="flex flex-wrap gap-3">
                        {TAG_STATS.map((tag, idx) => (
                            <div key={idx} className="flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-100 rounded-lg min-w-[100px]">
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

        </div>
    );
}