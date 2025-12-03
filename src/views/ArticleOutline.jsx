import React, { useState, useMemo, useEffect } from 'react';
import {
  BookOpen,
  ChevronRight,
  ChevronDown,
  Search,
  Home,
  Menu,
  Plus, // 新增 Plus 图标
  FileText, // 新增 FileText
  X // 新增 X 关闭图标
} from 'lucide-react';
// 确保 Article.jsx 在同一目录下，如果路径不同请修改这里
import Article from './Article';

// --- 1. 补回丢失的数据定义 (docData) ---
const docData = [
  {
    id: '1',
    article_id: 'simple-run',
    title: '简易运行',
    date: '2025-11-18',
    type: 'doc'
  },
  {
    id: '2',
    article_id: 'deployment-guide',
    title: '部署指南',
    date: '2022-06-24',
    type: 'doc',
    children: [
      {
        id: '2-1',
        article_id: 'docker-deployment',
        title: 'Docker 部署 MrDoc (推荐)',
        date: '2023-02-24',
        type: 'doc',
        children: [
          { id: '2-1-1', article_id: 'docker-image-deployment', title: 'Docker 镜像部署', date: '2025-05-22', type: 'doc' },
          { id: '2-1-2', article_id: 'docker-compose-deployment', title: 'Docker Compose 部署', date: '2025-03-11', type: 'doc' },
          { id: '2-1-3', article_id: 'docker-container-management', title: '管理 Docker 容器', date: '2025-09-06', type: 'doc' },
        ]
      },
      {
        id: '2-2',
        article_id: 'linux-deployment',
        title: 'Linux 部署 MrDoc',
        date: '2022-01-07',
        type: 'doc',
        children: [
          { id: '2-2-1', article_id: 'nginx-uwsgi-deployment', title: '使用 Nginx + uWSGI 部署 MrDoc', date: '2022-07-06', type: 'doc' },
          { id: '2-2-2', article_id: 'one-click-deployment', title: '一键部署脚本 (已停止维护)', date: '2025-11-03', type: 'doc' },
          { id: '2-2-3', article_id: 'baota-panel-deployment', title: '宝塔面板「Python 项目管理器1.9」部署', date: '2024-07-06', type: 'doc' },
          { id: '2-2-4', article_id: 'official-docker-image', title: '官方 Docker 镜像部署', date: '2024-08-20', type: 'doc' },
        ]
      },
      {
        id: '2-3',
        article_id: 'windows-deployment',
        title: 'Windows 部署 MrDoc',
        date: '2023-03-19',
        type: 'doc',
        children: [
          { id: '2-3-1', article_id: 'waitress-deployment', title: '使用 Waitress 部署', date: '2024-01-18', type: 'doc' },
          { id: '2-3-2', article_id: 'windows-deployment-panel', title: 'Windows 部署面板', date: '2022-11-23', type: 'doc' },
        ]
      },
      {
        id: '2-4',
        article_id: 'nas-deployment',
        title: 'NAS 部署',
        date: '2025-07-31',
        type: 'doc',
        children: [
          { id: '2-4-1', article_id: 'geekspace-nas-deployment', title: '极空间 NAS 部署', date: '2025-08-07', type: 'doc' },
        ]
      },
      { id: '2-5', article_id: 'update-upgrade-guide', title: '更新升级说明', date: '2025-09-02', type: 'doc' },
      { id: '2-6', article_id: 'system-dependencies', title: '系统依赖库说明', date: '2024-03-05', type: 'doc' },
      { id: '2-7', article_id: 'native-to-docker', title: '原生部署转 Docker 部署', date: '2025-03-14', type: 'doc' },
    ]
  },
  {
    id: '3',
    article_id: 'configuration-guide',
    title: '配置指南',
    date: '2025-07-31',
    type: 'doc',
    children: [
      { id: '3-1', article_id: 'configuration-file', title: '配置文件说明', date: '2022-01-15', type: 'doc' },
      { id: '3-2', article_id: 'custom-database-config', title: '自定义数据库配置', date: '2025-11-24', type: 'doc' },
      { id: '3-3', article_id: 'pdf-generation-config', title: '文集生成 PDF 文件的配置', date: '2022-11-23', type: 'doc' },
      { id: '3-4', article_id: 'full-text-search', title: '全文搜索配置', date: '2020-12-06', type: 'doc' },
      { id: '3-5', article_id: 'docker-mysql-config', title: 'Docker 下使用 MySQL 数据库', date: '2023-05-13', type: 'doc' },
      { id: '3-6', article_id: 'mysql-emoji-support', title: 'MySQL 数据库支持 emoji 的配置', date: '2025-03-14', type: 'doc' },
      { id: '3-7', article_id: 'nginx-static-files', title: '使用 Nginx 托管静态文件资源', date: '2023-04-23', type: 'doc' },
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

// --- 搜索过滤函数 ---
const filterDocs = (docs, searchTerm) => {
  if (!searchTerm.trim()) return docs;
  
  const filtered = [];
  
  const search = (doc) => {
    // 检查当前文档是否匹配搜索词
    const matches = doc.title.toLowerCase().includes(searchTerm.toLowerCase());
    
    // 递归检查子文档
    const matchedChildren = [];
    if (doc.children && doc.children.length > 0) {
      for (const child of doc.children) {
        const matchedChild = search(child);
        if (matchedChild) {
          matchedChildren.push(matchedChild);
        }
      }
    }
    
    // 如果当前文档匹配或有匹配的子文档，则保留该文档
    if (matches || matchedChildren.length > 0) {
      return {
        ...doc,
        children: matchedChildren
      };
    }
    
    return null;
  };
  
  // 遍历所有根文档
  for (const doc of docs) {
    const matchedDoc = search(doc);
    if (matchedDoc) {
      filtered.push(matchedDoc);
    }
  }
  
  return filtered;
};

// --- 组件定义 ---
export default function ArticleOutline({ onNavigate, collId, title, articleId }) {

  // 状态初始化：直接使用传入的 articleId (article_id)
  const [activeDocId, setActiveDocId] = useState(articleId);

  const [expandedIds, setExpandedIds] = useState(['2', '2-1']);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // --- 新增状态：创建文档模态框 ---
  const [isCreateDocModalOpen, setIsCreateDocModalOpen] = useState(false);
  const [newDocTitle, setNewDocTitle] = useState("");

  // 监听 articleId 变化，直接更新 activeDocId
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
    // 查找对应的文档对象以获取article_id
    const selectedDoc = allDocs.find(doc => doc.id === docId);
    if (selectedDoc && selectedDoc.article_id) {
      setActiveDocId(selectedDoc.article_id);
      if (window.innerWidth < 768) setIsSidebarOpen(false);
      // 切换时让右侧滚动条复位
      const mainContainer = document.getElementById('right-content-window');
      if (mainContainer) mainContainer.scrollTo({ top: 0, behavior: 'smooth' });
      // 更新路由地址
      if (onNavigate) {
        onNavigate('article', { collId, articleId: selectedDoc.article_id });
      }
    }
  };

  // --- 新增函数：处理新建文档 ---
  const handleCreateDoc = () => {
    if (!newDocTitle) return;
    alert(`新建文档 "${newDocTitle}" 成功！(此处为演示，需后端API支持)`);
    setIsCreateDocModalOpen(false);
    setNewDocTitle("");
  };
  // ---------------------------

  // --- 侧边栏 Item 渲染 ---
  const renderSidebarItem = (item, level = 0) => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedIds.includes(item.id);
    const isActive = activeDocId === item.article_id;
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
      {/* --- 新增：创建文档 Modal --- */}
      {isCreateDocModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsCreateDocModalOpen(false)}></div>
          <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-800">新建文档</h3>
              <button onClick={() => setIsCreateDocModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">文档标题</label>
              <input
                type="text"
                value={newDocTitle}
                onChange={(e) => setNewDocTitle(e.target.value)}
                placeholder="请输入文档标题..."
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-sm"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setIsCreateDocModalOpen(false)} className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">取消</button>
              <button onClick={handleCreateDoc} disabled={!newDocTitle} className="px-3 py-1.5 text-sm text-white bg-orange-500 hover:bg-orange-600 rounded-lg disabled:opacity-50">确定创建</button>
            </div>
          </div>
        </div>
      )}

      {/* 侧边栏 */}
      <aside
        className={`
          w-72 bg-white flex flex-col border-r border-slate-200 flex-shrink-0 h-full
          ${isSidebarOpen ? 'block' : 'hidden md:flex'} 
        `}
      >
        <div
          onClick={() => {
            setActiveDocId(null);
            // 更新路由地址到文集首页
            if (onNavigate) {
              onNavigate('article', { collId });
            }
          }}
          className="h-14 flex items-center px-4 border-b border-slate-100 cursor-pointer hover:bg-slate-50 transition-colors flex-shrink-0"
        >
          <BookOpen size={16} className="text-orange-500 mr-2" />
          <span className="font-bold text-slate-700 text-sm truncate">{title || '文档目录'}</span>
        </div>

        <div className="p-3 flex-shrink-0 space-y-2">
          <div className="relative">
            <input
              type="text"
              placeholder="搜索目录..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 text-xs py-1.5 pl-8 pr-8 rounded-md focus:outline-none focus:ring-1 focus:ring-orange-500 transition-all text-slate-600"
            />
            <Search size={12} className="absolute left-2.5 top-2 text-slate-400" />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <button
            onClick={() => setIsCreateDocModalOpen(true)}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-white border border-dashed border-slate-300 rounded-md text-xs text-slate-500 hover:text-orange-600 hover:border-orange-300 hover:bg-orange-50 transition-all"
          >
            <Plus size={12} />
            <span>新建文档</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar py-2">
          {/* 搜索过滤逻辑 */}
          {searchQuery ? (
            // 搜索结果
            <div>
              {filterDocs(docData, searchQuery).map(item => renderSidebarItem(item))}
            </div>
          ) : (
            // 完整目录
            docData.map(item => renderSidebarItem(item))
          )}
        </div>

        <div className="p-3 border-t border-slate-100 text-xs text-slate-400 flex justify-between items-center flex-shrink-0 bg-white">
          {/* 暂无内容 */}
        </div>
      </aside>

      {/* 右侧主内容区 */}
      <main
        id="right-content-window"
        className="flex-1 bg-white/50 relative overflow-y-auto overflow-x-hidden scroll-smooth"      >
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
              onBack={() => {
                setActiveDocId(null);
                // 更新路由地址到文集首页
                if (onNavigate) {
                  onNavigate('article', { collId });
                }
              }}
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