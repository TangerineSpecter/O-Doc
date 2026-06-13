import {useCallback, useEffect, useRef, useState} from 'react';
import {Bot, Clock, ListTree, Menu, Trash2} from 'lucide-react';
import {useNavigate} from 'react-router-dom';
import Article from './Article';
import ConfirmationModal from '../components/common/ConfirmationModal';
import SaveWebpageModal from '../components/common/SaveWebpageModal';
import OutlineSidebar from '../components/Outline/OutlineSidebar';
import OutlineContent from '../components/Outline/OutlineContent';
import {useArticleTree} from '../hooks/useArticleTree';
import {Article as ArticleType, deleteArticle, getArticleDetail, getArticles, saveWebpageAsArticle} from '../api/article';
import {useToast} from '../components/common/ToastProvider';
import {Anthology, getAnthologyDetail} from '../api/anthology';
import {getIconComponent} from '../constants/iconList';
import StarLoader from '../components/common/StarLoader';
import {syncCollectionToRag} from '../api/rag';
import {useAuth} from '../contexts/AuthContext';

// 定义最小 Loading 时间 (毫秒)，防止闪烁
const MIN_LOADING_TIME = 500;

const formatPostTime = (value?: string) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value.replace('T', ' ').slice(0, 16);
    const pad = (num: number) => String(num).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const getPostSummary = (post: ArticleType) => {
    if (post.postSummary?.trim()) return post.postSummary.trim();
    return (post.content || '').replace(/[#*`>~-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140);
};

const AgentAvatar = ({name, avatar}: { name?: string; avatar?: string }) => {
    const value = avatar?.trim();
    const initial = (name || 'A').trim().slice(0, 1).toUpperCase();
    const isImage = value && (/^https?:\/\//.test(value) || value.startsWith('/') || value.startsWith('data:image/') || value.startsWith('blob:'));

    return (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-indigo-100 ring-1 ring-indigo-200">
            {isImage ? (
                <img src={value} alt={name || 'Agent'} className="h-full w-full object-cover" />
            ) : (
                <span className="text-xs font-bold text-indigo-700">{value || initial}</span>
            )}
        </span>
    );
};

interface ArticleOutlineProps {
    onNavigate?: (viewName: string, params?: any) => void;
    collId?: string;
    title?: string;
    articleId?: string;
}

function AgentPostCollectionView({
                                     collId,
                                     anthologyInfo,
                                     onBackHome,
                                     canManage
                                 }: {
    collId?: string;
    anthologyInfo: Anthology | null;
    onBackHome?: () => void;
    canManage: boolean;
}) {
    const [posts, setPosts] = useState<ArticleType[]>([]);
    const [loading, setLoading] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<ArticleType | null>(null);
    const toast = useToast();

    const loadPosts = useCallback(async () => {
        if (!collId) return;
        setLoading(true);
        try {
            const data = await getArticles({collId});
            setPosts([...data].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
        } catch (error) {
            console.error('加载 Agent 帖子失败:', error);
            toast.error('加载 Agent 帖子失败');
        } finally {
            setLoading(false);
        }
    }, [collId, toast]);

    useEffect(() => {
        loadPosts();
    }, [loadPosts]);

    const confirmDeletePost = async () => {
        if (!deleteTarget) return;
        try {
            await deleteArticle(deleteTarget.articleId);
            setPosts(prev => prev.filter(post => post.articleId !== deleteTarget.articleId));
            setDeleteTarget(null);
            toast.success('帖子已删除');
        } catch (error) {
            console.error('删除 Agent 帖子失败:', error);
            toast.error(error instanceof Error ? error.message : '删除帖子失败');
        }
    };

    return (
        <div className="min-h-[calc(100vh-64px)] bg-slate-50">
            {canManage && (
                <ConfirmationModal
                    isOpen={!!deleteTarget}
                    onClose={() => setDeleteTarget(null)}
                    onConfirm={confirmDeletePost}
                    title="删除 Agent 帖子"
                    description="确定要删除这条 Agent 帖子吗？此操作无法恢复。"
                    confirmText="删除"
                    type="danger"
                />
            )}
            <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
                <div className="mb-5 flex flex-col gap-3 rounded-xl border border-indigo-200 bg-white px-4 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                        <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-100 px-2 py-1 text-xs font-bold text-indigo-700">
                            <Bot className="h-3.5 w-3.5" />
                            Agent 文集
                        </div>
                        <h1 className="truncate text-xl font-bold text-slate-900">{anthologyInfo?.title || 'Agent 文集'}</h1>
                        <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">{anthologyInfo?.description || '暂无简介'}</p>
                    </div>
                    <button
                        type="button"
                        onClick={onBackHome}
                        className="inline-flex shrink-0 items-center justify-center rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
                    >
                        返回首页
                    </button>
                </div>

                {loading ? (
                    <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-slate-100 bg-white">
                        <StarLoader />
                        <span className="mt-2 text-xs font-medium text-slate-400">正在加载 Agent 帖子...</span>
                    </div>
                ) : posts.length > 0 ? (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        {posts.map(post => (
                            <article key={post.articleId} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-indigo-300 hover:shadow-md">
                                <div className="mb-3 flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <h2 className="line-clamp-2 text-base font-bold leading-6 text-slate-900">{post.title}</h2>
                                        <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                                            <Clock className="h-3.5 w-3.5" />
                                            <span>{formatPostTime(post.createdAt)}</span>
                                        </div>
                                    </div>
                                    {canManage && (
                                        <button
                                            type="button"
                                            onClick={() => setDeleteTarget(post)}
                                            className="rounded-md p-1.5 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-600"
                                            title="删除帖子"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    )}
                                </div>

                                <p className="mb-4 line-clamp-3 min-h-[4.5rem] text-sm leading-6 text-slate-600">{getPostSummary(post) || '暂无摘要'}</p>

                                <div className="flex items-center gap-2 border-t border-slate-100 pt-3">
                                    <AgentAvatar name={post.agentPostCreatorName} avatar={post.agentPostCreatorAvatar} />
                                    <div className="min-w-0">
                                        <div className="truncate text-sm font-semibold text-slate-700">{post.agentPostCreatorName || 'Agent'}</div>
                                        <div className="truncate text-xs text-slate-400">发帖 Agent</div>
                                    </div>
                                </div>
                            </article>
                        ))}
                    </div>
                ) : (
                    <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-indigo-300 bg-white text-slate-400">
                        <Bot className="h-8 w-8 text-indigo-500" />
                        <p className="mt-3 text-sm">暂无 Agent 帖子</p>
                    </div>
                )}
            </main>
        </div>
    );
}

export default function ArticleOutline({onNavigate, collId, title, articleId}: ArticleOutlineProps) {
    const navigate = useNavigate();
    const {isAuthenticated} = useAuth();

    const {
        filteredDocs,
        flatDocs,
        loading,
        expandedIds,
        searchQuery,
        setSearchQuery,
        toggleExpand,
        refreshTree
    } = useArticleTree(collId);

    const [activeDocId, setActiveDocId] = useState<string | undefined>(articleId);
    const [isSidebarOpen, setIsSidebarOpen] = useState(() => window.innerWidth >= 768);
    const [isMobileTocOpen, setIsMobileTocOpen] = useState(false);
    const [hasArticleToc, setHasArticleToc] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isWebpageModalOpen, setIsWebpageModalOpen] = useState(false); // 新增状态

    const [articleDetail, setArticleDetail] = useState<ArticleType | null>(null);
    const [articleLoading, setArticleLoading] = useState(false);
    const [anthologyInfo, setAnthologyInfo] = useState<Anthology | null>(null);
    const [isCollectionSyncing, setIsCollectionSyncing] = useState(false);

    const toast = useToast();

    // 记录开始 Loading 的时间，用于计算剩余等待时间
    const loadingStartTime = useRef<number>(0);

    useEffect(() => {
        setActiveDocId(articleId);
        setIsMobileTocOpen(false);
        setHasArticleToc(false);
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
        setIsMobileTocOpen(false);
        const mainContainer = document.getElementById('right-content-window');
        if (mainContainer) mainContainer.scrollTo({top: 0, behavior: 'smooth'});
        if (onNavigate) onNavigate('article', {collId, articleId: docArticleId});
    };

    const handleResetView = () => {
        setActiveDocId(undefined);
        setIsMobileTocOpen(false);
        setHasArticleToc(false);
        if (onNavigate) onNavigate('article', {collId});
    };

    const handleTocAvailabilityChange = useCallback((hasToc: boolean) => {
        setHasArticleToc(hasToc);
        if (!hasToc) setIsMobileTocOpen(false);
    }, []);

    //新建文档
    const handleCreateDoc = () => {
        if (!isAuthenticated) return;
        navigate(`/editor?collId=${collId}`);
    };
    //新建 web 内容解析
    const handleOpenWebpageModal = () => {
        if (!isAuthenticated) return;
        setIsWebpageModalOpen(true);
    };

    // 执行保存网页逻辑
    const handleSaveWebpage = async (url: string, needPolishing: boolean) => {
        if (!isAuthenticated || !collId) return;

        try {
            // 1. 调用接口
            const newArticle = await saveWebpageAsArticle({
                url,
                needPolishing,
                collId
            });

            toast.success(needPolishing ? '网页已保存，AI 正在后台润色...' : '网页保存成功！');
            setIsWebpageModalOpen(false);

            // 2. [关键] 刷新左侧目录树，让新文章显示出来（包含 is_polishing 状态）
            await refreshTree();

            // 3. 自动选中新文章
            if (newArticle?.articleId) {
                handleSelectDoc(newArticle.articleId);
            }

        } catch (error: any) {
            console.error(error);
            toast.error(error?.message || '网页解析失败，请稍后重试');
            throw error; // 抛出错误让 Modal 停止 loading
        }
    };

    const handleEditArticle = () => {
        if (!isAuthenticated || !activeDocId) return;
        navigate(`/editor/${activeDocId}`);
    };

    const handleDeleteArticle = () => {
        if (!isAuthenticated || !activeDocId) return;
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (!isAuthenticated || !activeDocId) return;
        try {
            await deleteArticle(activeDocId);
            toast.success('文章删除成功');
            setActiveDocId(undefined);
            if (onNavigate) onNavigate('article', {collId});
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
                <StarLoader/>
                <span className="text-xs text-slate-400 mt-2 font-medium">正在加载知识库...</span>
            </div>
        );
    }

    const displayTitle = anthologyInfo?.title || title || '文档目录';
    const anthologyIcon = anthologyInfo ? getIconComponent(anthologyInfo.iconId, "w-6 h-6") : null;

    if (anthologyInfo?.type === 'agent') {
        return (
            <AgentPostCollectionView
                collId={collId}
                anthologyInfo={anthologyInfo}
                onBackHome={() => onNavigate && onNavigate('home')}
                canManage={isAuthenticated}
            />
        );
    }

    // [新增] 处理文集同步
    const handleSyncCollection = async () => {
        if (!isAuthenticated || !collId || isCollectionSyncing) return;

        if (!confirm('确定要将该文集下的所有文章同步至知识库吗？这可能需要一些时间。')) {
            return;
        }

        try {
            setIsCollectionSyncing(true);
            const result = await syncCollectionToRag(collId);
            const message = (result as { message?: string } | undefined)?.message;
            toast.success(message || '文集同步成功');
        } catch (error) {
            console.error(error);
            toast.error(error instanceof Error ? error.message : '同步失败，请检查模型连通性');
        } finally {
            setIsCollectionSyncing(false);
        }
    };

    return (
        <div className="flex h-[calc(100vh-64px)] bg-[#F9FAFB] text-slate-800 font-sans overflow-hidden">
            {isAuthenticated && (
                <ConfirmationModal
                    isOpen={isDeleteModalOpen}
                    onClose={() => setIsDeleteModalOpen(false)}
                    onConfirm={confirmDelete}
                    title="删除文档"
                    description="确定要删除当前文档吗？此操作无法恢复。"
                    confirmText="删除"
                    type="danger"
                />
            )}

            {/* 新增：保存网页弹窗 */}
            {isAuthenticated && (
                <SaveWebpageModal
                    isOpen={isWebpageModalOpen}
                    onClose={() => setIsWebpageModalOpen(false)}
                    onConfirm={handleSaveWebpage}
                />
            )}

            {isSidebarOpen && (
                <button
                    type="button"
                    className="fixed inset-0 z-40 bg-slate-950/30 backdrop-blur-[1px] md:hidden"
                    onClick={() => setIsSidebarOpen(false)}
                    aria-label="关闭文集目录"
                />
            )}

            <OutlineSidebar
                className={`
                    fixed inset-y-0 left-0 z-50 w-[min(82vw,20rem)] transform shadow-2xl transition-transform duration-300 ease-out
                    md:relative md:inset-auto md:z-auto md:w-72 md:translate-x-0 md:shadow-none
                    ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
                `}
                title={displayTitle}
                docs={filteredDocs}
                activeDocId={activeDocId}
                expandedIds={expandedIds}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                onToggleExpand={toggleExpand}
                onSelectDoc={handleSelectDoc}
                onCreateDoc={handleCreateDoc}
                onSaveWebpage={handleOpenWebpageModal}
                onReset={handleResetView}
                onSyncCollection={handleSyncCollection}
                isCollectionSyncing={isCollectionSyncing}
                canManage={isAuthenticated}
            />

            <main id="right-content-window"
                  className="min-w-0 flex-1 bg-white relative overflow-y-auto overflow-x-hidden scroll-smooth">
                <div
                    className="md:hidden sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-slate-200 px-3 h-12 flex items-center justify-between">
                    <button
                        type="button"
                        onClick={() => setIsSidebarOpen(true)}
                        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100"
                    >
                        <Menu size={18}/>
                        <span>文集目录</span>
                    </button>
                    <span className="min-w-0 truncate px-2 text-sm font-bold text-slate-700">{activeDocId ? '文章详情' : '目录大纲'}</span>
                    {activeDocId && hasArticleToc ? (
                        <button
                            type="button"
                            onClick={() => setIsMobileTocOpen(true)}
                            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-orange-600 transition-colors hover:bg-orange-50"
                        >
                            <ListTree size={18}/>
                            <span>本文目录</span>
                        </button>
                    ) : (
                        <span className="w-[5.5rem]" aria-hidden="true"/>
                    )}
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
                            <div
                                className={`transition-all duration-500 transform ${articleLoading ? 'translate-y-0 scale-100' : 'translate-y-4 scale-95'}`}>
                                <StarLoader/>
                            </div>
                        </div>

                        {/* --- 文章内容 --- */}
                        {/* 内容在加载时轻微变透明和模糊，营造呼吸感 */}
                        <div
                            className={`transition-all duration-500 ease-out ${articleLoading ? 'opacity-30 blur-[1px]' : 'opacity-100 blur-0'}`}>
                            <Article
                                onBack={handleResetView}
                                isEmbedded={true}
                                scrollContainerId="right-content-window"
                                onEdit={isAuthenticated ? handleEditArticle : undefined}
                                onDelete={isAuthenticated ? handleDeleteArticle : undefined}
                                canManage={isAuthenticated}
                                articleId={activeDocId}
                                content={articleDetail?.content}
                                title={articleDetail?.title}
                                category={articleDetail?.categoryDetail?.name || '未分类'}
                                categoryId={articleDetail?.categoryDetail?.categoryId}
                                themeId={(articleDetail?.categoryDetail as any)?.themeId}
                                tags={articleDetail?.tagDetails?.map(tag => tag.name) || []}
                                date={articleDetail?.updatedAt}
                                author={articleDetail?.author}
                                authorName={articleDetail?.authorName}
                                attachments={articleDetail?.attachments}
                                updatedAt={articleDetail?.updatedAt}
                                lastRagSyncedAt={articleDetail?.lastRagSyncedAt}
                                isRagSynced={articleDetail?.isRagSynced}
                                mindMap={articleDetail?.mindMap}
                                tocLayout="inline"
                                mobileTocOpen={isMobileTocOpen}
                                onMobileTocClose={() => setIsMobileTocOpen(false)}
                                onTocAvailabilityChange={handleTocAvailabilityChange}
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
