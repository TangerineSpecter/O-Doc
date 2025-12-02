import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  Search, 
  Bell, 
  ChevronDown, 
  BookOpen, 
  FileText, 
  Cpu, 
  Layers, 
  Zap, 
  Globe, 
  Filter,
  ArrowUpDown,
  ArrowUp,
  Clock,
  LogIn,
  Settings,
  Hash,
  CornerDownLeft,
  Check,
  Server,
  Database,
  Shield,
  Smartphone,
  Code,
  Terminal,
  Activity,
  Plus,
  X,
  Lock,
  Unlock,
  // New Icons for Selection
  Cloud,
  Folder,
  Briefcase,
  Layout,
  Box,
  Hexagon,
  Command,
  Target,
  Grid,
  HardDrive,
  PenTool,
  Archive
} from 'lucide-react';

// Mock Data for Document Collections - Moved to Initial State
const initialCollectionsData = [
  {
    id: 1,
    title: "小橘部署指南",
    count: 42,
    icon: <Cpu className="w-4 h-4 text-orange-500" />,
    isTop: true,
    description: "全面介绍小橘文档私有化部署、Docker容器化及集群配置方案。",
    articles: [
      { title: "服务器环境依赖检查清单", date: "11-24" },
      { title: "Docker Compose 一键部署", date: "11-20" },
      { title: "Nginx 反向代理配置详解", date: "11-18" },
      { title: "数据库迁移与备份策略", date: "11-15" },
    ]
  },
  {
    id: 2,
    title: "API 接口开发手册",
    count: 128,
    icon: <Zap className="w-4 h-4 text-orange-500" />,
    isTop: true,
    description: "后端接口定义、鉴权机制（OAuth2.0）、以及错误码字典查询。",
    articles: [
      { title: "认证鉴权：Access Token 获取", date: "12-01" },
      { title: "通用返回结构与分页说明", date: "11-30" },
      { title: "用户模块接口定义 (v2.0)", date: "11-28" },
      { title: "Webhook 回调事件配置", date: "11-25" },
    ]
  },
  {
    id: 3,
    title: "前端组件库样式规范",
    count: 35,
    icon: <Layers className="w-4 h-4 text-orange-500" />,
    isTop: false,
    description: "基于 Tailwind CSS 的设计系统，包含色彩、排版及核心组件。",
    articles: [
      { title: "Color Palette：品牌色与辅助色", date: "10-15" },
      { title: "Button 按钮组件交互状态", date: "09-22" },
      { title: "Form 表单验证与错误提示", date: "09-20" },
      { title: "Dark Mode 暗黑模式适配指南", date: "09-18" },
    ]
  },
  {
    id: 4,
    title: "产品更新日志 (Changelog)",
    count: 12,
    icon: <Globe className="w-4 h-4 text-blue-500" />,
    isTop: false,
    description: "记录小橘文档从 v1.0 到最新版本的所有迭代细节与修复。",
    articles: [
      { title: "v2.1.0：新增AI智能搜索功能", date: "12-02" },
      { title: "v2.0.5：修复移动端表格显示异常", date: "11-28" },
      { title: "v2.0.0：全新UI架构重构发布", date: "11-01" },
      { title: "v1.9.8：支持 Markdown 扩展语法", date: "10-24" },
    ]
  },
  {
    id: 5,
    title: "企业版专属功能",
    count: 8,
    icon: <BookOpen className="w-4 h-4 text-purple-500" />,
    isTop: false,
    description: "针对企业客户的高级功能，如SSO单点登录、审计日志及水印。",
    articles: [
      { title: "配置 LDAP/AD 域账号同步", date: "08-05" },
      { title: "开启文档水印与防复制策略", date: "07-22" },
      { title: "审计日志导出与分析", date: "07-15" },
      { title: "SLA 服务等级协议说明", date: "06-30" },
    ]
  },
  {
    id: 6,
    title: "开源社区贡献指南",
    count: 15,
    icon: <User className="w-4 h-4 text-green-500" />,
    isTop: false,
    description: "欢迎参与开源共建！这里有代码规范、PR流程及Issue模板。",
    articles: [
      { title: "环境搭建：如何启动本地开发", date: "05-12" },
      { title: "Git Commit Message 规范", date: "05-10" },
      { title: "如何提交第一个 Pull Request", date: "05-08" },
      { title: "维护者列表及联系方式", date: "05-01" },
    ]
  },
  {
    id: 7,
    title: "运维监控与告警",
    count: 56,
    icon: <Activity className="w-4 h-4 text-red-500" />,
    isTop: false,
    description: "集成 Prometheus + Grafana 监控体系，配置告警规则与通知渠道。",
    articles: [
      { title: "Prometheus Exporter 配置指南", date: "04-20" },
      { title: "Grafana 仪表盘导入教程", date: "04-18" },
      { title: "慢SQL查询告警阈值设置", date: "04-15" },
      { title: "日志采集 ELK Stack 集成", date: "04-10" },
    ]
  },
  {
    id: 8,
    title: "数据库性能优化",
    count: 23,
    icon: <Database className="w-4 h-4 text-indigo-500" />,
    isTop: false,
    description: "MySQL 索引优化策略、分库分表方案及 Redis 缓存一致性探讨。",
    articles: [
      { title: "Explain 分析 SQL 执行计划", date: "03-22" },
      { title: "Redis 缓存穿透与雪崩解决方案", date: "03-15" },
      { title: "MySQL 主从复制延迟排查", date: "03-10" },
      { title: "MyCat 分库分表实战", date: "03-05" },
    ]
  },
  {
    id: 9,
    title: "安全合规白皮书",
    count: 18,
    icon: <Shield className="w-4 h-4 text-teal-500" />,
    isTop: true,
    description: "遵循 GDPR 与等保 2.0 标准的数据安全规范与加密传输协议。",
    articles: [
      { title: "HTTPS 证书申请与续期自动配置", date: "02-28" },
      { title: "敏感数据脱敏存储方案", date: "02-20" },
      { title: "CSRF 与 XSS 攻击防御", date: "02-15" },
      { title: "定期漏洞扫描报告解读", date: "02-10" },
    ]
  },
  {
    id: 10,
    title: "移动端适配指南",
    count: 45,
    icon: <Smartphone className="w-4 h-4 text-pink-500" />,
    isTop: false,
    description: "iOS 与 Android 客户端兼容性处理，Flutter 混合开发接入文档。",
    articles: [
      { title: "H5 页面在 WebView 中的交互", date: "01-15" },
      { title: "刘海屏与安全区域适配", date: "01-12" },
      { title: "移动端手势冲突解决方案", date: "01-08" },
      { title: "离线包加载与缓存策略", date: "01-05" },
    ]
  },
  {
    id: 11,
    title: "Go 语言编码规范",
    count: 89,
    icon: <Code className="w-4 h-4 text-sky-500" />,
    isTop: false,
    description: "统一团队 Go 项目代码风格，包含 Linter 配置与最佳实践。",
    articles: [
      { title: "Uber Go Style Guide 解读", date: "12-20" },
      { title: "Error Handling 错误处理最佳实践", date: "12-18" },
      { title: "Goroutine 泄漏排查与预防", date: "12-15" },
      { title: "Go Modules 依赖管理进阶", date: "12-10" },
    ]
  },
  {
    id: 12,
    title: "Shell 脚本自动化",
    count: 31,
    icon: <Terminal className="w-4 h-4 text-gray-600" />,
    isTop: false,
    description: "常用运维脚本集合，包含自动备份、日志清理及健康检查脚本。",
    articles: [
      { title: "每日数据库自动备份脚本", date: "11-25" },
      { title: "磁盘空间监控与自动清理", date: "11-22" },
      { title: "Nginx 日志切割脚本", date: "11-18" },
      { title: "服务器初始化配置脚本", date: "11-15" },
    ]
  },
   {
    id: 13,
    title: "微服务架构设计",
    count: 67,
    icon: <Server className="w-4 h-4 text-violet-500" />,
    isTop: false,
    description: "Spring Cloud Alibaba 全家桶使用指南及服务治理策略。",
    articles: [
      { title: "Nacos 服务注册与配置中心", date: "10-30" },
      { title: "Sentinel 熔断降级限流实战", date: "10-25" },
      { title: "Seata 分布式事务解决方案", date: "10-20" },
      { title: "Gateway 网关路由配置", date: "10-15" },
    ]
  }
];

// Search Suggestion Data
const searchSuggestions = [
  { id: 'rec-1', type: 'recent', title: "Docker Compose 一键部署", subtitle: "部署指南", icon: <Clock className="w-4 h-4" /> },
  { id: 'rec-2', type: 'recent', title: "错误码字典查询", subtitle: "API 手册", icon: <Hash className="w-4 h-4" /> },
  { id: 'sug-1', type: 'suggest', title: "如何配置 Nginx 反向代理", subtitle: "跳转", icon: <FileText className="w-4 h-4" /> },
  { id: 'sug-2', type: 'suggest', title: "偏好设置", subtitle: "设置", icon: <Settings className="w-4 h-4" /> },
];

// Expanded Icons for Selection (20 Icons)
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

function User({ className }) {
  // Simple wrapper for the user icon to avoid conflict with the component name
  return (
    <div className={className}>
       <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-user"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
    </div>
  )
}

export default function LittleOrangeDocs() {
  const [collections, setCollections] = useState(initialCollectionsData);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchInputRef = useRef(null);
  
  // Search Navigation State
  const [searchIndex, setSearchIndex] = useState(0);

  // Filter & Sort State
  const [filterType, setFilterType] = useState('all'); // all, top
  const [sortType, setSortType] = useState('default'); // default, count, az
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
    permission: "public" // public | private
  });
  
  // 1. Process ALL Collections based on Filter/Sort first
  const processedAllCollections = useMemo(() => {
    let result = [...collections]; // Use state here

    // Filter
    if (filterType === 'top') {
      result = result.filter(item => item.isTop);
    }

    // Sort
    if (sortType === 'count') {
      result.sort((a, b) => b.count - a.count);
    } else if (sortType === 'az') {
      result.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
    }

    return result;
  }, [filterType, sortType, collections]);

  // 2. Derive VISIBLE collections based on visibleCount
  const visibleCollections = useMemo(() => {
    return processedAllCollections.slice(0, visibleCount);
  }, [processedAllCollections, visibleCount]);

  const hasMore = visibleCollections.length < processedAllCollections.length;

  // Reset pagination when filter/sort changes
  useEffect(() => {
    setVisibleCount(12);
  }, [filterType, sortType]);

  // Infinite Scroll Handler
  const handleScroll = useCallback(() => {
    if (isLoadingMore || !hasMore) return;

    // Check if scrolled to bottom (with some buffer)
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const windowHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;

    if (scrollTop + windowHeight >= documentHeight - 100) {
      setIsLoadingMore(true);
      // Simulate network request
      setTimeout(() => {
        setVisibleCount(prev => prev + 6);
        setIsLoadingMore(false);
      }, 800);
    }
  }, [isLoadingMore, hasMore]);

  // Attach Scroll Listener
  useEffect(() => {
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // Safety Check: Auto-load if content doesn't fill screen (Fix for large screens/no scrollbar)
  useEffect(() => {
    if (hasMore && !isLoadingMore) {
       const timer = setTimeout(() => {
         const documentHeight = document.documentElement.scrollHeight;
         const windowHeight = window.innerHeight;
         
         // If content is shorter than window + buffer, trigger load
         if (documentHeight <= windowHeight + 100) {
           console.log("Auto-loading more content to fill screen...");
           setIsLoadingMore(true);
           setTimeout(() => {
             setVisibleCount(prev => prev + 6);
             setIsLoadingMore(false);
           }, 500);
         }
       }, 500); // Wait for render/animation
       return () => clearTimeout(timer);
    }
  }, [visibleCollections.length, hasMore, isLoadingMore]);

  // Keyboard Navigation for Search
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Command/Ctrl + K Toggle
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
      
      if (!isSearchOpen) return;

      // Esc Close
      if (e.key === 'Escape') {
        setIsSearchOpen(false);
      }

      // Arrow Navigation
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSearchIndex(prev => (prev + 1) % searchSuggestions.length);
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSearchIndex(prev => (prev - 1 + searchSuggestions.length) % searchSuggestions.length);
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        console.log("Selected:", searchSuggestions[searchIndex].title);
        setIsSearchOpen(false); // Close on selection
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSearchOpen, searchIndex]);

  // Focus Input on Open
  useEffect(() => {
    if (isSearchOpen) {
      setSearchIndex(0); // Reset selection
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [isSearchOpen]);

  // Handle Create Collection
  const handleCreateCollection = () => {
    if (!newCollectionData.title) return; // Simple validation

    const selectedIcon = availableIcons.find(i => i.id === newCollectionData.iconId);
    
    // Clone icon element to inject classes if needed, or just use as is
    // Here we construct a similar icon element structure as mock data
    const iconElement = React.cloneElement(selectedIcon.icon, {
      className: `w-4 h-4 ${selectedIcon.color}`
    });

    const newItem = {
      id: Date.now(),
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
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-orange-100 selection:text-orange-900" onClick={() => { setIsFilterOpen(false); setIsSortOpen(false); }}>
      
      {/* Create Collection Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 animate-in fade-in duration-200">
           {/* Backdrop */}
           <div 
             className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
             onClick={() => setIsCreateModalOpen(false)}
           ></div>

           {/* Modal Dialog */}
           <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-2 duration-200">
             
             {/* Header */}
             <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                <h3 className="text-lg font-bold text-slate-800">新建文集</h3>
                <button 
                  onClick={() => setIsCreateModalOpen(false)}
                  className="p-1 rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors"
                >
                   <X className="w-5 h-5" />
                </button>
             </div>

             {/* Body */}
             <div className="p-6 space-y-5">
                
                {/* Name Input */}
                <div className="space-y-1.5">
                   <label className="text-sm font-semibold text-slate-700">文集名称 <span className="text-red-500">*</span></label>
                   <input 
                     type="text" 
                     placeholder="例如：产品需求文档" 
                     className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm"
                     value={newCollectionData.title}
                     onChange={(e) => setNewCollectionData({...newCollectionData, title: e.target.value})}
                     autoFocus
                   />
                </div>

                {/* Description Input */}
                <div className="space-y-1.5">
                   <label className="text-sm font-semibold text-slate-700">简介说明</label>
                   <textarea 
                     placeholder="简要描述该文集的用途..." 
                     rows={3}
                     className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm resize-none"
                     value={newCollectionData.description}
                     onChange={(e) => setNewCollectionData({...newCollectionData, description: e.target.value})}
                   />
                </div>

                {/* Icon Selection - Horizontal Scroll */}
                <div className="space-y-2">
                   <label className="text-sm font-semibold text-slate-700">选择图标</label>
                   {/* Scroll Container */}
                   <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent -mx-1 px-1">
                      {availableIcons.map((item) => (
                        <button 
                          key={item.id}
                          onClick={() => setNewCollectionData({...newCollectionData, iconId: item.id})}
                          className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center border transition-all ${
                            newCollectionData.iconId === item.id 
                            ? 'bg-orange-50 border-orange-500 text-orange-600 ring-2 ring-orange-200' 
                            : 'bg-white border-slate-200 text-slate-400 hover:border-orange-300 hover:text-slate-600'
                          }`}
                        >
                           {React.cloneElement(item.icon, { className: "w-5 h-5" })}
                        </button>
                      ))}
                   </div>
                </div>

                {/* Permission Selection */}
                <div className="space-y-2">
                   <label className="text-sm font-semibold text-slate-700">访问权限</label>
                   <div className="grid grid-cols-2 gap-3">
                      <div 
                        onClick={() => setNewCollectionData({...newCollectionData, permission: 'public'})}
                        className={`cursor-pointer p-3 border rounded-lg flex items-center gap-3 transition-all ${
                          newCollectionData.permission === 'public'
                          ? 'bg-orange-50 border-orange-500 ring-1 ring-orange-500'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                         <div className={`p-2 rounded-full ${newCollectionData.permission === 'public' ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-500'}`}>
                           <Globe className="w-4 h-4" />
                         </div>
                         <div>
                            <div className="text-sm font-medium text-slate-800">公开文集</div>
                            <div className="text-xs text-slate-500">所有访客可见</div>
                         </div>
                      </div>

                      <div 
                        onClick={() => setNewCollectionData({...newCollectionData, permission: 'private'})}
                        className={`cursor-pointer p-3 border rounded-lg flex items-center gap-3 transition-all ${
                          newCollectionData.permission === 'private'
                          ? 'bg-orange-50 border-orange-500 ring-1 ring-orange-500'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                         <div className={`p-2 rounded-full ${newCollectionData.permission === 'private' ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-500'}`}>
                           <Lock className="w-4 h-4" />
                         </div>
                         <div>
                            <div className="text-sm font-medium text-slate-800">私密文集</div>
                            <div className="text-xs text-slate-500">仅团队成员可见</div>
                         </div>
                      </div>
                   </div>
                </div>

             </div>

             {/* Footer */}
             <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                <button 
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  取消
                </button>
                <button 
                  onClick={handleCreateCollection}
                  disabled={!newCollectionData.title}
                  className="px-4 py-2 text-sm font-medium text-white bg-orange-500 hover:bg-orange-600 active:bg-orange-700 rounded-lg transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  立即创建
                </button>
             </div>

           </div>
        </div>
      )}

      {/* Search Modal */}
      {isSearchOpen && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4 animate-in fade-in duration-200">
          <div 
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setIsSearchOpen(false)}
          ></div>
          
          <div className="relative w-full max-w-2xl bg-white rounded-xl shadow-2xl shadow-slate-900/20 ring-1 ring-slate-900/5 overflow-hidden flex flex-col animate-in zoom-in-95 slide-in-from-bottom-2 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex items-center border-b border-slate-100 px-4 py-4 gap-3">
              <Search className="w-5 h-5 text-slate-400" />
              <input 
                ref={searchInputRef}
                type="text" 
                placeholder="搜索文档、API、或跳转到..." 
                className="flex-1 text-lg bg-transparent border-none outline-none text-slate-800 placeholder:text-slate-400 h-8"
              />
              <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200 font-mono">ESC</span>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-2">
              <div className="space-y-1">
                {searchSuggestions.map((item, index) => (
                  <div 
                    key={item.id}
                    onClick={() => { console.log(item.title); setIsSearchOpen(false); }}
                    onMouseEnter={() => setSearchIndex(index)}
                    className={`flex items-center justify-between px-3 py-3 rounded-lg cursor-pointer transition-colors ${
                      index === searchIndex ? 'bg-orange-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 ${index === searchIndex ? 'text-orange-500' : 'text-slate-400'}`}>
                        {item.icon}
                      </div>
                      <span className={`text-sm ${index === searchIndex ? 'text-slate-900 font-medium' : 'text-slate-700'}`}>
                        {item.title}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs ${index === searchIndex ? 'text-orange-600' : 'text-slate-400'}`}>
                        {item.subtitle}
                      </span>
                      {index === searchIndex && (
                        <CornerDownLeft className="w-3.5 h-3.5 text-orange-400" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-50 border-t border-slate-100 px-4 py-2 flex justify-between items-center text-xs text-slate-500">
               <div className="flex gap-4">
                 <span className="flex items-center gap-1"><ArrowUpDown className="w-3 h-3" /> 选择</span>
                 <span className="flex items-center gap-1"><CornerDownLeft className="w-3 h-3" /> 打开</span>
               </div>
               <div>小橘文档 Search v2.1</div>
            </div>
          </div>
        </div>
      )}

      {/* Navbar */}
      <nav className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-orange-400 to-red-500 rounded-lg flex items-center justify-center text-white font-bold shadow-lg shadow-orange-500/30">
                <BookOpen size={18} strokeWidth={3} />
              </div>
              <span className="text-xl font-bold tracking-tight text-slate-900">
                小橘<span className="text-orange-600">文档</span>
              </span>
            </div>

            <div className="flex items-center gap-4 sm:gap-6">
              <div 
                className="hidden md:flex relative group cursor-pointer"
                onClick={() => setIsSearchOpen(true)}
              >
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-slate-400 group-hover:text-orange-500 transition-colors" />
                </div>
                <div className="pl-10 pr-4 py-2 w-64 bg-slate-100 border border-transparent rounded-full text-sm text-slate-400 group-hover:bg-white group-hover:ring-2 group-hover:ring-orange-500/50 group-hover:border-orange-500 transition-all shadow-inner flex items-center justify-between">
                  <span>搜索文档...</span>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] bg-white text-slate-400 border border-slate-200 rounded px-1.5 py-0.5 shadow-sm">
                      ⌘K
                    </span>
                  </div>
                </div>
              </div>

              <button 
                className="md:hidden p-2 text-slate-500 hover:text-slate-700"
                onClick={() => setIsSearchOpen(true)}
              >
                <Search className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-3 pl-4 border-l border-slate-200">
                <button className="p-2 text-slate-500 hover:text-orange-600 transition-colors relative">
                  <Bell className="w-5 h-5" />
                  <span className="absolute top-1.5 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
                </button>
                
                {/* User Dropdown with FIXED Hover Gap */}
                <div className="relative group z-50">
                  {/* Trigger */}
                  <div className="flex items-center gap-2 cursor-pointer hover:bg-slate-100 p-1.5 rounded-full pr-3 transition-colors">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-slate-200 to-slate-300 flex items-center justify-center text-slate-600 border border-white shadow-sm overflow-hidden">
                      <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" alt="User" />
                    </div>
                    <span className="text-sm font-medium text-slate-700 hidden sm:block">访客用户</span>
                    <ChevronDown className="w-3 h-3 text-slate-400 hidden sm:block group-hover:rotate-180 transition-transform" />
                  </div>

                  {/* Fix: 使用 pt-2 创建透明“桥梁”，连接 Trigger 和 Dropdown 内容。
                     group-hover:block 确保鼠标经过透明桥梁时下拉框不会消失。
                  */}
                  <div className="absolute right-0 top-full pt-2 w-56 hidden group-hover:block animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="bg-white rounded-xl shadow-xl border border-slate-100 p-2">
                      <div className="px-3 py-2 border-b border-slate-100 mb-1">
                        <p className="text-sm font-semibold text-slate-800">未登录</p>
                        <p className="text-xs text-slate-500">请登录以保存进度</p>
                      </div>
                      <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-orange-50 hover:text-orange-600 rounded-lg transition-colors text-left">
                        <LogIn className="w-4 h-4" />
                        立即登录 / 注册
                      </button>
                      <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg transition-colors text-left">
                        <Settings className="w-4 h-4" />
                        偏好设置
                      </button>
                      <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg transition-colors text-left">
                        <BookOpen className="w-4 h-4" />
                        帮助中心
                      </button>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        
        {/* Filter Bar with Functionality */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 bg-white p-3 rounded-xl shadow-sm border border-slate-100">
          
          <div className="relative">
            <button className="flex items-center gap-2 text-slate-700 font-semibold text-base hover:text-orange-600 transition-colors pl-2">
              所有文集 ({processedAllCollections.length})
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-grow sm:flex-grow-0">
               <input 
                 type="text" 
                 placeholder="筛选文集..." 
                 className="pl-3 pr-8 py-1 bg-slate-50 border border-slate-200 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-orange-500 w-full sm:w-40"
               />
               <Search className="w-3 h-3 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2" />
            </div>
            
            <div className="h-5 w-px bg-slate-200 hidden sm:block mx-1"></div>

            {/* Filter Button */}
            <div className="relative">
              <button 
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs transition-colors ${filterType !== 'all' ? 'bg-orange-50 text-orange-600 border border-orange-200' : 'text-slate-600 hover:bg-slate-100'}`}
                onClick={(e) => { e.stopPropagation(); setIsFilterOpen(!isFilterOpen); setIsSortOpen(false); }}
              >
                <Filter className="w-3.5 h-3.5" />
                <span>{filterType === 'all' ? '筛选' : filterType === 'top' ? '仅置顶' : '筛选'}</span>
              </button>
              
              {isFilterOpen && (
                <div className="absolute right-0 top-full mt-2 w-32 bg-white rounded-lg shadow-xl border border-slate-100 z-20 py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                  <button 
                    onClick={() => setFilterType('all')} 
                    className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex justify-between items-center"
                  >
                    全部
                    {filterType === 'all' && <Check className="w-3 h-3 text-orange-500"/>}
                  </button>
                  <button 
                    onClick={() => setFilterType('top')} 
                    className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex justify-between items-center"
                  >
                    只看置顶
                    {filterType === 'top' && <Check className="w-3 h-3 text-orange-500"/>}
                  </button>
                </div>
              )}
            </div>

            {/* Sort Button */}
            <div className="relative">
              <button 
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs transition-colors ${sortType !== 'default' ? 'bg-orange-50 text-orange-600 border border-orange-200' : 'text-slate-600 hover:bg-slate-100'}`}
                onClick={(e) => { e.stopPropagation(); setIsSortOpen(!isSortOpen); setIsFilterOpen(false); }}
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
                <span>{sortType === 'default' ? '排序' : sortType === 'count' ? '按数量' : '按名称'}</span>
              </button>

              {isSortOpen && (
                <div className="absolute right-0 top-full mt-2 w-32 bg-white rounded-lg shadow-xl border border-slate-100 z-20 py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                  <button 
                    onClick={() => setSortType('default')} 
                    className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex justify-between items-center"
                  >
                    默认排序
                    {sortType === 'default' && <Check className="w-3 h-3 text-orange-500"/>}
                  </button>
                  <button 
                    onClick={() => setSortType('count')} 
                    className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex justify-between items-center"
                  >
                    按数量 (多→少)
                    {sortType === 'count' && <Check className="w-3 h-3 text-orange-500"/>}
                  </button>
                  <button 
                    onClick={() => setSortType('az')} 
                    className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex justify-between items-center"
                  >
                    按名称 (A-Z)
                    {sortType === 'az' && <Check className="w-3 h-3 text-orange-500"/>}
                  </button>
                </div>
              )}
            </div>

             {/* New Collection Button */}
             <div className="h-5 w-px bg-slate-200 hidden sm:block mx-1"></div>
            
            <button 
              onClick={() => setIsCreateModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-md text-xs font-medium transition-all shadow-sm shadow-orange-500/20 active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={3} />
              <span className="hidden sm:inline">新建文集</span>
              <span className="sm:hidden">新建</span>
            </button>

          </div>
        </div>

        {/* Grid Content */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visibleCollections.map((item) => (
            <div 
              key={item.id} 
              className="group bg-white rounded-xl border border-slate-200 hover:border-orange-200 hover:shadow-lg hover:shadow-orange-500/5 transition-all duration-300 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-500"
            >
              {/* Card Header */}
              <div className="p-3 pb-2">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 bg-slate-50 rounded-md border border-slate-100 group-hover:bg-orange-50 group-hover:border-orange-100 transition-colors">
                      {item.icon}
                    </div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-slate-800 text-base leading-tight group-hover:text-orange-600 transition-colors cursor-pointer">
                        {item.title}
                      </h3>
                      {item.isTop && (
                         <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-red-50 border border-red-100 text-[10px] font-bold text-red-600 leading-none">
                            <ArrowUp className="w-2.5 h-2.5" strokeWidth={3} />
                            置顶
                         </span>
                      )}
                      {item.permission === 'private' && (
                         <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-[10px] font-medium text-slate-500 leading-none">
                            <Lock className="w-2.5 h-2.5" />
                         </span>
                      )}
                    </div>
                  </div>
                  <span className="bg-slate-50 text-slate-400 text-[10px] font-semibold px-1.5 py-0.5 rounded min-w-[1.5rem] text-center">
                    {item.count}
                  </span>
                </div>
                
                <p className="text-slate-500 text-xs line-clamp-2 leading-relaxed mb-2 h-8">
                  {item.description}
                </p>
              </div>

              {/* Article List */}
              <div className="flex-1 bg-slate-50/30 border-t border-slate-100 p-1">
                {item.articles.length > 0 ? (
                  <ul className="space-y-0.5">
                    {item.articles.map((article, idx) => (
                      <li 
                        key={idx} 
                        className="group/item flex items-center justify-between py-1.5 px-2 rounded hover:bg-white hover:shadow-sm transition-all cursor-pointer"
                      >
                        <div className="flex items-center gap-2 overflow-hidden">
                          <FileText className="w-3 h-3 text-slate-300 group-hover/item:text-orange-500 flex-shrink-0" />
                          <span className="text-xs text-slate-600 truncate group-hover/item:text-slate-900 transition-colors">
                            {article.title}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-300 font-mono whitespace-nowrap pl-2">
                          {article.date}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                   <div className="h-full flex flex-col items-center justify-center text-slate-400 py-4 gap-2">
                      <div className="bg-white p-2 rounded-full border border-dashed border-slate-300">
                         <Plus className="w-4 h-4 text-slate-300" />
                      </div>
                      <span className="text-[10px]">暂无文档，点击创建</span>
                   </div>
                )}
              </div>

              {/* Card Footer */}
              <div className="bg-white border-t border-slate-50 h-0 group-hover:h-8 transition-all duration-300 overflow-hidden flex items-center justify-center">
                 <button className="text-[10px] font-medium text-orange-600 hover:text-orange-700 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity delay-75">
                    查看全部 <ChevronDown className="w-2.5 h-2.5 -rotate-90" />
                 </button>
              </div>

            </div>
          ))}

          {visibleCollections.length === 0 && (
            <div className="col-span-full py-12 flex flex-col items-center justify-center text-slate-400">
               <div className="bg-slate-50 p-4 rounded-full mb-3">
                 <Search className="w-6 h-6" />
               </div>
               <p>没有找到符合条件的文集</p>
               <button 
                 onClick={() => { setFilterType('all'); setSortType('default'); }}
                 className="mt-2 text-xs text-orange-500 hover:underline"
               >
                 清除筛选
               </button>
            </div>
          )}
        </div>

        {/* Infinite Scroll Footer */}
        <div className="mt-8 flex justify-center pb-8">
          {isLoadingMore ? (
             // Loading State
             <div className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-full shadow-sm text-xs text-slate-600">
               <div className="w-3 h-3 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
               <span>正在加载更多...</span>
             </div>
          ) : hasMore ? (
             // Idle State (visible but not active unless scrolled)
             <span className="text-xs text-slate-300">向下滚动加载更多</span>
          ) : visibleCollections.length > 0 ? (
             // End State
             <div className="text-xs text-slate-400 font-medium bg-slate-100/50 px-4 py-1.5 rounded-full">
               — 已经到底了，暂无更多内容 —
             </div>
          ) : null}
        </div>

      </main>

      <div className="fixed inset-0 pointer-events-none z-[-1] opacity-40">
        <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-orange-50/50 to-transparent"></div>
        <div className="absolute right-0 top-20 w-96 h-96 bg-blue-100/30 rounded-full blur-3xl"></div>
        <div className="absolute left-10 top-40 w-72 h-72 bg-orange-100/30 rounded-full blur-3xl"></div>
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10"></div>
        <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)', backgroundSize: '24px 24px', maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.5), transparent)' }}></div>
      </div>

    </div>
  );
}