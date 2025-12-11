import {useEffect, useState} from 'react';
import {Loader2, Menu} from 'lucide-react';
import {useNavigate} from 'react-router-dom';
import Article from './Article';
import ConfirmationModal from '../components/common/ConfirmationModal';
import OutlineSidebar from '../components/Outline/OutlineSidebar';
import OutlineContent from '../components/Outline/OutlineContent';
import {useArticleTree} from '../hooks/useArticleTree';
import {Article as ArticleType, deleteArticle, getArticleDetail} from '../api/article';
import {useToast} from '../components/common/ToastProvider';
import { getAnthologyDetail, Anthology } from '../api/anthology';
import { getIconComponent } from '../constants/iconList';

interface ArticleOutlineProps {
    onNavigate?: (viewName: string, params?: any) => void;
    collId?: string;
    title?: string;
    articleId?: string;
}

export default function ArticleOutline({onNavigate, collId, title, articleId}: ArticleOutlineProps) {
    const navigate = useNavigate();

    // 1. 使用 Hook 获取数据和状态
    const {
        filteredDocs,
        flatDocs,
        loading,
        expandedIds,
        searchQuery,
        setSearchQuery,
        toggleExpand
    } = useArticleTree(collId);

    // 2. 本地 UI 状态
    const [activeDocId, setActiveDocId] = useState<string | undefined>(articleId);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [articleDetail, setArticleDetail] = useState<ArticleType | null>(null);
    const [articleLoading, setArticleLoading] = useState(false);

    // 新增：文集详情状态
    const [anthologyInfo, setAnthologyInfo] = useState<Anthology | null>(null);

    const toast = useToast();

    // 同步路由参数到状态
    useEffect(() => {
        setActiveDocId(articleId);
    }, [articleId]);

    // 新增：获取文集详情
    useEffect(() => {
        if (collId) {
            getAnthologyDetail(collId).then(data => {
                setAnthologyInfo(data);
            }).catch(error => {
                console.error('获取文集详情失败:', error);
            });
        }
    }, [collId]);

    // 获取文章详情
    useEffect(() => {
        if (!activeDocId) {
            setArticleDetail(null);
            return;
        }

        const fetchArticleDetail = async () => {
            try {
                setArticleLoading(true);
                const detail = await getArticleDetail(activeDocId);
                setArticleDetail(detail);
            } catch (error) {
                console.error('获取文章详情失败:', error);
                setArticleDetail(null);
            } finally {
                setArticleLoading(false);
            }
        };

        fetchArticleDetail();
    }, [activeDocId]);

    // --- Handlers ---
    const handleSelectDoc = (docArticleId: string) => {
        setActiveDocId(docArticleId);
        if (window.innerWidth < 768) setIsSidebarOpen(false);

        // 滚动回顶部
        const mainContainer = document.getElementById('right-content-window');
        if (mainContainer) mainContainer.scrollTo({top: 0, behavior: 'smooth'});

        // 路由跳转
        if (onNavigate) {
            onNavigate('article', {collId, articleId: docArticleId});
        }
    };

    const handleResetView = () => {
        setActiveDocId(undefined);
        if (onNavigate) onNavigate('article', {collId});
    };

    const handleCreateDoc = () => navigate(`/editor?collId=${collId}`);

    const handleEditArticle = () => {
        if (!activeDocId) return;
        navigate(`/editor/${activeDocId}`);
    };

    const handleDeleteArticle = () => {
        if (!activeDocId) return;
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (!activeDocId) return;

        try {
            await deleteArticle(activeDocId);
            toast.success('文章删除成功');
            setActiveDocId(undefined);
            if (onNavigate) onNavigate('article', {collId});
            setIsDeleteModalOpen(false);

            // 刷新文章树
            window.location.reload();
        } catch (error: any) {
            const err = error as Error;
            toast.error(err.message || '删除文章失败');
            setIsDeleteModalOpen(false);
        }
    };

    if (loading && flatDocs.length === 0) {
        return (
            <div className="flex h-screen items-center justify-center bg-[#F9FAFB]">
                <div className="flex flex-col items-center gap-3 text-slate-400">
                    <Loader2 className="w-8 h-8 animate-spin text-orange-500"/>
                    <span className="text-sm">正在加载文档目录...</span>
                </div>
            </div>
        );
    }

    if (articleLoading && activeDocId) {
        return (
            <div className="flex h-screen items-center justify-center bg-[#F9FAFB]">
                <div className="flex flex-col items-center gap-3 text-slate-400">
                    <Loader2 className="w-8 h-8 animate-spin text-orange-500"/>
                    <span className="text-sm">正在加载文章详情...</span>
                </div>
            </div>
        );
    }

    // 优先使用接口获取的文集标题，其次是路由传参的标题
    const displayTitle = anthologyInfo?.title || title || '文档目录';
    // 解析文集图标
    const anthologyIcon = anthologyInfo ? getIconComponent(anthologyInfo.iconId, "w-6 h-6") : null;

    return (
        <div className="flex h-[calc(100vh-64px)] bg-[#F9FAFB] text-slate-800 font-sans overflow-hidden">

            {/* 删除确认框 */}
            <ConfirmationModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={confirmDelete}
                title="删除文档"
                description="确定要删除当前文档吗？此操作无法恢复。"
                confirmText="删除"
                type="danger"
            />

            {/* 左侧侧边栏 */}
            <OutlineSidebar
                className={`${isSidebarOpen ? 'block' : 'hidden md:flex'} w-72`}
                title={displayTitle}
                docs={filteredDocs}
                activeDocId={activeDocId}
                expandedIds={expandedIds}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                onToggleExpand={toggleExpand}
                onSelectDoc={handleSelectDoc}
                onCreateDoc={handleCreateDoc}
                onReset={handleResetView}
            />

            {/* 右侧主内容区 */}
            <main
                id="right-content-window"
                className="flex-1 bg-white/50 relative overflow-y-auto overflow-x-hidden scroll-smooth"
            >
                {/* 移动端菜单切换按钮 */}
                <div
                    className="md:hidden sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-slate-200 px-4 h-12 flex items-center">
                    <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="mr-3 text-slate-600">
                        <Menu size={20}/>
                    </button>
                    <span className="font-bold text-slate-700">{activeDocId ? '文章详情' : '目录大纲'}</span>
                </div>

                {activeDocId ? (
                    <div className="min-h-full bg-white">
                        <Article
                            onBack={handleResetView}
                            isEmbedded={true}
                            scrollContainerId="right-content-window"
                            onEdit={handleEditArticle}
                            onDelete={handleDeleteArticle}
                            content={articleDetail?.content}
                            title={articleDetail?.title}
                            category={articleDetail?.categoryDetail?.name || '未分类'}
                            tags={articleDetail?.tagDetails?.map(tag => tag.name) || []}
                            date={articleDetail?.updatedAt}
                            attachments={articleDetail?.attachments}
                        />
                    </div>
                ) : (
                    <OutlineContent
                        title={displayTitle}
                        description={anthologyInfo?.description}
                        icon={anthologyIcon}
                        docs={filteredDocs}
                        flatCount={flatDocs.length}
                        onSelectDoc={handleSelectDoc}
                        onBackHome={() => onNavigate && onNavigate('home')}
                    />
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