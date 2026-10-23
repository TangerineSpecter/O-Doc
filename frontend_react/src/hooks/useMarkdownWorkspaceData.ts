import { useCallback, useEffect, useState } from "react";

import { useNavigate } from "react-router-dom";
import { useEscapeDismissal } from "./useEscapeDismissal";

import { getHtmlDeletionSummary } from "../api/htmlNote";
import { type WebpageImportOptions, type WebpageImportProgress } from "../components/common/SaveWebpageModal";

import { useArticleTree } from "./useArticleTree";

import { Article as ArticleType, deleteArticle, getArticleDetail, importArticleFiles, saveWebpageAsArticle } from "../api/article";
import { useToast } from "../components/common/ToastProvider";

import { syncCollectionToRag } from "../api/rag";
import { useAuth } from "../contexts/AuthContext";
import type { CollectionWorkspaceProps } from '../types/articleWorkspace';
const MIN_LOADING_TIME = 500;

const formatImportFailures = (failures: Array<{fileName: string; message: string}>) => {
    const displayed = failures.slice(0, 3).map(item => `${item.fileName}：${item.message}`);
    if (failures.length > displayed.length) displayed.push(`另有 ${failures.length - displayed.length} 个文件失败`);
    return displayed.join('；');
};

export function useMarkdownWorkspaceData({collId, articleId, onNavigate}: CollectionWorkspaceProps) {
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
    useEscapeDismissal(isSidebarOpen && window.innerWidth < 768, () => setIsSidebarOpen(false));
    const [isMobileTocOpen, setIsMobileTocOpen] = useState(false);
    const [hasArticleToc, setHasArticleToc] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isWebpageModalOpen, setIsWebpageModalOpen] = useState(false);
    const [articleDetail, setArticleDetail] = useState<ArticleType | null>(null);
    const [articleLoading, setArticleLoading] = useState(false);
    const [isCollectionSyncing, setIsCollectionSyncing] = useState(false);
    const toast = useToast();
    useEffect(() => {
        setActiveDocId(articleId);
        setIsMobileTocOpen(false);
        setHasArticleToc(false);
    }, [articleId]);
    useEffect(() => {
        let active = true;
        if (!activeDocId) {
            setArticleDetail(null);
            setArticleLoading(false);
            return;
        }

        const fetchArticleDetail = async () => {
            try {
                // 1. 开始 Loading
                setArticleLoading(true);

                // 2. 并行执行：获取数据 + 最小等待时间
                // 无论数据返回多快，至少等待 MIN_LOADING_TIME
                const [detail] = await Promise.all([
                    getArticleDetail(activeDocId),
                    new Promise(resolve => setTimeout(resolve, MIN_LOADING_TIME))
                ]);
                if (!active) return;

                // 3. 更新数据并预判文章是否有目录标题（## ~ ######），消除加载完成后本文目录按钮突兀跳出的问题
                const hasToc = Boolean(
                    detail?.content && /(?:^|\n)#{2,6}\s+\S+/m.test(detail.content)
                );
                setHasArticleToc(hasToc);
                setArticleDetail(detail);
            } catch (error) {
                if (!active) return;
                console.error('获取文章详情失败:', error);
                setArticleDetail(null);
                setHasArticleToc(false);
            } finally {
                // 4. 结束 Loading
                if (active) setArticleLoading(false);
            }
        };

        fetchArticleDetail();
        return () => {active = false;};
    }, [activeDocId]);
    const handleSelectDoc = (docArticleId: string) => {
        setActiveDocId(docArticleId);
        if (window.innerWidth < 768) setIsSidebarOpen(false);
        setIsMobileTocOpen(false);
        const mainContainer = document.getElementById('right-content-window');
        if (mainContainer) mainContainer.scrollTop = 0;
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
    const handleCreateDoc = () => {
        if (!isAuthenticated) return;
        navigate(`/editor?collId=${collId}`);
    };
    const handleOpenWebpageModal = () => {
        if (!isAuthenticated) return;
        setIsWebpageModalOpen(true);
    };
    const handleSaveWebpage = async (
        options: WebpageImportOptions,
        onProgress: (progress: WebpageImportProgress) => void,
    ) => {
        if (!isAuthenticated || !collId) return;

        try {
            const {useAiExtraction, needPolishing} = options;
            if (options.sourceType === 'url') {
                const newArticle = await saveWebpageAsArticle({
                    url: options.url,
                    useAiExtraction,
                    needPolishing,
                    collId,
                });
                const warnings = newArticle.importReport?.warnings || [];
                if (warnings.length) {
                    const polishingHint = needPolishing ? '，AI 正在后台润色' : '';
                    toast.warning(`文章已导入${polishingHint}：${warnings.join('；')}`);
                } else {
                    toast.success(needPolishing ? '文章已导入，AI 正在后台润色...' : '文章导入成功！');
                }
                setIsWebpageModalOpen(false);
                await refreshTree();
                if (newArticle.articleId) handleSelectDoc(newArticle.articleId);
                return;
            }

            const batchResult = await importArticleFiles({
                    files: options.files,
                    importMode: options.importMode,
                    useAiExtraction,
                    needPolishing,
                    collId,
                    onProgress,
                });
            const successCount = batchResult.successful.length;
            if (!successCount) {
                throw new Error(`批量导入失败：${formatImportFailures(batchResult.failures)}`);
            }

            const warningCount = batchResult.successful.reduce(
                (count, article) => count + (article.importReport?.warnings.length || 0),
                0,
            );
            const polishingHint = needPolishing ? '，AI 正在后台润色' : '';
            if (batchResult.failures.length) {
                toast.warning(
                    `已导入 ${successCount} 篇${polishingHint}；${batchResult.failures.length} 个文件失败：${formatImportFailures(batchResult.failures)}`,
                );
            } else if (warningCount) {
                toast.warning(`已导入 ${successCount} 篇${polishingHint}，其中 ${warningCount} 项需要核对`);
            } else {
                toast.success(`成功导入 ${successCount} 篇文章${polishingHint}`);
            }
            setIsWebpageModalOpen(false);
            await refreshTree();
            const lastArticle = batchResult.successful[batchResult.successful.length - 1];
            if (lastArticle?.articleId) handleSelectDoc(lastArticle.articleId);
        } catch (error: unknown) {
            console.error(error);
            toast.error(error instanceof Error ? error.message : '文章解析失败，请稍后重试');
            throw error; // 抛出错误让 Modal 停止 loading
        }
    };
    const handleEditArticle = () => {
        if (!isAuthenticated || !activeDocId) return;
        navigate(`/editor/${activeDocId}`);
    };
    const [deleteDescription, setDeleteDescription] = useState('删除后将移入回收站，可从回收站恢复。');
    const handleDeleteArticle = async () => {
        if (!isAuthenticated || !activeDocId) return;
        if (articleDetail?.contentFormat === 'html') {
            try {
                const summary = await getHtmlDeletionSummary(activeDocId);
                setDeleteDescription(`此操作不可恢复，将清理 ${summary.exclusiveCount} 个专属资源，保留 ${summary.sharedCount} 个共享或已有资源。`);
            } catch (reason) {toast.error(reason instanceof Error ? reason.message : '无法读取资源清理信息'); return;}
        } else if (articleDetail?.contentFormat === 'markdown') {
            setDeleteDescription('删除后将移入回收站，可从回收站恢复。');
        } else {
            setDeleteDescription('确定要删除当前文档吗？此操作无法恢复。');
        }
        setIsDeleteModalOpen(true);
    };
    const confirmDelete = async () => {
        if (!isAuthenticated || !activeDocId) return;
        try {
            await deleteArticle(activeDocId);
            toast.success(articleDetail?.contentFormat === 'html' ? 'HTML 笔记删除成功' : '文章已移入回收站');
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
    return {isAuthenticated, filteredDocs, flatDocs, loading, expandedIds, searchQuery, setSearchQuery, toggleExpand, activeDocId, isSidebarOpen, setIsSidebarOpen, isMobileTocOpen, setIsMobileTocOpen, hasArticleToc, isDeleteModalOpen, setIsDeleteModalOpen, isWebpageModalOpen, setIsWebpageModalOpen, articleDetail, articleLoading, isCollectionSyncing, handleSelectDoc, handleResetView, handleTocAvailabilityChange, handleCreateDoc, handleOpenWebpageModal, handleSaveWebpage, handleEditArticle, deleteDescription, handleDeleteArticle, confirmDelete, handleSyncCollection};
}
