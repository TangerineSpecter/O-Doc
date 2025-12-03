import React, { useState, useMemo } from 'react';
import { 
    Search, Filter, MoreVertical, Download, Trash2, FileText, 
    Image as ImageIcon, Music, Video, Box, FileCode, File, 
    HardDrive, Cloud, Clock, CheckCircle2 
} from 'lucide-react';

// --- 1. 模拟资源数据 ---
const MOCK_RESOURCES = [
    { id: 1, name: '项目需求说明书_v2.0.pdf', type: 'doc', size: '2.4 MB', date: '2025-11-20', author: 'Alex' },
    { id: 2, name: 'Login_Page_Design.fig', type: 'design', size: '15.6 MB', date: '2025-11-18', author: 'Sarah' },
    { id: 3, name: 'demo_recording.mp4', type: 'video', size: '128 MB', date: '2025-11-15', author: 'Mike' },
    { id: 4, name: 'background_assets.zip', type: 'archive', size: '45 MB', date: '2025-11-12', author: 'System' },
    { id: 5, name: 'api_utils.js', type: 'code', size: '12 KB', date: '2025-11-10', author: 'Dev' },
    { id: 6, name: 'Team_Photo_2025.jpg', type: 'image', size: '4.2 MB', date: '2025-11-08', author: 'HR' },
    { id: 7, name: 'quarterly_report.xlsx', type: 'doc', size: '1.1 MB', date: '2025-11-05', author: 'Finance' },
    { id: 8, name: 'Logo_Animation.json', type: 'code', size: '256 KB', date: '2025-11-01', author: 'Design' },
    { id: 9, name: 'meeting_minutes.docx', type: 'doc', size: '34 KB', date: '2025-10-28', author: 'Admin' },
    { id: 10, name: 'podcast_intro.mp3', type: 'audio', size: '8.5 MB', date: '2025-10-25', author: 'Marketing' },
    { id: 11, name: 'database_dump.sql', type: 'code', size: '56 MB', date: '2025-10-22', author: 'DBA' },
    { id: 12, name: 'illustration_set.png', type: 'image', size: '2.8 MB', date: '2025-10-20', author: 'Sarah' },
];

// --- 2. 类型配置 (图标与配色) ---
const TYPE_CONFIG = {
    all: { label: '全部', icon: <HardDrive />, color: 'bg-slate-100 text-slate-600' },
    image: { label: '图片', icon: <ImageIcon />, color: 'bg-purple-100 text-purple-600' },
    doc: { label: '文档', icon: <FileText />, color: 'bg-blue-100 text-blue-600' },
    video: { label: '视频', icon: <Video />, color: 'bg-rose-100 text-rose-600' },
    audio: { label: '音频', icon: <Music />, color: 'bg-amber-100 text-amber-600' },
    code: { label: '代码', icon: <FileCode />, color: 'bg-slate-200 text-slate-700' },
    archive: { label: '压缩包', icon: <Box />, color: 'bg-orange-100 text-orange-600' },
    design: { label: '设计', icon: <File />, color: 'bg-pink-100 text-pink-600' }, // Fallback
};

// 获取文件图标组件
const getFileIcon = (type) => {
    const config = TYPE_CONFIG[type] || TYPE_CONFIG.design;
    return config.icon;
};

// 获取文件颜色样式
const getFileStyle = (type) => {
    return TYPE_CONFIG[type]?.color || 'bg-slate-100 text-slate-500';
};

export default function ResourcesPage() {
    const [activeTab, setActiveTab] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');

    // 过滤逻辑
    const filteredResources = useMemo(() => {
        return MOCK_RESOURCES.filter(item => {
            const matchType = activeTab === 'all' || item.type === activeTab;
            const matchSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
            return matchType && matchSearch;
        });
    }, [activeTab, searchQuery]);

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            
            {/* Header Area */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        资源库 <span className="text-orange-500">.</span>
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">集中管理您的项目附件、媒体文件与设计素材。</p>
                </div>
                
                {/* 存储空间指示器 (装饰性) */}
                <div className="flex items-center gap-4 bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
                    <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                        <Cloud className="w-5 h-5" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-xs text-slate-500 font-medium">已用空间</span>
                        <div className="flex items-end gap-1">
                            <span className="text-sm font-bold text-slate-800">12.5 GB</span>
                            <span className="text-[10px] text-slate-400 mb-0.5">/ 50 GB</span>
                        </div>
                    </div>
                    <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden ml-2">
                        <div className="h-full bg-blue-500 w-1/4 rounded-full"></div>
                    </div>
                </div>
            </div>

            {/* Toolbar: Filter & Search */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 bg-white p-2 rounded-2xl shadow-sm border border-slate-100">
                
                {/* Tabs */}
                <div className="flex gap-1 overflow-x-auto w-full sm:w-auto pb-2 sm:pb-0 scrollbar-hide">
                    {Object.entries(TYPE_CONFIG).map(([key, config]) => (
                        <button
                            key={key}
                            onClick={() => setActiveTab(key)}
                            className={`
                                flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap
                                ${activeTab === key 
                                    ? 'bg-slate-800 text-white shadow-md shadow-slate-900/10' 
                                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}
                            `}
                        >
                            {React.cloneElement(config.icon, { className: "w-3.5 h-3.5" })}
                            {config.label}
                        </button>
                    ))}
                </div>

                {/* Search */}
                <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                        type="text" 
                        placeholder="搜索文件名..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all placeholder:text-slate-400"
                    />
                </div>
            </div>

            {/* File Grid */}
            {filteredResources.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {filteredResources.map((file) => (
                        <div 
                            key={file.id} 
                            className="group relative bg-white rounded-2xl border border-slate-200 hover:border-orange-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] transition-all duration-300 cursor-pointer overflow-hidden flex flex-col"
                        >
                            {/* Card Top: Preview / Icon */}
                            <div className="aspect-[4/3] bg-slate-50 border-b border-slate-100 flex items-center justify-center relative overflow-hidden">
                                {/* 文件类型背景装饰 */}
                                <div className={`absolute inset-0 opacity-10 ${getFileStyle(file.type).split(' ')[0]}`}></div>
                                
                                {/* 居中大图标 */}
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm transition-transform group-hover:scale-110 duration-300 ${getFileStyle(file.type)}`}>
                                    {React.cloneElement(getFileIcon(file.type), { className: "w-7 h-7" })}
                                </div>

                                {/* 右上角 Checkbox (Hover显示) */}
                                <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <div className="w-5 h-5 rounded-full border border-slate-300 bg-white hover:border-orange-500 cursor-pointer flex items-center justify-center">
                                        <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                                    </div>
                                </div>

                                {/* 右上角 More Menu (Hover显示) */}
                                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button className="p-1.5 rounded-lg bg-white/90 backdrop-blur hover:bg-slate-100 text-slate-500 shadow-sm border border-slate-200/50">
                                        <MoreVertical className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>

                            {/* Card Bottom: Info */}
                            <div className="p-3">
                                <div className="flex items-start justify-between gap-2 mb-1">
                                    <h3 className="text-sm font-semibold text-slate-700 truncate w-full" title={file.name}>{file.name}</h3>
                                </div>
                                <div className="flex items-center justify-between mt-2">
                                    <span className="text-[10px] font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded uppercase tracking-wide">
                                        {file.type}
                                    </span>
                                    <span className="text-[10px] text-slate-400">{file.size}</span>
                                </div>
                                <div className="flex items-center gap-1 mt-2 text-[10px] text-slate-300">
                                    <Clock className="w-3 h-3" />
                                    {file.date}
                                </div>
                            </div>

                            {/* Hover Actions Overlay (Bottom) */}
                            <div className="absolute bottom-0 left-0 right-0 p-3 bg-white/95 backdrop-blur border-t border-slate-100 translate-y-full group-hover:translate-y-0 transition-transform duration-200 flex justify-between gap-2">
                                <button className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-orange-50 text-orange-600 hover:bg-orange-100 text-xs font-medium transition-colors">
                                    <Download className="w-3.5 h-3.5" /> 下载
                                </button>
                                <button className="p-1.5 rounded-lg bg-slate-50 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors">
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400 bg-white rounded-2xl border border-dashed border-slate-200">
                    <div className="p-4 bg-slate-50 rounded-full mb-4">
                        <Filter className="w-8 h-8 text-slate-300" />
                    </div>
                    <p className="text-sm">没有找到相关资源文件</p>
                    <button onClick={() => {setActiveTab('all'); setSearchQuery('');}} className="mt-2 text-xs text-orange-500 hover:underline">清除筛选条件</button>
                </div>
            )}
        </div>
    );
}