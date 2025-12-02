import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
    ChevronDown, BookOpen, FileText, Cpu, Layers, Zap, Globe, Filter,
    ArrowUpDown, ArrowUp, Lock, Cloud, Folder, Briefcase, Layout, Box,
    Hexagon, Command, Target, Grid, HardDrive, PenTool, Archive, User,
    Activity, Database, Shield, Smartphone, Code, Terminal, Server, Plus,
    X, Check, Search
} from 'lucide-react';

// --- Expanded Icons for Selection ---
const availableIcons = [
    { id: 'book', icon: <BookOpen />, color: "text-blue-500" },
    { id: 'code', icon: <Code />, color: "text-sky-500" },
    { id: 'server', icon: <Server />, color: "text-violet-500" },
    { id: 'database', icon: <Database />, color: "text-indigo-500" },
    { id: 'shield', icon: <Shield />, color: "text-teal-500" },
    { id: 'zap', icon: <Zap />, color: "text-orange-500" },
    { id: 'cloud', icon: <Cloud />, color: "text-cyan-500" },
    { id: 'folder', icon: <Folder />, color: "text-yellow-500" },
    { id: 'briefcase', icon: <Briefcase />, color: "text-amber-700" },
    { id: 'layout', icon: <Layout />, color: "text-pink-500" },
    { id: 'box', icon: <Box />, color: "text-fuchsia-500" },
    { id: 'terminal', icon: <Terminal />, color: "text-slate-700" },
    { id: 'activity', icon: <Activity />, color: "text-rose-500" },
    { id: 'hexagon', icon: <Hexagon />, color: "text-lime-600" },
    { id: 'command', icon: <Command />, color: "text-gray-500" },
    { id: 'target', icon: <Target />, color: "text-red-600" },
    { id: 'grid', icon: <Grid />, color: "text-emerald-500" },
    { id: 'harddrive', icon: <HardDrive />, color: "text-slate-500" },
    { id: 'pentool', icon: <PenTool />, color: "text-purple-600" },
    { id: 'archive', icon: <Archive />, color: "text-amber-600" },
];

// --- 1. 手动精选数据 ---
const manualData = [
    {
        id: 1,
        coll_id: "col_deploy_001",
        title: "小橘部署指南",
        count: 42,
        icon: <Cpu className="w-4 h-4 text-orange-500" />,
        isTop: true,
        permission: 'public',
        description: "全面介绍小橘文档私有化部署、Docker容器化及集群配置方案。",
        articles: [
            { article_id: "art_dep_101", title: "服务器环境依赖检查清单", date: "11-24" },
            { article_id: "art_dep_102", title: "Docker Compose 一键部署", date: "11-20" },
            { article_id: "art_dep_103", title: "Nginx 反向代理配置详解", date: "11-18" },
        ]
    },
    {
        id: 2,
        coll_id: "col_api_002",
        title: "API 接口开发手册",
        count: 128,
        icon: <Zap className="w-4 h-4 text-orange-500" />,
        isTop: true,
        permission: 'public',
        description: "后端接口定义、鉴权机制（OAuth2.0）、以及错误码字典查询。",
        articles: [
            { article_id: "art_api_201", title: "认证鉴权：Access Token 获取", date: "12-01" },
            { article_id: "art_api_202", title: "通用返回结构与分页说明", date: "11-30" },
            { article_id: "art_api_203", title: "用户模块接口定义 (v2.0)", date: "11-28" },
        ]
    },
    {
        id: 3,
        coll_id: "col_ui_003",
        title: "前端组件库样式规范",
        count: 35,
        icon: <Layers className="w-4 h-4 text-orange-500" />,
        isTop: false,
        permission: 'public',
        description: "基于 Tailwind CSS 的设计系统，包含色彩、排版及核心组件。",
        articles: [
            { article_id: "art_ui_301", title: "Color Palette：品牌色与辅助色", date: "10-15" },
            { article_id: "art_ui_302", title: "Button 按钮组件交互状态", date: "09-22" },
            { article_id: "art_ui_303", title: "Form 表单验证与错误提示", date: "09-20" },
        ]
    },
    {
        id: 4,
        coll_id: "col_log_004",
        title: "产品更新日志 (Changelog)",
        count: 12,
        icon: <Globe className="w-4 h-4 text-blue-500" />,
        isTop: false,
        permission: 'public',
        description: "记录小橘文档从 v1.0 到最新版本的所有迭代细节与修复。",
        articles: [
            { article_id: "art_log_401", title: "v2.1.0：新增AI智能搜索功能", date: "12-02" },
            { article_id: "art_log_402", title: "v2.0.5：修复移动端表格显示异常", date: "11-28" },
            { article_id: "art_log_403", title: "v2.0.0：全新UI架构重构发布", date: "11-01" },
        ]
    },
    {
        id: 5,
        coll_id: "col_ent_005",
        title: "企业版专属功能",
        count: 8,
        icon: <BookOpen className="w-4 h-4 text-purple-500" />,
        isTop: false,
        permission: 'private',
        description: "针对企业客户的高级功能，如SSO单点登录、审计日志及水印。",
        articles: [
            { article_id: "art_ent_501", title: "配置 LDAP/AD 域账号同步", date: "08-05" },
            { article_id: "art_ent_502", title: "开启文档水印与防复制策略", date: "07-22" }
        ]
    },
    {
        id: 6,
        coll_id: "col_ms_013",
        title: "微服务架构设计",
        count: 67,
        icon: <Server className="w-4 h-4 text-violet-500" />,
        isTop: false,
        permission: 'public',
        description: "Spring Cloud Alibaba 全家桶使用指南及服务治理策略。",
        articles: [
            { article_id: "art_ms_1301", title: "Nacos 服务注册与配置中心", date: "10-30" },
            { article_id: "art_ms_1302", title: "Sentinel 熔断降级限流实战", date: "10-25" },
        ]
    },
    {
        id: 7,
        coll_id: "col_db_007",
        title: "数据库运维手册",
        count: 45,
        icon: <Database className="w-4 h-4 text-indigo-500" />,
        isTop: false,
        permission: 'private',
        description: "MySQL 高可用集群搭建、Redis 缓存策略及数据备份恢复流程。",
        articles: [
            { article_id: "art_db_701", title: "MySQL 8.0 主从复制搭建", date: "10-12" },
            { article_id: "art_db_702", title: "Redis Cluster 集群扩容方案", date: "10-08" },
        ]
    },
    {
        id: 8,
        coll_id: "col_sec_008",
        title: "安全合规与审计",
        count: 19,
        icon: <Shield className="w-4 h-4 text-teal-500" />,
        isTop: true,
        permission: 'private',
        description: "网络安全策略、渗透测试报告及GDPR合规性检查清单。",
        articles: [
            { article_id: "art_sec_801", title: "Web应用防火墙(WAF)规则配置", date: "11-05" },
            { article_id: "art_sec_802", title: "定期漏洞扫描执行报告", date: "11-01" },
        ]
    }
];

// --- 2. 自动生成大量数据 (用于测试滚动加载) ---
const generatedData = Array.from({ length: 32 }).map((_, index) => {
    const id = index + 20;
    const iconObj = availableIcons[index % availableIcons.length]; // 循环使用图标
    const categories = ['运维', '产品', '研发', '测试', '设计', '市场'];
    const category = categories[index % categories.length];
    
    // 随机生成一些文章
    const articlesCount = Math.floor(Math.random() * 4); // 0-3 articles
    const articles = Array.from({ length: articlesCount }).map((_, i) => ({
        article_id: `art_gen_${id}_${i}`,
        title: `${category}相关文档 - 进阶教程 ${i + 1}`,
        date: `12-${10 + i}`
    }));

    return {
        id: id,
        coll_id: `col_gen_${id}`,
        title: `${category}中心 - 项目文档集 ${id}`,
        count: Math.floor(Math.random() * 100) + 1,
        icon: React.cloneElement(iconObj.icon, { className: `w-4 h-4 ${iconObj.color}` }),
        isTop: Math.random() > 0.9, // 10% chance top
        permission: Math.random() > 0.8 ? 'private' : 'public', // 20% chance private
        description: `这是自动生成的第 ${index + 1} 个测试数据，用于验证页面无限滚动加载效果是否流畅。包含${category}相关的详细资料。`,
        articles: articles
    };
});

// 合并数据
const initialCollectionsData = [...manualData, ...generatedData];


// 接收 onNavigate 属性
export default function HomePage({ onNavigate }) {
    const [collections, setCollections] = useState(initialCollectionsData);

    // Filter & Sort State
    const [filterType, setFilterType] = useState('all');
    const [sortType, setSortType] = useState('default');
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [isSortOpen, setIsSortOpen] = useState(false);

    // Pagination & Scroll State
    const [visibleCount, setVisibleCount] = useState(12);
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    // Create Modal State
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [newCollectionData, setNewCollectionData] = useState({
        title: "",
        description: "",
        iconId: "book",
        permission: "public"
    });

    const processedAllCollections = useMemo(() => {
        let result = [...collections];
        if (filterType === 'top') {
            result = result.filter(item => item.isTop);
        }
        if (sortType === 'count') {
            result.sort((a, b) => b.count - a.count);
        } else if (sortType === 'az') {
            result.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
        }
        return result;
    }, [filterType, sortType, collections]);

    const visibleCollections = useMemo(() => {
        return processedAllCollections.slice(0, visibleCount);
    }, [processedAllCollections, visibleCount]);

    const hasMore = visibleCollections.length < processedAllCollections.length;

    useEffect(() => {
        setVisibleCount(12);
    }, [filterType, sortType]);

    // 滚动监听逻辑
    const handleScroll = useCallback(() => {
        if (isLoadingMore || !hasMore) return;
        
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        const windowHeight = window.innerHeight;
        const documentHeight = document.documentElement.scrollHeight;
        
        // 当滚动条距离底部小于 100px 时触发加载
        if (scrollTop + windowHeight >= documentHeight - 100) {
            setIsLoadingMore(true);
            // 模拟网络请求延迟 800ms
            setTimeout(() => {
                setVisibleCount(prev => prev + 6);
                setIsLoadingMore(false);
            }, 800);
        }
    }, [isLoadingMore, hasMore]);

    useEffect(() => {
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, [handleScroll]);

    const handleCreateCollection = () => {
        if (!newCollectionData.title) return;
        const selectedIcon = availableIcons.find(i => i.id === newCollectionData.iconId);
        const iconElement = React.cloneElement(selectedIcon.icon, {
            className: `w-4 h-4 ${selectedIcon.color}`
        });

        const newItem = {
            id: Date.now(),
            coll_id: `col_new_${Date.now()}`, 
            title: newCollectionData.title,
            count: 0,
            icon: iconElement,
            isTop: false,
            description: newCollectionData.description || "暂无简介",
            articles: [],
            permission: newCollectionData.permission
        };

        setCollections([newItem, ...collections]);
        setIsCreateModalOpen(false);
        setNewCollectionData({ title: "", description: "", iconId: "book", permission: "public" });
    };

    return (
        <div onClick={() => { setIsFilterOpen(false); setIsSortOpen(false); }}>

            {/* Create Collection Modal */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsCreateModalOpen(false)}></div>
                    <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-2 duration-200">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                            <h3 className="text-lg font-bold text-slate-800">新建文集</h3>
                            <button onClick={() => setIsCreateModalOpen(false)} className="p-1 rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-5">
                            <div className="space-y-1.5">
                                <label className="text-sm font-semibold text-slate-700">文集名称 <span className="text-red-500">*</span></label>
                                <input type="text" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm" value={newCollectionData.title} onChange={(e) => setNewCollectionData({ ...newCollectionData, title: e.target.value })} autoFocus />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-semibold text-slate-700">简介说明</label>
                                <textarea rows={3} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm resize-none" value={newCollectionData.description} onChange={(e) => setNewCollectionData({ ...newCollectionData, description: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">选择图标</label>
                                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent -mx-1 px-1">
                                    {availableIcons.map((item) => (
                                        <button key={item.id} onClick={() => setNewCollectionData({ ...newCollectionData, iconId: item.id })} className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center border transition-all ${newCollectionData.iconId === item.id ? 'bg-orange-50 border-orange-500 text-orange-600 ring-2 ring-orange-200' : 'bg-white border-slate-200 text-slate-400 hover:border-orange-300 hover:text-slate-600'}`}>{React.cloneElement(item.icon, { className: "w-5 h-5" })}</button>
                                    ))}
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">访问权限</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <div onClick={() => setNewCollectionData({ ...newCollectionData, permission: 'public' })} className={`cursor-pointer p-3 border rounded-lg flex items-center gap-3 transition-all ${newCollectionData.permission === 'public' ? 'bg-orange-50 border-orange-500 ring-1 ring-orange-500' : 'bg-white border-slate-200 hover:border-slate-300'}`}><div className={`p-2 rounded-full ${newCollectionData.permission === 'public' ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-500'}`}><Globe className="w-4 h-4" /></div><div><div className="text-sm font-medium text-slate-800">公开文集</div><div className="text-xs text-slate-500">所有访客可见</div></div></div>
                                    <div onClick={() => setNewCollectionData({ ...newCollectionData, permission: 'private' })} className={`cursor-pointer p-3 border rounded-lg flex items-center gap-3 transition-all ${newCollectionData.permission === 'private' ? 'bg-orange-50 border-orange-500 ring-1 ring-orange-500' : 'bg-white border-slate-200 hover:border-slate-300'}`}><div className={`p-2 rounded-full ${newCollectionData.permission === 'private' ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-500'}`}><Lock className="w-4 h-4" /></div><div><div className="text-sm font-medium text-slate-800">私密文集</div><div className="text-xs text-slate-500">仅团队成员可见</div></div></div>
                                </div>
                            </div>
                        </div>
                        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                            <button onClick={() => setIsCreateModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">取消</button>
                            <button onClick={handleCreateCollection} disabled={!newCollectionData.title} className="px-4 py-2 text-sm font-medium text-white bg-orange-500 hover:bg-orange-600 active:bg-orange-700 rounded-lg transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">立即创建</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

                {/* Filter Bar */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 bg-white p-3 rounded-xl shadow-sm border border-slate-100">
                    <div className="relative">
                        <button className="flex items-center gap-2 text-slate-700 font-semibold text-base hover:text-orange-600 transition-colors pl-2">
                            所有文集 ({processedAllCollections.length})
                            <ChevronDown className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                        <div className="relative flex-grow sm:flex-grow-0">
                            <input type="text" placeholder="筛选文集..." className="pl-3 pr-8 py-1 bg-slate-50 border border-slate-200 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-orange-500 w-full sm:w-40" />
                            <Search className="w-3 h-3 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2" />
                        </div>
                        <div className="h-5 w-px bg-slate-200 hidden sm:block mx-1"></div>
                        {/* Filter */}
                        <div className="relative">
                            <button className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs transition-colors ${filterType !== 'all' ? 'bg-orange-50 text-orange-600 border border-orange-200' : 'text-slate-600 hover:bg-slate-100'}`} onClick={(e) => { e.stopPropagation(); setIsFilterOpen(!isFilterOpen); setIsSortOpen(false); }}>
                                <Filter className="w-3.5 h-3.5" />
                                <span>{filterType === 'all' ? '筛选' : filterType === 'top' ? '仅置顶' : '筛选'}</span>
                            </button>
                            {isFilterOpen && (
                                <div className="absolute right-0 top-full mt-2 w-32 bg-white rounded-lg shadow-xl border border-slate-100 z-20 py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                                    <button onClick={() => setFilterType('all')} className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex justify-between items-center">全部{filterType === 'all' && <Check className="w-3 h-3 text-orange-500" />}</button>
                                    <button onClick={() => setFilterType('top')} className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex justify-between items-center">只看置顶{filterType === 'top' && <Check className="w-3 h-3 text-orange-500" />}</button>
                                </div>
                            )}
                        </div>
                        {/* Sort */}
                        <div className="relative">
                            <button className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs transition-colors ${sortType !== 'default' ? 'bg-orange-50 text-orange-600 border border-orange-200' : 'text-slate-600 hover:bg-slate-100'}`} onClick={(e) => { e.stopPropagation(); setIsSortOpen(!isSortOpen); setIsFilterOpen(false); }}>
                                <ArrowUpDown className="w-3.5 h-3.5" />
                                <span>{sortType === 'default' ? '排序' : sortType === 'count' ? '按数量' : '按名称'}</span>
                            </button>
                            {isSortOpen && (
                                <div className="absolute right-0 top-full mt-2 w-32 bg-white rounded-lg shadow-xl border border-slate-100 z-20 py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                                    <button onClick={() => setSortType('default')} className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex justify-between items-center">默认排序{sortType === 'default' && <Check className="w-3 h-3 text-orange-500" />}</button>
                                    <button onClick={() => setSortType('count')} className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex justify-between items-center">按数量 (多→少){sortType === 'count' && <Check className="w-3 h-3 text-orange-500" />}</button>
                                    <button onClick={() => setSortType('az')} className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex justify-between items-center">按名称 (A-Z){sortType === 'az' && <Check className="w-3 h-3 text-orange-500" />}</button>
                                </div>
                            )}
                        </div>
                        <div className="h-5 w-px bg-slate-200 hidden sm:block mx-1"></div>
                        <button onClick={() => setIsCreateModalOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-md text-xs font-medium transition-all shadow-sm shadow-orange-500/20 active:scale-95">
                            <Plus className="w-3.5 h-3.5" strokeWidth={3} /><span className="hidden sm:inline">新建文集</span><span className="sm:hidden">新建</span>
                        </button>
                    </div>
                </div>

                {/* Grid Content */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {visibleCollections.map((item) => (
                        <div key={item.id} className="group bg-white rounded-xl border border-slate-200 hover:border-orange-200 hover:shadow-lg hover:shadow-orange-500/5 transition-all duration-300 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-500">

                            {/* Card Header */}
                            <div className="p-3 pb-2">
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex items-center gap-2.5">
                                        <div className="p-1.5 bg-slate-50 rounded-md border border-slate-100 group-hover:bg-orange-50 group-hover:border-orange-100 transition-colors">
                                            {item.icon}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <h3
                                                onClick={() => onNavigate('article', { collId: item.coll_id, title: item.title })}
                                                className="font-bold text-slate-800 text-base leading-tight group-hover:text-orange-600 transition-colors cursor-pointer"
                                            >
                                                {item.title}
                                            </h3>
                                            {item.isTop && <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-red-50 border border-red-100 text-[10px] font-bold text-red-600 leading-none"><ArrowUp className="w-2.5 h-2.5" strokeWidth={3} />置顶</span>}
                                            {item.permission === 'private' && <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-[10px] font-medium text-slate-500 leading-none"><Lock className="w-2.5 h-2.5" /></span>}
                                        </div>
                                    </div>
                                    <span className="bg-slate-50 text-slate-400 text-[10px] font-semibold px-1.5 py-0.5 rounded min-w-[1.5rem] text-center">{item.count}</span>
                                </div>
                                <p className="text-slate-500 text-xs line-clamp-2 leading-relaxed mb-2 h-8">{item.description}</p>
                            </div>

                            {/* Article List */}
                            <div className="flex-1 bg-slate-50/30 border-t border-slate-100 p-1">
                                {item.articles.length > 0 ? (
                                    <ul className="space-y-0.5">
                                        {item.articles.map((article, idx) => (
                                            <li key={idx}
                                                onClick={() => onNavigate('article', { collId: item.coll_id, articleId: article.article_id, title: item.title, articleTitle: article.title })}
                                                className="group/item flex items-center justify-between py-1.5 px-2 rounded hover:bg-white hover:shadow-sm transition-all cursor-pointer"
                                            >
                                                <div className="flex items-center gap-2 overflow-hidden">
                                                    <FileText className="w-3 h-3 text-slate-300 group-hover/item:text-orange-500 flex-shrink-0" />
                                                    <span className="text-xs text-slate-600 truncate group-hover/item:text-slate-900 transition-colors">{article.title}</span>
                                                </div>
                                                <span className="text-[10px] text-slate-300 font-mono whitespace-nowrap pl-2">{article.date}</span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-400 py-4 gap-2">
                                        <div className="bg-white p-2 rounded-full border border-dashed border-slate-300"><Plus className="w-4 h-4 text-slate-300" /></div>
                                        <span className="text-[10px]">暂无文档，点击创建</span>
                                    </div>
                                )}
                            </div>

                            {/* Card Footer */}
                            <div className="bg-white border-t border-slate-50 h-0 group-hover:h-8 transition-all duration-300 overflow-hidden flex items-center justify-center">
                                <button
                                    onClick={() => onNavigate('article', { collId: item.coll_id, title: item.title })}
                                    className="text-[10px] font-medium text-orange-600 hover:text-orange-700 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity delay-75"
                                >
                                    查看全部 <ChevronDown className="w-2.5 h-2.5 -rotate-90" />
                                </button>
                            </div>

                        </div>
                    ))}

                    {visibleCollections.length === 0 && (
                        <div className="col-span-full py-12 flex flex-col items-center justify-center text-slate-400">
                            <div className="bg-slate-50 p-4 rounded-full mb-3"><Search className="w-6 h-6" /></div>
                            <p>没有找到符合条件的文集</p>
                            <button onClick={() => { setFilterType('all'); setSortType('default'); }} className="mt-2 text-xs text-orange-500 hover:underline">清除筛选</button>
                        </div>
                    )}
                </div>

                {/* Loader Footer */}
                <div className="mt-8 flex justify-center pb-8">
                    {isLoadingMore ? (
                        <div className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-full shadow-sm text-xs text-slate-600"><div className="w-3 h-3 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div><span>正在加载更多...</span></div>
                    ) : hasMore ? (
                        <span className="text-xs text-slate-300">向下滚动加载更多</span>
                    ) : visibleCollections.length > 0 ? (
                        <div className="text-xs text-slate-400 font-medium bg-slate-100/50 px-4 py-1.5 rounded-full">— 已经到底了，暂无更多内容 —</div>
                    ) : null}
                </div>

            </main>
        </div>
    );
}