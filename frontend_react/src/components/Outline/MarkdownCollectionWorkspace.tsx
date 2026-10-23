import { ListTree, Menu } from "lucide-react";

import Article from "../../views/Article";
import ConfirmationModal from "../common/ConfirmationModal";

import SaveWebpageModal from "../common/SaveWebpageModal";
import OutlineSidebar from "./OutlineSidebar";
import OutlineContent from "./OutlineContent";

import { getIconComponent } from "../../constants/iconList";
import StarLoader from "../common/StarLoader";

import type { CollectionWorkspaceProps } from '../../types/articleWorkspace';
import { useMarkdownWorkspaceData } from '../../hooks/useMarkdownWorkspaceData';
export default function MarkdownCollectionWorkspace(props: CollectionWorkspaceProps) {
    const {title, anthologyInfo, onNavigate} = props;
    const {isAuthenticated, filteredDocs, flatDocs, loading, expandedIds, searchQuery, setSearchQuery, toggleExpand, activeDocId, isSidebarOpen, setIsSidebarOpen, isMobileTocOpen, setIsMobileTocOpen, hasArticleToc, isDeleteModalOpen, setIsDeleteModalOpen, isWebpageModalOpen, setIsWebpageModalOpen, articleDetail, articleLoading, isCollectionSyncing, handleSelectDoc, handleResetView, handleTocAvailabilityChange, handleCreateDoc, handleOpenWebpageModal, handleSaveWebpage, handleEditArticle, deleteDescription, handleDeleteArticle, confirmDelete, handleSyncCollection} = useMarkdownWorkspaceData(props);
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
    return (
        <div className="article-outline-shell flex h-[calc(100vh-64px)] bg-[#F9FAFB] text-slate-800 font-sans overflow-hidden">
            {isAuthenticated && (
                <ConfirmationModal
                    isOpen={isDeleteModalOpen}
                    onClose={() => setIsDeleteModalOpen(false)}
                    onConfirm={confirmDelete}
                    title="删除文档"
                    description={deleteDescription}
                    confirmText={articleDetail?.contentFormat === 'markdown' ? '移入回收站' : '删除'}
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
                {/* --- 全局平滑加载遮罩层 --- */}
                {/* 覆盖整个阅读窗口与移动端顶栏，加载时整体纯净遮罩，加载完成后顶栏与文章内容整体同步显现 */}
                <div
                    className={`
                        fixed inset-0 z-40 md:absolute md:z-30 flex items-center justify-center md:items-start md:pt-[25vh]
                        bg-white/95 backdrop-blur-[2px]
                        transition-all duration-300 ease-out
                        ${articleLoading ? 'opacity-100 visible' : 'opacity-0 invisible pointer-events-none'}
                    `}
                >
                    <div
                        className={`transition-all duration-300 transform ${articleLoading ? 'translate-y-0 scale-100' : 'translate-y-4 scale-95'}`}>
                        <StarLoader/>
                    </div>
                </div>

                <div
                    className={`md:hidden sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-slate-200 px-3 h-12 flex items-center justify-between transition-opacity duration-200 ${
                        articleLoading ? 'opacity-0 pointer-events-none' : 'opacity-100'
                    }`}
                >
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
                        {/* --- 文章内容 --- */}
                        <div
                            className={`transition-all duration-300 ease-out ${articleLoading ? 'opacity-0' : 'opacity-100'}`}>
                            <Article
                                onBack={handleResetView}
                                isEmbedded={true}
                                scrollContainerId="right-content-window"
                                onEdit={isAuthenticated ? handleEditArticle : undefined}
                                onDelete={isAuthenticated ? handleDeleteArticle : undefined}
                                canManage={isAuthenticated}
                                articleId={activeDocId}
                                content={articleDetail?.content}
                                contentFormat={articleDetail?.contentFormat}
                                collId={articleDetail?.collId}
                                permission={articleDetail?.permission}
                                downloadUrl={articleDetail?.downloadUrl}
                                title={articleDetail?.title}
                                category={articleDetail?.categoryDetail?.name || '未分类'}
                                categoryId={articleDetail?.categoryDetail?.categoryId}
                                themeId={(articleDetail?.categoryDetail as any)?.themeId}
                                tags={articleDetail?.tagDetails?.map(tag => tag.name) || []}
                                date={articleDetail?.updatedAt}
                                author={articleDetail?.author}
                                authorName={articleDetail?.authorName}
                                attachments={articleDetail?.attachments}
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
