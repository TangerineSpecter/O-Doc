import React, { useState, useMemo, useEffect } from 'react';
import {
  BookOpen,
  ChevronRight,
  ChevronDown,
  Search,
  Home,
  Menu
} from 'lucide-react';
// 确保 Article.jsx 在同一目录下，如果路径不同请修改这里
import Article from './Article'; 

// --- 1. 补回丢失的数据定义 (docData) ---
const docData = [
  {
    id: '1',
    title: '简易运行',
    date: '2025-11-18',
    type: 'doc'
  },
  {
    id: '2',
    title: '部署指南',
    date: '2022-06-24',
    type: 'doc',
    children: [
      {
        id: '2-1',
        title: 'Docker 部署 MrDoc (推荐)',
        date: '2023-02-24',
        type: 'doc',
        children: [
          { id: '2-1-1', title: 'Docker 镜像部署', date: '2025-05-22', type: 'doc' },
          { id: '2-1-2', title: 'Docker Compose 部署', date: '2025-03-11', type: 'doc' },
          { id: '2-1-3', title: '管理 Docker 容器', date: '2025-09-06', type: 'doc' },
        ]
      },
      {
        id: '2-2',
        title: 'Linux 部署 MrDoc',
        date: '2022-01-07',
        type: 'doc',
        children: [
          { id: '2-2-1', title: '使用 Nginx + uWSGI 部署 MrDoc', date: '2022-07-06', type: 'doc' },
          { id: '2-2-2', title: '一键部署脚本 (已停止维护)', date: '2025-11-03', type: 'doc' },
          { id: '2-2-3', title: '宝塔面板「Python 项目管理器1.9」部署', date: '2024-07-06', type: 'doc' },
          { id: '2-2-4', title: '官方 Docker 镜像部署', date: '2024-08-20', type: 'doc' },
        ]
      },
      {
        id: '2-3',
        title: 'Windows 部署 MrDoc',
        date: '2023-03-19',
        type: 'doc',
        children: [
          { id: '2-3-1', title: '使用 Waitress 部署', date: '2024-01-18', type: 'doc' },
          { id: '2-3-2', title: 'Windows 部署面板', date: '2022-11-23', type: 'doc' },
        ]
      },
      {
        id: '2-4',
        title: 'NAS 部署',
        date: '2025-07-31',
        type: 'doc',
        children: [
          { id: '2-4-1', title: '极空间 NAS 部署', date: '2025-08-07', type: 'doc' },
        ]
      },
      { id: '2-5', title: '更新升级说明', date: '2025-09-02', type: 'doc' },
      { id: '2-6', title: '系统依赖库说明', date: '2024-03-05', type: 'doc' },
      { id: '2-7', title: '原生部署转 Docker 部署', date: '2025-03-14', type: 'doc' },
    ]
  },
  {
    id: '3',
    title: '配置指南',
    date: '2025-07-31',
    type: 'doc',
    children: [
      { id: '3-1', title: '配置文件说明', date: '2022-01-15', type: 'doc' },
      { id: '3-2', title: '自定义数据库配置', date: '2025-11-24', type: 'doc' },
      { id: '3-3', title: '文集生成 PDF 文件的配置', date: '2022-11-23', type: 'doc' },
      { id: '3-4', title: '全文搜索配置', date: '2020-12-06', type: 'doc' },
      { id: '3-5', title: 'Docker 下使用 MySQL 数据库', date: '2023-05-13', type: 'doc' },
      { id: '3-6', title: 'MySQL 数据库支持 emoji 的配置', date: '2025-03-14', type: 'doc' },
      { id: '3-7', title: '使用 Nginx 托管静态文件资源', date: '2023-04-23', type: 'doc' },
    ]
  }
];

// --- 2. 补回辅助函数 (flattenDocs) ---
const flattenDocs = (data) => {
  let flat = [];
  const recurse = (items, parent = null) => {
    items.forEach(item => {
      flat.push({ ...item, parent });
      if (item.children) recurse(item.children, item);
    });
  };
  recurse(data);
  return flat;
};

const allDocs = flattenDocs(docData);

// --- 组件定义 ---
export default function ArticleOutline({ onNavigate, collId, title, articleId }) {
  
  // 3. 状态初始化：优先使用传入的 articleId
  const [activeDocId, setActiveDocId] = useState(articleId || null); 
  
  const [expandedIds, setExpandedIds] = useState(['2', '2-1']);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // 4. 监听 articleId 变化，解决"点击文章只显示大纲"的问题
  useEffect(() => {
    if (articleId) {
      setActiveDocId(articleId);
    }
  }, [articleId]);

  const toggleExpand = (e, id) => {
    e.stopPropagation();
    setExpandedIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleSelectDoc = (docId) => {
    setActiveDocId(docId);
    if (window.innerWidth < 768) setIsSidebarOpen(false);
    // 切换时让右侧滚动条复位
    const mainContainer = document.getElementById('right-content-window');
    if(mainContainer) mainContainer.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // --- 侧边栏 Item 渲染 ---
  const renderSidebarItem = (item, level = 0) => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedIds.includes(item.id);
    const isActive = activeDocId === item.id;
    const paddingLeft = 12 + level * 16;

    return (
      <div key={item.id}>
        <div
          onClick={() => handleSelectDoc(item.id)}
          className={`
            group flex items-center justify-between py-1.5 pr-2 cursor-pointer text-sm transition-colors border-l-2
            ${isActive
              ? 'border-orange-500 bg-orange-50 text-orange-700 font-medium'
              : 'border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900'}
          `}
          style={{ paddingLeft }}
        >
          <span className="truncate">{item.title}</span>
          {hasChildren && (
            <div
              onClick={(e) => toggleExpand(e, item.id)}
              className="p-1 rounded-sm hover:bg-black/5 text-slate-400 transition-colors"
            >
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </div>
          )}
        </div>

        {hasChildren && isExpanded && (
          <div>
            {item.children.map(child => renderSidebarItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  // --- 默认显示的大纲页面 (Home Content) ---
  const renderHomeContent = () => {
    const renderRow = (item, level = 0) => {
      const paddingLeft = level * 32;
      const isTopLevel = level === 0;

      return (
        <React.Fragment key={item.id}>
          <div
            onClick={() => handleSelectDoc(item.id)}
            className="group flex items-baseline hover:bg-orange-50/50 cursor-pointer py-2 transition-colors"
          >
            <div style={{ paddingLeft }} className="flex-shrink-0 relative">
              <span className={`
                 ${isTopLevel ? 'text-slate-700 font-medium' : 'text-slate-600'} 
                 group-hover:text-orange-600 transition-colors
               `}>
                {item.title}
              </span>
            </div>
            <div className="flex-grow mx-4 border-b border-dotted border-slate-300 relative -top-1 opacity-40 group-hover:opacity-60 group-hover:border-orange-300 transition-all"></div>
            <div className="flex-shrink-0 text-slate-400 text-sm font-mono group-hover:text-orange-500 transition-colors">
              {item.date}
            </div>
          </div>
          {item.children && item.children.map(child => renderRow(child, level + 1))}
        </React.Fragment>
      );
    };

    return (
      <div className="max-w-4xl mx-auto px-6 py-8 min-h-[80vh] animate-in fade-in duration-300">
        <div className="mb-10 p-6 bg-gradient-to-br from-white to-orange-50/50 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 -mt-4 -mr-4 w-32 h-32 bg-orange-100/50 rounded-full blur-3xl pointer-events-none"></div>
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6 relative z-10">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-white rounded-xl border border-orange-100 shadow-sm flex items-center justify-center text-orange-500 flex-shrink-0">
                <BookOpen size={24} strokeWidth={2.5} />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-800 tracking-tight mb-1">{title || '小橘文档 · 知识库'}</h1>
                <p className="text-slate-500 text-sm mb-3">记录产品部署、开发指南与最佳实践。</p>
                <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600 shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                  共 {allDocs.length} 篇文档
                </div>
              </div>
            </div>
            <div>
              <button
                onClick={() => onNavigate && onNavigate('home')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-600 hover:text-orange-600 border border-slate-200 hover:border-orange-200 rounded-lg text-sm font-medium transition-all shadow-sm active:scale-95"
              >
                <Home size={14} />
                <span>返回应用首页</span>
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8">
          <div className="flex flex-col">
            {docData.map(item => renderRow(item))}
          </div>
          <div className="mt-12 text-center text-slate-300 text-xs">
            — 文档目录结束 —
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-[calc(100vh-64px)] bg-[#F9FAFB] text-slate-800 font-sans overflow-hidden">
      {/* 侧边栏 */}
      <aside 
        className={`
          w-72 bg-white flex flex-col border-r border-slate-200 flex-shrink-0 h-full
          ${isSidebarOpen ? 'block' : 'hidden md:flex'} 
        `}
      >
        <div 
          onClick={() => setActiveDocId(null)} 
          className="h-14 flex items-center px-4 border-b border-slate-100 cursor-pointer hover:bg-slate-50 transition-colors flex-shrink-0"
        >
          <BookOpen size={16} className="text-orange-500 mr-2" />
          <span className="font-bold text-slate-700 text-sm truncate">{title || '文档目录'}</span>
        </div>

        <div className="p-3 flex-shrink-0">
          <div className="relative">
            <input
              type="text"
              placeholder="搜索目录..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 text-xs py-1.5 pl-8 pr-3 rounded-md focus:outline-none focus:ring-1 focus:ring-orange-500 transition-all text-slate-600"
            />
            <Search size={12} className="absolute left-2.5 top-2 text-slate-400" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar py-2">
           {docData.map(item => renderSidebarItem(item))}
        </div>

        <div className="p-3 border-t border-slate-100 text-xs text-slate-400 flex justify-between items-center flex-shrink-0 bg-white">
          <span>v2.4.0</span>
          <button onClick={() => onNavigate && onNavigate('home')} className="hover:text-orange-600 flex items-center gap-1">
             <Home size={10} /> 首页
          </button>
        </div>
      </aside>

      {/* 右侧主内容区 */}
      <main 
        id="right-content-window" 
        className="flex-1 bg-white/50 relative overflow-y-auto scroll-smooth"
      >
        <div className="md:hidden sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-slate-200 px-4 h-12 flex items-center">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="mr-3 text-slate-600">
                <Menu size={20} />
            </button>
            <span className="font-bold text-slate-700">{activeDocId ? '文章详情' : '目录大纲'}</span>
        </div>

        {/* 核心判断逻辑 */}
        {activeDocId ? (
            // --- 修改这里 ---
            <div className="min-h-full bg-white">
                <Article 
                  // 1. 传递返回回调
                  onBack={() => setActiveDocId(null)} 
                  // 2. 标记为嵌入模式，Article 内部会调整 padding
                  isEmbedded={true} 
                  // 3. 告诉 Article 滚动的容器是谁，以便监听滚动事件显示"回到顶部"按钮
                  scrollContainerId="right-content-window"
                />
            </div>
        ) : (
            renderHomeContent()
        )}

      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #e2e8f0; border-radius: 20px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background-color: #cbd5e1; }
      `}</style>
    </div>
  );
}