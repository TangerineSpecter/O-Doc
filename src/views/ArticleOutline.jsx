import React, { useState, useMemo } from 'react';
import {
  BookOpen,
  ChevronRight,
  Menu,
  Search,
  Home,
  User,
  Clock,
  Zap,
  MoreHorizontal,
  ChevronDown,
  ArrowLeft
} from 'lucide-react';

// --- 模拟数据 (所有节点都是文章) ---
// 结构：id, title, date, children...
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

// 扁平化数据用于查找
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

export default function LittleOrangeDocViewer() {
  const [activeDocId, setActiveDocId] = useState(null); // null = Home
  const [expandedIds, setExpandedIds] = useState(['2', '2-1']); // 侧边栏默认展开项
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // 侧边栏切换展开/折叠
  const toggleExpand = (e, id) => {
    e.stopPropagation(); // 防止触发点击文章
    setExpandedIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  // 选择文章
  const handleSelectDoc = (docId) => {
    setActiveDocId(docId);
    if (window.innerWidth < 768) setIsSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // 获取当前文章对象
  const currentDoc = useMemo(() =>
    allDocs.find(d => d.id === activeDocId),
    [activeDocId]);

  // --- 侧边栏渲染 (Tree) ---
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

  // --- 首页内容渲染 (List Style as per screenshot) ---
  const renderHomeContent = () => {
    // 递归渲染每一行
    const renderRow = (item, level = 0) => {
      // 样式调整：层级越深，左边距越大
      const paddingLeft = level * 32;
      const isTopLevel = level === 0;

      return (
        <React.Fragment key={item.id}>
          <div
            onClick={() => handleSelectDoc(item.id)}
            className="group flex items-baseline hover:bg-orange-50/50 cursor-pointer py-2 transition-colors"
          >
            {/* 1. Title Area */}
            <div style={{ paddingLeft }} className="flex-shrink-0 relative">
              <span className={`
                 ${isTopLevel ? 'text-slate-700 font-medium' : 'text-slate-600'} 
                 group-hover:text-orange-600 transition-colors
               `}>
                {item.title}
              </span>
            </div>

            {/* 2. Dotted Line Spacer */}
            <div className="flex-grow mx-4 border-b border-dotted border-slate-300 relative -top-1 opacity-40 group-hover:opacity-60 group-hover:border-orange-300 transition-all"></div>

            {/* 3. Date Area */}
            <div className="flex-shrink-0 text-slate-400 text-sm font-mono group-hover:text-orange-500 transition-colors">
              {item.date}
            </div>
          </div>

          {/* Render Children Recursively (Flat list visually) */}
          {item.children && item.children.map(child => renderRow(child, level + 1))}
        </React.Fragment>
      );
    };

    return (
      <div className="max-w-4xl mx-auto px-6 py-8 animate-in fade-in duration-500 min-h-[80vh]">

        {/* 新设计的 Header */}
        <div className="mb-10 p-6 bg-gradient-to-br from-white to-orange-50/50 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden">
          {/* 背景装饰 */}
          <div className="absolute top-0 right-0 -mt-4 -mr-4 w-32 h-32 bg-orange-100/50 rounded-full blur-3xl pointer-events-none"></div>

          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6 relative z-10">
            {/* 左侧：Logo 与 标题信息 */}
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-white rounded-xl border border-orange-100 shadow-sm flex items-center justify-center text-orange-500 flex-shrink-0">
                <BookOpen size={24} strokeWidth={2.5} />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-800 tracking-tight mb-1">小橘文档 · 知识库</h1>
                <p className="text-slate-500 text-sm mb-3">记录产品部署、开发指南与最佳实践。</p>

                {/* 统计 Badge */}
                <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600 shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                  共 {allDocs.length} 篇文档
                </div>
              </div>
            </div>

            {/* 右侧：返回首页按钮 */}
            <div>
              <button
                onClick={() => console.log("回到应用主页")} // 实际场景中可是路由跳转
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-600 hover:text-orange-600 border border-slate-200 hover:border-orange-200 rounded-lg text-sm font-medium transition-all shadow-sm active:scale-95"
              >
                <Home size={14} />
                <span>返回首页</span>
              </button>
            </div>
          </div>
        </div>

        {/* 目录列表卡片 */}
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
    <div className="flex h-screen bg-[#F9FAFB] text-slate-800 font-sans overflow-hidden selection:bg-orange-100 selection:text-orange-900">

      {/* Mobile Sidebar Backdrop */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-20 md:hidden animate-in fade-in duration-200"
          onClick={() => setIsSidebarOpen(false)}
        ></div>
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed md:relative z-30 h-full w-72 bg-white flex flex-col border-r border-slate-200 transition-transform duration-300 ease-in-out
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        {/* Sidebar Header */}
        <div
          onClick={() => { setActiveDocId(null); if (window.innerWidth < 768) setIsSidebarOpen(false); }}
          className="h-14 flex items-center px-4 border-b border-slate-100 cursor-pointer hover:bg-slate-50 transition-colors"
        >
          <div className="w-7 h-7 bg-gradient-to-br from-orange-400 to-red-500 rounded-md flex items-center justify-center text-white mr-3 shadow-sm">
            <BookOpen size={14} strokeWidth={3} />
          </div>
          <span className="font-bold text-slate-800">小橘<span className="text-orange-600">文档</span></span>
        </div>

        {/* Search */}
        <div className="p-3">
          <div className="relative">
            <input
              type="text"
              placeholder="搜索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 text-sm py-1.5 pl-8 pr-3 rounded-md focus:outline-none focus:ring-1 focus:ring-orange-500 transition-all text-slate-600 placeholder:text-slate-400"
            />
            <Search size={14} className="absolute left-2.5 top-2 text-slate-400" />
          </div>
        </div>

        {/* Tree Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar py-2">
          {docData.map(item => renderSidebarItem(item))}
        </div>

        {/* Footer Info */}
        <div className="p-3 border-t border-slate-100 text-xs text-slate-400 flex justify-between items-center">
          <span>v2.4.0</span>
          <span className="hover:text-orange-600 cursor-pointer">关于我们</span>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Mobile Header */}
        <header className="md:hidden h-14 bg-white/90 backdrop-blur border-b border-slate-200 flex items-center px-4 justify-between flex-shrink-0 z-10 sticky top-0">
          <button onClick={() => setIsSidebarOpen(true)} className="p-2 -ml-2 text-slate-600">
            <Menu size={20} />
          </button>
          <span className="font-bold text-slate-800">小橘文档</span>
          <div className="w-8"></div>
        </header>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar md:p-6 p-0">
          {activeDocId ? (
            // Document Detail View
            <div className="max-w-4xl mx-auto px-6 py-8 bg-white md:rounded-xl md:shadow-sm md:border md:border-slate-100 min-h-full animate-in slide-in-from-bottom-2 duration-300">
              {/* Breadcrumb */}
              <div className="flex items-center gap-2 text-xs text-slate-500 mb-6">
                <button onClick={() => setActiveDocId(null)} className="hover:text-orange-600 transition-colors flex items-center gap-1">
                  <Home className="w-3 h-3" /> 首页
                </button>
                {currentDoc?.parent && (
                  <>
                    <ChevronRight className="w-3 h-3 text-slate-300" />
                    <span>{currentDoc.parent.title}</span>
                  </>
                )}
              </div>

              <div className="mb-8 border-b border-slate-100 pb-6">
                <h1 className="text-3xl font-bold text-slate-900 mb-4">{currentDoc?.title}</h1>
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {currentDoc?.date}</span>
                  <span className="flex items-center gap-1"><User className="w-3 h-3" /> Admin</span>
                </div>
              </div>

              <div className="prose prose-slate max-w-none">
                <p className="text-slate-600 leading-relaxed">
                  这是关于 <strong>{currentDoc?.title}</strong> 的详细文档内容。
                  在此处，您可以详细描述部署步骤、配置参数或注意事项。
                </p>
                <div className="not-prose bg-orange-50 border-l-4 border-orange-500 p-4 my-6 rounded-r">
                  <h4 className="font-bold text-orange-700 text-sm mb-1">提示</h4>
                  <p className="text-orange-600 text-sm">这是一个示例文档页面。点击左侧目录或面包屑可返回。</p>
                </div>
                <p>
                  Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
                </p>
              </div>
            </div>
          ) : (
            // Home List View (The Requested Layout)
            renderHomeContent()
          )}
        </div>
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: #cbd5e1;
          border-radius: 20px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background-color: #94a3b8;
        }
      `}</style>
    </div>
  );
}