import { useEffect, useState, useRef } from 'react';
import { Menu } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Article from './Article';
import ConfirmationModal from '../components/common/ConfirmationModal';
import OutlineSidebar from '../components/Outline/OutlineSidebar';
import OutlineContent from '../components/Outline/OutlineContent';
import { useArticleTree } from '../hooks/useArticleTree';
import { Article as ArticleType, deleteArticle, getArticleDetail } from '../api/article';
import { useToast } from '../components/common/ToastProvider';
import { getAnthologyDetail, Anthology } from '../api/anthology';
import { getIconComponent } from '../constants/iconList';
import StarLoader from '../components/common/StarLoader';

// 定义最小 Loading 时间 (毫秒)，防止闪烁
const MIN_LOADING_TIME = 500;

interface ArticleOutlineProps {
    onNavigate?: (viewName: string, params?: any) => void;
    collId?: string;
    title?: string;
    articleId?: string;
}

export default function ArticleOutline({ onNavigate, collId, title, articleId }: ArticleOutlineProps) {
    const navigate = useNavigate();

    const {
        filteredDocs,
        flatDocs,
        loading,
        expandedIds,
        searchQuery,
        setSearchQuery,
        toggleExpand
    } = useArticleTree(collId);

    const [activeDocId, setActiveDocId] = useState<string | undefined>(articleId);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [articleDetail, setArticleDetail] = useState<ArticleType | null>(null);
    const [articleLoading, setArticleLoading] = useState(false);
    const [anthologyInfo, setAnthologyInfo] = useState<Anthology | null>(null);

    const toast = useToast();

    // 记录开始 Loading 的时间，用于计算剩余等待时间
    const loadingStartTime = useRef<number>(0);

    useEffect(() => {
        setActiveDocId(articleId);
    }, [articleId]);

    useEffect(() => {
        if (collId) {
            getAnthologyDetail(collId).then(data => setAnthologyInfo(data)).catch(console.error);
        }
    }, [collId]);

    // --- 核心修改：平滑 Loading 逻辑 ---
    useEffect(() => {
        if (!activeDocId) {
            setArticleDetail(null);
            return;
        }

        const fetchArticleDetail = async () => {
            try {
                // 1. 开始 Loading
                setArticleLoading(true);
                loadingStartTime.current = Date.now();

                // 2. 并行执行：获取数据 + 最小等待时间
                // 无论数据返回多快，至少等待 MIN_LOADING_TIME
                const [detail] = await Promise.all([
                    getArticleDetail(activeDocId),
                    new Promise(resolve => setTimeout(resolve, MIN_LOADING_TIME)) 
                ]);

                // 3. 更新数据
                setArticleDetail(detail);
            } catch (error) {
                console.error('获取文章详情失败:', error);
                setArticleDetail(null);
            } finally {
                // 4. 结束 Loading
                setArticleLoading(false);
            }
        };

        fetchArticleDetail();
    }, [activeDocId]);

    const handleSelectDoc = (docArticleId: string) => {
        setActiveDocId(docArticleId);
        if (window.innerWidth < 768) setIsSidebarOpen(false);
        const mainContainer = document.getElementById('right-content-window');
        if (mainContainer) mainContainer.scrollTo({ top: 0, behavior: 'smooth' });
        if (onNavigate) onNavigate('article', { collId, articleId: docArticleId });
    };

    const handleResetView = () => {
        setActiveDocId(undefined);
        if (onNavigate) onNavigate('article', { collId });
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
            if (onNavigate) onNavigate('article', { collId });
            setIsDeleteModalOpen(false);
            window.location.reload();
        } catch (error: any) {
            const err = error as Error;
            toast.error(err.message || '删除文章失败');
            setIsDeleteModalOpen(false);
        }
    };

    if (loading && flatDocs.length === 0) {
        return (
            <div className="flex h-screen items-center justify-center bg-[#F9FAFB] flex-col">
                <StarLoader />
                <span className="text-xs text-slate-400 mt-2 font-medium">正在加载知识库...</span>
            </div>
        );
    }

    const displayTitle = anthologyInfo?.title || title || '文档目录';
    const anthologyIcon = anthologyInfo ? getIconComponent(anthologyInfo.iconId, "w-6 h-6") : null;

    return (
        <div className="flex h-[calc(100vh-64px)] bg-[#F9FAFB] text-slate-800 font-sans overflow-hidden">
            <ConfirmationModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={confirmDelete}
                title="删除文档"
                description="确定要删除当前文档吗？此操作无法恢复。"
                confirmText="删除"
                type="danger"
            />

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

            <main id="right-content-window" className="flex-1 bg-white relative overflow-y-auto overflow-x-hidden scroll-smooth">
                <div className="md:hidden sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-slate-200 px-4 h-12 flex items-center">
                    <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="mr-3 text-slate-600">
                        <Menu size={20} />
                    </button>
                    <span className="font-bold text-slate-700">{activeDocId ? '文章详情' : '目录大纲'}</span>
                </div>

                {activeDocId ? (
                    <div className="min-h-full bg-white relative">
                        {/* --- 平滑遮罩层 --- */}
                        {/* 使用 opacity 控制显隐，pointer-events-none 确保消失后不挡鼠标 */}
                        <div
                            className={`
                                absolute inset-0 z-50 flex items-start pt-[25vh] justify-center 
                                bg-white/80 backdrop-blur-[2px] 
                                transition-all duration-500 ease-out
                                ${articleLoading ? 'opacity-100 visible' : 'opacity-0 invisible pointer-events-none'}
                            `}
                        >
                            <div className={`transition-all duration-500 transform ${articleLoading ? 'translate-y-0 scale-100' : 'translate-y-4 scale-95'}`}>
                                <StarLoader />
                            </div>
                        </div>

                        {/* --- 文章内容 --- */}
                        {/* 内容在加载时轻微变透明和模糊，营造呼吸感 */}
                        <div className={`transition-all duration-500 ease-out ${articleLoading ? 'opacity-30 blur-[1px]' : 'opacity-100 blur-0'}`}>
                            <Article
                                onBack={handleResetView}
                                isEmbedded={true}
                                scrollContainerId="right-content-window"
                                onEdit={handleEditArticle}
                                onDelete={handleDeleteArticle}
                                content={articleDetail?.content}
                                title={articleDetail?.title}
                                category={articleDetail?.categoryDetail?.name || '未分类'}
                                categoryId={articleDetail?.categoryDetail?.categoryId}
                                tags={articleDetail?.tagDetails?.map(tag => tag.name) || []}
                                date={articleDetail?.updatedAt}
                                attachments={articleDetail?.attachments}
                            />
                        </div>
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