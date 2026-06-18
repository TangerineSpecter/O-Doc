import React, {ReactNode, useEffect, useMemo, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import 'katex/dist/katex.min.css';
import {Bot, BrainCircuit, ChevronLeft, ChevronRight, Download, FileDown, Loader2, MessageCircle, Paperclip, Send, Trash2, X} from 'lucide-react';
import {useNavigate} from 'react-router-dom';
import {useToast} from '../components/common/ToastProvider';
import {useArticle} from '../hooks/useArticle';
import {
    ArticleIcons,
    CodeBlock,
    CUSTOM_STYLES,
    MermaidChart,
    remarkQuoteVariants,
    SimpleChart,
    VariantBlockquote,
} from '../components/Article/MarkdownElements';
import {SyncStatusType, TableOfContents} from '../components/Article/TableOfContents';
import {formatFileSize} from '@/utils/format';
import {useReadStats} from '../hooks/useReadStats';
import {syncArticleToRag} from '../api/rag';
import {generateArticleMindMap} from '../api/article';
import MindMapModal from '../components/Article/MindMapModal';
import type {MindMapNode} from '@/types/api/article';
import {
    addArticleAnnotationComment,
    createArticleAnnotation,
    deleteArticleAnnotation,
    deleteArticleAnnotationComment,
    getArticleAnnotations,
    type ArticleAnnotation,
    type ArticleAnnotationComment
} from '../api/articleAnnotation';
import {rehypeArticleAnnotations} from '../utils/articleAnnotationPlugin';
import {useAuth} from '../contexts/AuthContext';

export interface AttachmentItem {
    id: string;
    name: string;
    size?: number;
    url: string;
    type?: string;
}

// 颜色主题样式映射 (与 TagArticleCard 保持一致)
const CATEGORY_THEME_STYLES: Record<string, string> = {
    blue: 'bg-blue-600 text-white shadow-blue-500/30',
    emerald: 'bg-emerald-600 text-white shadow-emerald-500/30',
    orange: 'bg-orange-600 text-white shadow-orange-500/30',
    pink: 'bg-pink-600 text-white shadow-pink-500/30',
    violet: 'bg-violet-600 text-white shadow-violet-500/30',
    cyan: 'bg-cyan-600 text-white shadow-cyan-500/30',
    sky: 'bg-sky-600 text-white shadow-sky-500/30',
    amber: 'bg-amber-600 text-white shadow-amber-500/30',
    slate: 'bg-slate-600 text-white shadow-slate-500/30',
};

const PRINT_STYLES = `
  @media print {
    @page {
      size: A4;
      margin: 14mm 12mm;
    }

    html,
    body,
    #root {
      background: #ffffff !important;
    }

    body {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    body.article-printing * {
      visibility: hidden !important;
    }

    body.article-printing .article-print-clone,
    body.article-printing .article-print-clone * {
      visibility: visible !important;
    }

    body.article-printing .article-print-clone {
      position: absolute !important;
      inset: 0 auto auto 0 !important;
      width: 100% !important;
      max-width: none !important;
      margin: 0 !important;
      padding: 0 !important;
      border: 0 !important;
      border-radius: 0 !important;
      box-shadow: none !important;
      --tw-ring-shadow: 0 0 #0000 !important;
    }

    .article-print-hidden {
      display: none !important;
    }

    .article-print-clone header,
    .article-print-clone h1,
    .article-print-clone h2,
    .article-print-clone h3,
    .article-print-clone h4,
    .article-print-clone h5,
    .article-print-clone h6,
    .article-print-clone pre,
    .article-print-clone blockquote,
    .article-print-clone table,
    .article-print-clone img,
    .article-print-clone .code-block-wrapper {
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .article-print-clone article {
      max-width: 75ch !important;
    }
  }
`;

const remarkSoftLineBreaks = () => {
    const visit = (node: any) => {
        if (Array.isArray(node.children)) {
            const nextChildren: any[] = [];

            node.children.forEach((child: any) => {
                if (child.type === 'text' && child.value.includes('\n')) {
                    const lines = child.value.split('\n');
                    lines.forEach((line: string, index: number) => {
                        if (line) {
                            nextChildren.push({...child, value: line});
                        }
                        if (index < lines.length - 1) {
                            nextChildren.push({type: 'break'});
                        }
                    });
                    return;
                }

                visit(child);
                nextChildren.push(child);
            });

            node.children = nextChildren;
        }
    };

    return (tree: any) => visit(tree);
};

const normalizeSelectionText = (value: string) => value.replace(/\s+/g, ' ').trim();

const formatAnnotationTime = (value?: string) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value.replace('T', ' ').slice(0, 16);
    }
    const pad = (num: number) => String(num).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const isAnnotationBlockedElement = (node: Node | null, root: HTMLElement | null) => {
    let current = node instanceof Element ? node : node?.parentElement;
    while (current && current !== root) {
        const tag = current.tagName.toLowerCase();
        if (['pre', 'code', 'table', 'img', 'svg', 'iframe', 'video', 'button', 'a'].includes(tag)) {
            return true;
        }
        current = current.parentElement;
    }
    return false;
};

const getCreatorInitial = (name: string) => (name || '小').trim().slice(0, 1).toUpperCase();

const getSelectionPopoverLeft = (x: number, containerWidth: number) => {
    return Math.min(Math.max(168, x), Math.max(168, containerWidth - 168));
};

interface ArticleProps {
    isEmbedded?: boolean;
    scrollContainerId?: string;
    onBack?: () => void;
    content?: string;
    title?: string;
    category?: string;
    categoryId?: string;
    themeId?: string;
    articleId?: string;
    tags?: string[];
    date?: string;
    attachments?: AttachmentItem[];
    onEdit?: () => void;
    onDelete?: () => void;
    canManage?: boolean;
    disableLinks?: boolean;
    updatedAt?: string;
    lastRagSyncedAt?: string;
    isRagSynced?: boolean;
    mindMap?: MindMapNode;
    tocLayout?: 'absolute' | 'inline';
    author?: string;
    authorName?: string;
    mobileTocOpen?: boolean;
    onMobileTocClose?: () => void;
    onTocAvailabilityChange?: (hasToc: boolean) => void;
}

export default function Article({
                                    isEmbedded,
                                    scrollContainerId,
                                    onBack,
                                    content,
                                    title,
                                    category,
                                    categoryId,
                                    themeId,
                                    articleId,
                                    tags,
                                    date,
                                    attachments,
                                    onEdit,
                                    onDelete,
                                    canManage = true,
                                    disableLinks = false,
                                    lastRagSyncedAt,
                                    isRagSynced,
                                    mindMap,
                                    tocLayout = 'absolute',
                                    author,
                                    authorName,
                                    mobileTocOpen = false,
                                    onMobileTocClose,
                                    onTocAvailabilityChange
                                }: ArticleProps) {
    const navigate = useNavigate();
    const {userInfo, isAuthenticated} = useAuth();

    // 1. 准备数据
    const displayTitle = title || "";
    const displayCategory = category || "未分类";
    const displayDate = date || "";
    const displayTags = tags || [];
    const displayMarkdown = content || "";
    const displayAuthor = authorName || author || "";

    // 获取动态样式
    const categoryThemeClass = themeId
        ? CATEGORY_THEME_STYLES[themeId] || CATEGORY_THEME_STYLES['blue']
        : CATEGORY_THEME_STYLES['blue']; // 默认蓝色

    // 2. 核心修复：必须先执行 Hook，不能在 Hook 前面 return！
    // 即使内容为空，也要让 useArticle 正常执行（传入空字符串即可）
    const {
        contentWithSyntax,
        headers,
        activeHeader,
        stats,
        showScrollTop,
        handleScrollToTop
    } = useArticle(displayMarkdown, scrollContainerId);

    useEffect(() => {
        onTocAvailabilityChange?.(headers.length > 0);
    }, [headers.length, onTocAvailabilityChange]);

    // 1. 本地状态管理同步时间，以便同步成功后即时刷新 UI，无需重新请求接口
    const [localSyncedTime, setLocalSyncedTime] = useState<string | undefined>(lastRagSyncedAt);
    const [localIsSynced, setLocalIsSynced] = useState<boolean>(!!isRagSynced);
    const articlePrintRef = useRef<HTMLDivElement>(null);
    const articleContentRef = useRef<HTMLElement>(null);
    const printCloneRef = useRef<HTMLDivElement | null>(null);

    // 监听 props 变化，同步更新本地状态 (响应父组件的数据刷新)
    useEffect(() => {
        setLocalSyncedTime(lastRagSyncedAt);
        setLocalIsSynced(!!isRagSynced);
    }, [lastRagSyncedAt, isRagSynced]);

    const toast = useToast();
    const [isSyncing, setIsSyncing] = React.useState(false);
    const [isExportingPdf, setIsExportingPdf] = useState(false);
    const [isMindMapOpen, setIsMindMapOpen] = useState(false);
    const [isGeneratingMindMap, setIsGeneratingMindMap] = useState(false);
    const [localMindMap, setLocalMindMap] = useState<MindMapNode | undefined>(mindMap);
    const [annotations, setAnnotations] = useState<ArticleAnnotation[]>([]);
    const [annotationLoading, setAnnotationLoading] = useState(false);
    const [selectionAnchor, setSelectionAnchor] = useState<{
        selectedText: string;
        startOffset: number;
        endOffset: number;
        x: number;
        y: number;
    } | null>(null);
    const [newAnnotationComment, setNewAnnotationComment] = useState('');
    const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);
    const [replyDraft, setReplyDraft] = useState('');
    const [isAnnotationDrawerOpen, setIsAnnotationDrawerOpen] = useState(false);
    const [submittingAnnotation, setSubmittingAnnotation] = useState(false);

    useEffect(() => {
        setLocalMindMap(mindMap);
    }, [mindMap, articleId]);

    const loadAnnotations = React.useCallback(async () => {
        if (!articleId) {
            setAnnotations([]);
            return;
        }
        setAnnotationLoading(true);
        try {
            const result = await getArticleAnnotations(articleId);
            setAnnotations(result.annotations || []);
        } catch (error) {
            console.error('加载文章批注失败:', error);
        } finally {
            setAnnotationLoading(false);
        }
    }, [articleId]);

    useEffect(() => {
        loadAnnotations();
    }, [loadAnnotations]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            if (activeAnnotationId) {
                setActiveAnnotationId(null);
                setReplyDraft('');
                return;
            }
            if (isAnnotationDrawerOpen) {
                setIsAnnotationDrawerOpen(false);
                return;
            }
            if (selectionAnchor) {
                setSelectionAnchor(null);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeAnnotationId, isAnnotationDrawerOpen, selectionAnchor]);

    // 2. 计算同步状态逻辑
    const syncStatus: SyncStatusType = useMemo(() => {
        // 1. 如果状态是 true，直接已同步 (绿色)
        if (localIsSynced) {
            return 'synced';
        }

        // 2. 如果状态是 false，但有上次同步时间 -> 说明是“过期/需更新” (橙色)
        if (!localIsSynced && localSyncedTime) {
            return 'outdated';
        }

        // 3. 既没同步过，状态也是 false -> 未同步 (灰色)
        return 'not_synced';
    }, [localIsSynced, localSyncedTime]);

    const handleSyncToKB = async () => {
        if (!canManage || !articleId || !content) return;

        setIsSyncing(true);
        try {
            // 调用我们在 Step 2 创建的 API
            await syncArticleToRag(articleId);
            toast.success('同步知识库成功！');
            // 用当前时间兜底
            setLocalIsSynced(true);
            setLocalSyncedTime(new Date().toISOString());
        } catch (error) {
            console.error(error);
            toast.error(error instanceof Error ? error.message : '同步失败，请检查模型连通性');
        } finally {
            setIsSyncing(false);
        }
    };

    const handleOpenMindMap = async () => {
        if (localMindMap?.children?.length) {
            setIsMindMapOpen(true);
            return;
        }

        if (!articleId || isGeneratingMindMap) return;

        setIsGeneratingMindMap(true);
        try {
            const result = await generateArticleMindMap(articleId);
            setLocalMindMap(result.mindMap);
            setIsMindMapOpen(true);
            toast.success(result.generated ? '思维导图生成完成' : '已打开思维导图');
        } catch (error) {
            console.error(error);
            toast.error(error instanceof Error ? error.message : '生成思维导图失败');
        } finally {
            setIsGeneratingMindMap(false);
        }
    };

    useEffect(() => {
        const handleAfterPrint = () => {
            document.body.classList.remove('article-printing');
            printCloneRef.current?.remove();
            printCloneRef.current = null;
            setIsExportingPdf(false);
        };
        window.addEventListener('afterprint', handleAfterPrint);

        return () => {
            window.removeEventListener('afterprint', handleAfterPrint);
            document.body.classList.remove('article-printing');
            printCloneRef.current?.remove();
            printCloneRef.current = null;
        };
    }, []);

    const handleExportPdf = async () => {
        if (isExportingPdf || !articlePrintRef.current) return;

        setIsExportingPdf(true);
        try {
            await document.fonts?.ready;
            printCloneRef.current?.remove();

            const clone = articlePrintRef.current.cloneNode(true) as HTMLDivElement;
            clone.classList.add('article-print-clone');
            clone.classList.remove('article-print-page');
            document.body.appendChild(clone);
            document.body.classList.add('article-printing');
            printCloneRef.current = clone;

            await new Promise(requestAnimationFrame);
            window.print();
        } catch (error) {
            console.error('Failed to open print dialog:', error);
            toast.error('打开导出窗口失败，请稍后重试');
            document.body.classList.remove('article-printing');
            printCloneRef.current?.remove();
            printCloneRef.current = null;
            setIsExportingPdf(false);
        }
    };

    const annotationPlugin = useMemo(() => rehypeArticleAnnotations(annotations), [annotations]);

    const activeAnnotation = useMemo(
        () => annotations.find(item => item.annotationId === activeAnnotationId) || null,
        [annotations, activeAnnotationId]
    );

    const activeAnnotationGroup = useMemo(() => {
        if (!activeAnnotation) return [];
        return annotations
            .filter(annotation => (
                annotation.located
                && annotation.startOffset < activeAnnotation.endOffset
                && annotation.endOffset > activeAnnotation.startOffset
            ))
            .sort((a, b) => (
                (b.endOffset - b.startOffset) - (a.endOffset - a.startOffset)
                || a.startOffset - b.startOffset
            ));
    }, [activeAnnotation, annotations]);

    const activeAnnotationIndex = activeAnnotationGroup.findIndex(annotation => annotation.annotationId === activeAnnotationId);
    const hasAnnotationSwitch = activeAnnotationGroup.length > 1 && activeAnnotationIndex >= 0;

    const annotationCommentCount = useMemo(
        () => annotations.reduce((total, item) => total + (item.comments?.length || 0), 0),
        [annotations]
    );

    // 3. 配置 Markdown 组件 (Hook: useMemo)
    const components = useMemo(() => ({
        pre: (props: any) => <div className="not-prose">{props.children}</div>,
        p: (props: any) => {
            const {children} = props;
            const childrenArray = React.Children.toArray(children);
            const isMathBlock = childrenArray.length > 0 && childrenArray.every(child => {
                if (React.isValidElement(child)) {
                    const element = child as React.ReactElement<{ className?: string }>;
                    return element.props.className?.includes('katex');
                }
                return false;
            });

            if (isMathBlock) {
                return <div className="flex justify-center w-full my-6 overflow-x-auto">{children}</div>;
            }
            return <p className="mb-4 leading-7 text-justify">{children}</p>;
        },
        code(props: any) {
            const {inline, className, children, ...rest} = props;
            const match = /language-(\w+)/.exec(className || '');
            const lang = match ? match[1] : '';
            const codeStr = String(children).replace(/\n$/, '');

            if (!inline && lang === 'mermaid') {
                return <MermaidChart chart={codeStr}/>;
            }

            if (!inline && lang === 'chart') {
                return <SimpleChart chart={codeStr}/>;
            }

            if (!inline && match) {
                return <CodeBlock language={lang} code={codeStr} {...rest} />;
            }
            return (
                <code
                    className="article-inline-code bg-pink-50 text-pink-600 border border-pink-200 px-1.5 py-0.5 rounded-md font-mono text-[0.9em] mx-1 break-words leading-[1.9]" {...props}>
                    {children}
                </code>
            );
        },
        blockquote: VariantBlockquote,
        input: (props: any) => {
            if (props.type === 'checkbox') return <input type="checkbox" defaultChecked={props.checked}
                                                         className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded cursor-pointer"/>;
            return <input {...props} />;
        },
        h2: ({children}: { children: ReactNode }) => <h2
            id={String(children).toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-')}>{children}</h2>,
        h3: ({children}: { children: ReactNode }) => <h3
            id={String(children).toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-')}>{children}</h3>,
        h4: ({children}: { children: ReactNode }) => <h4
            id={String(children).toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-')}>{children}</h4>,
        table: ({children}: { children: ReactNode }) => <div
            className="not-prose overflow-x-auto my-8 border border-gray-200 rounded-lg">
            <table className="w-full min-w-[36rem] text-sm text-left my-0">{children}</table>
        </div>,
        th: ({children}: { children: ReactNode }) => <th
            className="bg-gray-50 px-4 py-3 font-semibold text-gray-700 border-b border-gray-200">{children}</th>,
        td: ({children}: { children: ReactNode }) => <td
            className="px-4 py-3 border-b border-gray-100 text-gray-600">{children}</td>,
        iframe: (props: any) => (
            <iframe
                {...props}
                className="my-8 aspect-video w-full rounded-xl border border-slate-200 bg-slate-950 shadow-lg"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
            />
        ),
        video: (props: any) => (
            <video
                {...props}
                className="my-8 w-full rounded-xl border border-slate-200 bg-slate-950 shadow-lg"
                controls
            />
        )
    }), []);

    const getSelectionOffsets = () => {
        const root = articleContentRef.current;
        const selection = window.getSelection();
        if (!root || !selection || selection.rangeCount === 0 || selection.isCollapsed) return null;

        const range = selection.getRangeAt(0);
        if (!root.contains(range.commonAncestorContainer)) return null;
        if (isAnnotationBlockedElement(range.startContainer, root) || isAnnotationBlockedElement(range.endContainer, root)) {
            return null;
        }

        const selectedText = normalizeSelectionText(selection.toString());
        if (!selectedText) return null;

        const containerRect = articlePrintRef.current?.getBoundingClientRect();
        if (!containerRect) return null;

        const preRange = document.createRange();
        preRange.selectNodeContents(root);
        preRange.setEnd(range.startContainer, range.startOffset);
        const startOffset = preRange.toString().length;
        const endOffset = startOffset + selection.toString().length;
        const rect = range.getBoundingClientRect();

        return {
            selectedText,
            startOffset,
            endOffset,
            x: rect.left + rect.width / 2 - containerRect.left,
            y: rect.bottom + 12 - containerRect.top,
        };
    };

    const handleArticleMouseUp = () => {
        window.setTimeout(() => {
            const selectionData = getSelectionOffsets();
            if (!selectionData) {
                setSelectionAnchor(null);
                return;
            }
            setSelectionAnchor(selectionData);
            setNewAnnotationComment('');
        }, 0);
    };

    const handleArticleClick = (event: React.MouseEvent<HTMLElement>) => {
        const target = event.target as HTMLElement;
        const mark = target.closest<HTMLElement>('.article-annotation-mark');
        if (!mark) return;
        const ids = (mark.dataset.annotationIds || mark.dataset.annotationId || '').split(',').filter(Boolean);
        const nextId = ids[0];
        if (nextId) {
            setActiveAnnotationId(nextId);
            setReplyDraft('');
            setSelectionAnchor(null);
        }
    };

    const handleCreateAnnotation = async () => {
        if (!articleId || !selectionAnchor || submittingAnnotation) return;
        if (!isAuthenticated) {
            toast.error('请先登录后再评论');
            return;
        }
        if (!newAnnotationComment.trim()) {
            toast.error('评论内容不能为空');
            return;
        }

        setSubmittingAnnotation(true);
        try {
            const result = await createArticleAnnotation({
                articleId,
                selectedText: selectionAnchor.selectedText,
                startOffset: selectionAnchor.startOffset,
                endOffset: selectionAnchor.endOffset,
                comment: newAnnotationComment.trim(),
            });
            setAnnotations(current => [...current, result.annotation].sort((a, b) => a.startOffset - b.startOffset));
            setSelectionAnchor(null);
            setNewAnnotationComment('');
            window.getSelection()?.removeAllRanges();
            toast.success('批注已添加');
        } catch (error) {
            console.error(error);
            toast.error(error instanceof Error ? error.message : '添加批注失败');
        } finally {
            setSubmittingAnnotation(false);
        }
    };

    const handleAddComment = async (annotationId: string) => {
        if (!replyDraft.trim()) {
            toast.error('评论内容不能为空');
            return;
        }
        if (!isAuthenticated) {
            toast.error('请先登录后再评论');
            return;
        }
        try {
            const result = await addArticleAnnotationComment(annotationId, replyDraft.trim());
            setAnnotations(current => current.map(annotation => annotation.annotationId === annotationId
                ? {
                    ...annotation,
                    comments: [...annotation.comments, result.comment],
                    commentCount: annotation.commentCount + 1,
                }
                : annotation
            ));
            setReplyDraft('');
            toast.success('评论已添加');
        } catch (error) {
            console.error(error);
            toast.error(error instanceof Error ? error.message : '添加评论失败');
        }
    };

    const handleDeleteAnnotation = async (annotationId: string) => {
        try {
            await deleteArticleAnnotation(annotationId);
            setAnnotations(current => current.filter(annotation => annotation.annotationId !== annotationId));
            if (activeAnnotationId === annotationId) setActiveAnnotationId(null);
            toast.success('批注已删除');
        } catch (error) {
            console.error(error);
            toast.error(error instanceof Error ? error.message : '删除批注失败');
        }
    };

    const handleDeleteComment = async (annotationId: string, commentId: string) => {
        try {
            await deleteArticleAnnotationComment(commentId);
            setAnnotations(current => current.map(annotation => annotation.annotationId === annotationId
                ? {
                    ...annotation,
                    comments: annotation.comments.filter(comment => comment.commentId !== commentId),
                    commentCount: Math.max(0, annotation.commentCount - 1),
                }
                : annotation
            ));
            toast.success('评论已删除');
        } catch (error) {
            console.error(error);
            toast.error(error instanceof Error ? error.message : '删除评论失败');
        }
    };

    const handleLocateAnnotation = (annotation: ArticleAnnotation) => {
        if (!annotation.located) return;
        const root = articleContentRef.current;
        let mark = root?.querySelector<HTMLElement>(`.article-annotation-mark[data-annotation-id="${annotation.annotationId}"]`);
        if (!mark && root) {
            mark = Array.from(root.querySelectorAll<HTMLElement>('.article-annotation-mark'))
                .find(item => (item.dataset.annotationIds || '').split(',').includes(annotation.annotationId));
        }
        if (mark) {
            mark.scrollIntoView({behavior: 'smooth', block: 'center'});
            setActiveAnnotationId(null);
            setSelectionAnchor(null);
            setReplyDraft('');
        }
    };

    const canDeleteComment = (comment: ArticleAnnotationComment) => (
        canManage || (comment.creatorType === 'user' && comment.creatorId === userInfo?.userid)
    );

    // 只要传入了 articleId，组件挂载后就会自动开始计时并上报
    useReadStats(articleId);

    // 4. 所有的 Hook 执行完毕后，再进行条件渲染
    if (!content && !title) {
        return <div className="min-h-[60vh]"></div>;
    }

    const useInlineToc = tocLayout === 'inline';
    const hasMindMap = !!localMindMap?.children?.length;
    const canShowMindMapButton = !!articleId && (canManage || hasMindMap);
    const tocTopActions = (
        <div className="flex flex-wrap items-center gap-2">
            {!!articleId && (
                <button
                    type="button"
                    onClick={() => setIsAnnotationDrawerOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-violet-100 bg-violet-50 text-violet-700 shadow-sm transition-all duration-200 hover:border-violet-200 hover:bg-violet-100"
                    title="查看文章评论"
                >
                    <MessageCircle className="h-3.5 w-3.5"/>
                    <span>{annotationLoading ? '加载中' : `评论 ${annotationCommentCount}`}</span>
                </button>
            )}

            {canShowMindMapButton && (
                <button
                    type="button"
                    onClick={handleOpenMindMap}
                    disabled={isGeneratingMindMap}
                    className={`
                        inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border shadow-sm transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-70
                        ${hasMindMap
                            ? 'text-orange-600 bg-orange-50 hover:bg-orange-100 border-orange-100 hover:border-orange-200'
                            : 'text-slate-600 bg-white hover:bg-orange-50 border-slate-200 hover:border-orange-200 hover:text-orange-600'}
                    `}
                    title={hasMindMap ? '查看思维导图' : '生成思维导图'}
                >
                    {isGeneratingMindMap ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin"/>
                    ) : (
                        <BrainCircuit className="h-3.5 w-3.5"/>
                    )}
                    <span>{isGeneratingMindMap ? '生成中' : hasMindMap ? '查看导图' : '生成导图'}</span>
                </button>
            )}

            <button
                type="button"
                onClick={handleExportPdf}
                disabled={isExportingPdf}
                className="inline-flex items-center justify-center rounded-md border border-orange-100 bg-orange-50 p-1.5 text-orange-600 shadow-sm transition-all duration-200 hover:border-orange-200 hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-70"
                title={isExportingPdf ? '正在生成 PDF' : '导出 PDF'}
                aria-label={isExportingPdf ? '正在生成 PDF' : '导出 PDF'}
            >
                {isExportingPdf ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin"/>
                ) : (
                    <FileDown className="h-3.5 w-3.5"/>
                )}
            </button>
        </div>
    );
    const portalRoot = typeof document === 'undefined' ? null : document.body;

    return (
        <>
            <style>{CUSTOM_STYLES}</style>
            <style>{PRINT_STYLES}</style>
            <MindMapModal
                isOpen={isMindMapOpen}
                mindMap={localMindMap}
                onClose={() => setIsMindMapOpen(false)}
            />

            <div
                className={`min-h-screen bg-white transition-colors duration-300 ${isEmbedded ? '!bg-transparent !min-h-full' : ''}`}>

                <main
                    className={`relative z-10 mx-auto px-3 sm:px-4 ${useInlineToc ? 'max-w-[82rem]' : 'max-w-5xl'} ${isEmbedded ? 'py-4 sm:py-6' : 'py-10 sm:py-20'}`}>
                    <div className={useInlineToc ? 'grid grid-cols-1 justify-center gap-4 2xl:grid-cols-[minmax(0,64rem)_16rem]' : ''}>
                    <div ref={articlePrintRef} className="article-print-page relative w-full max-w-5xl bg-white rounded-2xl p-5 sm:p-14 shadow-none ring-1 ring-slate-900/5">

                        {/* Header */}
                        <header className="mb-8 border-b border-slate-100 pb-6 sm:mb-10 sm:pb-8">
                            <div className="mb-5 flex flex-col gap-4 sm:mb-6 lg:flex-row lg:items-start lg:justify-between">
                                <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
                                    <button
                                        onClick={() => !disableLinks && navigate(`/categories?catId=${categoryId || displayCategory}`)}
                                        // 修改：使用动态计算的 className 替代硬编码的 blue-600
                                        className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold shadow-sm cursor-pointer hover:opacity-90 transition-all ${categoryThemeClass}`}
                                    >
                                        {displayCategory}
                                    </button>

                                    {displayTags.map(tag => (
                                        <button
                                            key={tag}
                                            onClick={() => !disableLinks && navigate(`/tags?tagId=${tag}`)}
                                            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100 cursor-pointer hover:bg-indigo-100 transition-colors"
                                        >
                                            <ArticleIcons.Tag className="w-3 h-3 mr-1 opacity-50"/>
                                            {tag}
                                        </button>
                                    ))}
                                </div>

                                <div className="article-print-hidden flex flex-wrap items-center gap-2 sm:justify-end">
                                    {onBack && !disableLinks && (
                                        <button onClick={onBack}
                                                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                                            <ArticleIcons.ArrowLeft className="w-4 h-4"/>
                                            返回文集
                                        </button>
                                    )}
                                </div>
                            </div>

                            <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight mb-5 sm:mb-6">
                                {displayTitle}
                            </h1>

                            <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm text-slate-500 font-medium">
                                {displayAuthor && (
                                    <div className="flex items-center gap-2">
                                        <ArticleIcons.User className="w-4 h-4 text-slate-400"/>
                                        <span>{displayAuthor}</span>
                                    </div>
                                )}
                                <div className="flex items-center gap-2"><ArticleIcons.FileText
                                    className="w-4 h-4 text-slate-400"/><span>{stats.wordCount} 字</span></div>
                                <div className="flex items-center gap-2"><ArticleIcons.Clock
                                    className="w-4 h-4 text-slate-400"/><span>{stats.readTime} 分钟阅读</span></div>
                                <div className="flex items-center gap-2"><ArticleIcons.Calendar
                                    className="w-4 h-4 text-slate-400"/><span>{displayDate}</span></div>
                            </div>
                        </header>

                        {/* Markdown Render */}
                        <article
                            ref={articleContentRef}
                            onMouseUp={handleArticleMouseUp}
                            onClick={handleArticleClick}
                            className="
                            mx-auto
                            prose prose-slate sm:prose-lg
                            max-w-[75ch]
                            prose-img:rounded-xl prose-img:shadow-lg prose-img:my-8
                            prose-p:text-left sm:prose-p:text-justify prose-p:my-4 sm:prose-p:my-6
                        ">
                            <ReactMarkdown
                                remarkPlugins={[remarkQuoteVariants, remarkSoftLineBreaks, remarkGfm, remarkMath]}
                                rehypePlugins={[rehypeKatex, rehypeRaw, annotationPlugin]}
                                components={components as any}
                            >
                                {contentWithSyntax}
                            </ReactMarkdown>
                        </article>

                        {selectionAnchor && (
                            <div
                                className="article-print-hidden absolute z-[70] w-[min(20rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-violet-100 bg-white p-3 shadow-2xl ring-1 ring-violet-100/60"
                                style={{
                                    left: getSelectionPopoverLeft(selectionAnchor.x, articlePrintRef.current?.clientWidth || 320),
                                    top: Math.max(16, selectionAnchor.y),
                                }}
                                onMouseDown={(event) => event.stopPropagation()}
                            >
                                <div className="mb-2 line-clamp-2 rounded-lg bg-violet-50 px-3 py-2 text-xs leading-5 text-violet-700">
                                    {selectionAnchor.selectedText}
                                </div>
                                <textarea
                                    value={newAnnotationComment}
                                    onChange={(event) => setNewAnnotationComment(event.target.value)}
                                    placeholder="写下评论..."
                                    className="h-20 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
                                />
                                <div className="mt-2 flex items-center justify-end gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setSelectionAnchor(null)}
                                        className="rounded-md px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100"
                                    >
                                        取消
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleCreateAnnotation}
                                        disabled={submittingAnnotation}
                                        className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {submittingAnnotation ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <Send className="h-3.5 w-3.5"/>}
                                        评论
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Attachments */}
                        {attachments && attachments.length > 0 && (
                            <div className="mt-16 pt-8 border-t border-slate-100">
                                <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                                    <Paperclip className="w-4 h-4 text-slate-500"/>
                                    附件下载 ({attachments.length})
                                </h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {attachments.map(att => (
                                        <div key={att.id}
                                             className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white hover:border-orange-300 hover:shadow-sm transition-all group">
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                <div
                                                    className="w-10 h-10 rounded-lg bg-white border border-slate-100 flex items-center justify-center shrink-0">
                                                    <ArticleIcons.FileText className="w-5 h-5 text-blue-500"/>
                                                </div>
                                                <div className="min-w-0">
                                                    <div
                                                        className="text-sm font-medium text-slate-700 truncate group-hover:text-orange-600 transition-colors">{att.name}</div>
                                                    <div className="text-xs text-slate-400">
                                                        {formatFileSize(att.size)}
                                                    </div>
                                                </div>
                                            </div>
                                            <a href={att.url} download={att.name}
                                               className="article-print-hidden p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                               title="点击下载">
                                                <Download className="w-4 h-4"/>
                                            </a>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                    </div>

                    <div className="article-print-hidden">
                        <TableOfContents
                            headers={headers}
                            activeId={activeHeader}
                            isEmbedded={isEmbedded ?? false}
                            onEdit={onEdit}
                            onDelete={onDelete}
                            onSync={canManage ? handleSyncToKB : undefined}
                            isSyncing={isSyncing}
                            syncStatus={syncStatus}
                            lastSyncedTime={localSyncedTime}
                            layout={tocLayout}
                            topActions={tocTopActions}
                        />
                    </div>
                    </div>
                </main>

                {portalRoot && createPortal(
                    <>
                    {activeAnnotation && (
                        <div className="article-print-hidden fixed right-4 top-24 z-[9999] w-[min(24rem,calc(100vw-2rem))] rounded-2xl border border-violet-100 bg-white shadow-2xl ring-1 ring-violet-100/70">
                        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2 text-xs font-semibold text-violet-600">
                                    <span>划线评论</span>
                                    {hasAnnotationSwitch && (
                                        <span className="rounded-full bg-violet-50 px-2 py-0.5 text-violet-500">
                                            {activeAnnotationIndex + 1}/{activeAnnotationGroup.length}
                                        </span>
                                    )}
                                </div>
                                <div className="mt-1 line-clamp-3 text-sm leading-6 text-slate-800">{activeAnnotation.selectedText}</div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                                {hasAnnotationSwitch && (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const nextIndex = (activeAnnotationIndex - 1 + activeAnnotationGroup.length) % activeAnnotationGroup.length;
                                                setActiveAnnotationId(activeAnnotationGroup[nextIndex].annotationId);
                                                setReplyDraft('');
                                            }}
                                            className="rounded-md p-1.5 text-slate-400 hover:bg-violet-50 hover:text-violet-600"
                                            aria-label="上一条批注"
                                        >
                                            <ChevronLeft className="h-4 w-4"/>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const nextIndex = (activeAnnotationIndex + 1) % activeAnnotationGroup.length;
                                                setActiveAnnotationId(activeAnnotationGroup[nextIndex].annotationId);
                                                setReplyDraft('');
                                            }}
                                            className="rounded-md p-1.5 text-slate-400 hover:bg-violet-50 hover:text-violet-600"
                                            aria-label="下一条批注"
                                        >
                                            <ChevronRight className="h-4 w-4"/>
                                        </button>
                                    </>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setActiveAnnotationId(null)}
                                    className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                                    aria-label="关闭评论"
                                >
                                    <X className="h-4 w-4"/>
                                </button>
                            </div>
                        </div>
                        <div className="max-h-72 overflow-y-auto px-4 py-3">
                            {activeAnnotation.comments.map(comment => (
                                <div key={comment.commentId} className="mb-4 last:mb-0">
                                    <div className="flex items-start gap-3">
                                        {comment.creatorAvatar ? (
                                            <img src={comment.creatorAvatar} alt={comment.creatorName}
                                                 className="h-8 w-8 rounded-full object-cover"/>
                                        ) : (
                                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                                                {comment.creatorType === 'agent' ? <Bot className="h-4 w-4"/> : getCreatorInitial(comment.creatorName)}
                                            </div>
                                        )}
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2 text-xs">
                                                <span className="font-semibold text-slate-800">{comment.creatorName}</span>
                                                {comment.creatorType === 'agent' && (
                                                    <span className="rounded-full bg-orange-50 px-1.5 py-0.5 font-medium text-orange-600">Agent</span>
                                                )}
                                                <span className="text-slate-400">{formatAnnotationTime(comment.createdAt)}</span>
                                                {canDeleteComment(comment) && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteComment(activeAnnotation.annotationId, comment.commentId)}
                                                        className="ml-auto rounded p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-500"
                                                        title="删除评论"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5"/>
                                                    </button>
                                                )}
                                            </div>
                                            <div className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{comment.content}</div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="border-t border-slate-100 p-3">
                            <textarea
                                value={replyDraft}
                                onChange={(event) => setReplyDraft(event.target.value)}
                                placeholder="追加评论..."
                                className="h-20 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
                            />
                            <div className="mt-2 flex items-center justify-between">
                                {canManage && (
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteAnnotation(activeAnnotation.annotationId)}
                                        className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-rose-500 hover:bg-rose-50"
                                    >
                                        <Trash2 className="h-3.5 w-3.5"/>
                                        删除批注
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => handleAddComment(activeAnnotation.annotationId)}
                                    className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-violet-700"
                                >
                                    <Send className="h-3.5 w-3.5"/>
                                    发送
                                </button>
                            </div>
                        </div>
                        </div>
                    )}

                    {isAnnotationDrawerOpen && (
                        <div className="article-print-hidden fixed inset-0 z-[9998]">
                        <div className="absolute inset-0 bg-slate-950/30 backdrop-blur-[1px]" onClick={() => setIsAnnotationDrawerOpen(false)}/>
                        <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl">
                            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                                <div>
                                    <div className="text-sm font-bold text-slate-900">文章评论</div>
                                    <div className="mt-1 text-xs text-slate-500">{annotations.length} 处批注，{annotationCommentCount} 条评论</div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setIsAnnotationDrawerOpen(false)}
                                    className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                                    aria-label="关闭文章评论"
                                >
                                    <X className="h-4 w-4"/>
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4">
                                {annotations.length === 0 ? (
                                    <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                                        暂无划线评论
                                    </div>
                                ) : annotations.map(annotation => (
                                    <div key={annotation.annotationId} className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm last:mb-0">
                                        <div className="mb-3 flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="line-clamp-3 text-sm font-semibold leading-6 text-slate-800">{annotation.selectedText}</div>
                                                {!annotation.located && (
                                                    <div className="mt-1 text-xs text-amber-600">{annotation.locationReason || '定位失效'}</div>
                                                )}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleLocateAnnotation(annotation)}
                                                disabled={!annotation.located}
                                                className="shrink-0 rounded-md border border-violet-100 px-2.5 py-1 text-xs font-medium text-violet-600 hover:bg-violet-50 disabled:cursor-not-allowed disabled:border-slate-100 disabled:text-slate-300"
                                            >
                                                定位
                                            </button>
                                        </div>
                                        <div className="space-y-3">
                                            {annotation.comments.map(comment => (
                                                <div key={comment.commentId} className="flex items-start gap-2">
                                                    {comment.creatorAvatar ? (
                                                        <img src={comment.creatorAvatar} alt={comment.creatorName}
                                                             className="h-7 w-7 rounded-full object-cover"/>
                                                    ) : (
                                                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600">
                                                            {comment.creatorType === 'agent' ? <Bot className="h-3.5 w-3.5"/> : getCreatorInitial(comment.creatorName)}
                                                        </div>
                                                    )}
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-2 text-xs">
                                                            <span className="font-semibold text-slate-700">{comment.creatorName}</span>
                                                            {comment.creatorType === 'agent' && <span className="text-orange-600">Agent</span>}
                                                            <span className="text-slate-400">{formatAnnotationTime(comment.createdAt)}</span>
                                                        </div>
                                                        <div className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{comment.content}</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </aside>
                        </div>
                    )}
                    </>,
                    portalRoot
                )}

                {mobileTocOpen && headers.length > 0 && (
                    <div
                        className="article-print-hidden fixed inset-0 z-50 bg-slate-950/30 backdrop-blur-[1px] 2xl:hidden"
                        onClick={onMobileTocClose}
                    >
                        <div
                            className="absolute inset-x-3 top-20 h-[calc(100vh-6rem)] max-h-[36rem] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
                            onClick={(event) => event.stopPropagation()}
                        >
                            <TableOfContents
                                headers={headers}
                                activeId={activeHeader}
                                isEmbedded={isEmbedded ?? false}
                                layout="mobile"
                                onClose={onMobileTocClose}
                            />
                        </div>
                    </div>
                )}

                <button
                    onClick={handleScrollToTop}
                    className={`
                        article-print-hidden
                        fixed bottom-44 right-10 p-3 
                        bg-white shadow-[0_4px_12px_rgba(0,0,0,0.08)] rounded-full border border-slate-100 
                        text-slate-400 hover:text-orange-600 hover:border-orange-200 hover:-translate-y-1 hover:shadow-lg 
                        transition-all duration-500 ease-in-out z-40 group
                        ${showScrollTop ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10 pointer-events-none'}
                    `}
                    title="返回顶部"
                >
                    <ArticleIcons.ArrowUp className="w-5 h-5 group-hover:animate-bounce"/>
                </button>
            </div>
        </>
    );
}
