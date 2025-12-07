import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  ChevronRight,
  ChevronDown,
  Search,
  Home,
  Menu,
  Plus,
  X
} from 'lucide-react';
import { useNavigate } from 'react-router-dom'; // 1. 引入 useNavigate
import Article from './Article';
import ConfirmationModal from '../components/ConfirmationModal';

// 1. 定义文档数据结构接口
interface DocItem {
  id: string;
  article_id: string;
  title: string;
  date: string;
  type: string;
  children?: DocItem[];
  parent?: DocItem | null;
}

// --- 模拟数据 (保持不变) ---
const docData: DocItem[] = [
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
      // ... (其他数据保持不变，节省空间省略) ...
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
    ]
  }
];

// 辅助函数
const flattenDocs = (data: DocItem[]) => {
  let flat: DocItem[] = [];
  const recurse = (items: DocItem[], parent?: DocItem | null) => {
    items.forEach(item => {
      flat.push({ ...item, parent });
      if (item.children) recurse(item.children, item);
    });
  };
  recurse(data);
  return flat;
};

// 4. Props 接口
interface ArticleOutlineProps {
  onNavigate?: (viewName: string, params?: any) => void;
  collId?: string;
  title?: string;
  articleId?: string;
}

const allDocs = flattenDocs(docData);

// --- 搜索过滤函数 ---
const filterDocs = (docs: DocItem[], searchTerm: string) => {
  if (!searchTerm.trim()) return docs;
  const filtered: DocItem[] = [];
  const search = (doc: DocItem): DocItem | null => {
    const matches = doc.title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchedChildren = [];
    if (doc.children && doc.children.length > 0) {
      for (const child of doc.children) {
        const matchedChild: DocItem | null = search(child);
        if (matchedChild) {
          matchedChildren.push(matchedChild);
        }
      }
    }
    if (matches || matchedChildren.length > 0) {
      return { ...doc, children: matchedChildren };
    }
    return null;
  };
  for (const doc of docs) {
    const matchedDoc = search(doc);
    if (matchedDoc) filtered.push(matchedDoc);
  }
  return filtered;
};

// --- 组件定义 ---
export default function ArticleOutline({ onNavigate, collId, title, articleId }: ArticleOutlineProps) {
  const navigate = useNavigate(); // 2. 获取 navigate 实例
  const [activeDocId, setActiveDocId] = useState<string | undefined>(articleId);
  const [expandedIds, setExpandedIds] = useState(['2', '2-1']);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateDocModalOpen, setIsCreateDocModalOpen] = useState(false);
  const [newDocTitle, setNewDocTitle] = useState("");
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  useEffect(() => {
    if (articleId) {
      setActiveDocId(articleId);
    }
  }, [articleId]);

  const toggleExpand = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setExpandedIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleSelectDoc = (docId: string) => {
    const selectedDoc = allDocs.find(doc => doc.id === docId);
    if (selectedDoc && selectedDoc.article_id) {
      setActiveDocId(selectedDoc.article_id);
      if (window.innerWidth < 768) setIsSidebarOpen(false);
      const mainContainer = document.getElementById('right-content-window');
      if (mainContainer) mainContainer.scrollTo({ top: 0, behavior: 'smooth' });
      if (onNavigate) {
        onNavigate('article', { collId, articleId: selectedDoc.article_id });
      }
    }
  };

  const handleCreateDoc = () => {
    if (!newDocTitle) return;
    alert(`新建文档 "${newDocTitle}" 成功！(此处为演示，需后端API支持)`);
    setIsCreateDocModalOpen(false);
    setNewDocTitle("");
  };

  // --- 3. 新增：处理文章操作的回调 ---
  const handleEditArticle = () => {
    if (!activeDocId) return;
    // 跳转到编辑器页面 (路由需支持)
    navigate(`/editor/${activeDocId}`);
  };

  const handleDeleteArticle = () => {
    if (!activeDocId) return;
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = () => {
    // 实际删除逻辑
    alert('删除成功 (模拟)');
    setActiveDocId(undefined);
    if (onNavigate) onNavigate('article', { collId });
    setIsDeleteModalOpen(false);
}

  // --- 侧边栏 Item 渲染 ---
  const renderSidebarItem = (item: DocItem, level = 0) => {
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
            {item.children?.map(child => renderSidebarItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  // --- 默认显示的大纲页面 (Home Content) ---
  const renderHomeContent = () => {
    const renderRow = (item: DocItem, level = 0) => {
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
        {/* ... (Home Content 保持不变，省略以节省空间) ... */}
        <div className="mb-10 p-6 bg-gradient-to-br from-white to-orange-50/50 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 -mt-4 -mr-4 w-32 h-32 bg-orange-100/50 rounded-full blur-3xl pointer-events-none"></div>
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6 relative z-10">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-white rounded-xl border border-orange-100 shadow-sm flex items-center justify-center text-orange-500 flex-shrink-0">
                <BookOpen size={24} strokeWidth={2.5} />
              </div>
              <div className="md:max-w-xl">
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
      {/* --- Create Doc Modal (保持不变) --- */}
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

      <ConfirmationModal
           isOpen={isDeleteModalOpen}
           onClose={() => setIsDeleteModalOpen(false)}
           onConfirm={confirmDelete}
           title="删除文档"
           description="确定要删除当前文档吗？此操作无法恢复。"
           confirmText="删除"
       />

      {/* 侧边栏 (保持不变) */}
      <aside
        className={`
          w-72 bg-white flex flex-col border-r border-slate-200 flex-shrink-0 h-full
          ${isSidebarOpen ? 'block' : 'hidden md:flex'} 
        `}
      >
        <div
          onClick={() => {
            setActiveDocId(undefined);
            if (onNavigate) onNavigate('article', { collId });
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
          {searchQuery ? (
            <div>{filterDocs(docData, searchQuery).map(item => renderSidebarItem(item))}</div>
          ) : (
            docData.map(item => renderSidebarItem(item))
          )}
        </div>
        <div className="p-3 border-t border-slate-100 text-xs text-slate-400 flex justify-between items-center flex-shrink-0 bg-white"></div>
      </aside>

      {/* 右侧主内容区 */}
      <main
        id="right-content-window"
        className="flex-1 bg-white/50 relative overflow-y-auto overflow-x-hidden scroll-smooth"
      >
        <div className="md:hidden sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-slate-200 px-4 h-12 flex items-center">
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="mr-3 text-slate-600">
            <Menu size={20} />
          </button>
          <span className="font-bold text-slate-700">{activeDocId ? '文章详情' : '目录大纲'}</span>
        </div>

        {activeDocId ? (
          <div className="min-h-full bg-white">
            <Article
              onBack={() => {
                setActiveDocId(undefined);
                if (onNavigate) onNavigate('article', { collId });
              }}
              isEmbedded={true}
              scrollContainerId="right-content-window"
              // 4. 重点：将处理函数传给 Article，这样按钮才会显示！
              onEdit={handleEditArticle}
              onDelete={handleDeleteArticle}
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