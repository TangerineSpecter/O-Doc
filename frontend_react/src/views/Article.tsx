import React, {ReactNode, useEffect, useMemo, useState} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import 'katex/dist/katex.min.css';
import {Download, Paperclip} from 'lucide-react';
import {useNavigate} from 'react-router-dom';
import {useToast} from '../components/common/ToastProvider';
import {useArticle} from '../hooks/useArticle';
import {ArticleIcons, CodeBlock, CUSTOM_STYLES, MermaidChart} from '../components/Article/MarkdownElements';
import {SyncStatusType, TableOfContents} from '../components/Article/TableOfContents';
import {formatFileSize} from '@/utils/format';
import {useReadStats} from '../hooks/useReadStats';
import {syncArticleToRag} from '../api/rag';

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

type QuoteVariant = 'default' | 'danger' | 'warning' | 'info';

const QUOTE_VARIANT_STYLES: Record<QuoteVariant, {
    container: string;
    mark: string;
}> = {
    default: {
        container: 'border-violet-500 bg-gradient-to-r from-violet-50 to-transparent text-violet-800',
        mark: 'text-violet-500/10',
    },
    danger: {
        container: 'border-red-500 bg-gradient-to-r from-red-50 to-transparent text-red-800',
        mark: 'text-red-500/10',
    },
    warning: {
        container: 'border-amber-400 bg-gradient-to-r from-amber-50 to-transparent text-amber-800',
        mark: 'text-amber-500/10',
    },
    info: {
        container: 'border-slate-400 bg-gradient-to-r from-slate-50 to-transparent text-slate-700',
        mark: 'text-slate-500/10',
    },
};

const QUOTE_MARKER_VARIANTS: Record<string, QuoteVariant> = {
    d: 'danger',
    w: 'warning',
    i: 'info',
};

const remarkQuoteVariants = () => {
    const visit = (node: any) => {
        if (node.type === 'blockquote') {
            const firstText = node.children?.[0]?.children?.[0];
            if (firstText?.type === 'text') {
                const match = firstText.value.match(/^([dwi])(?:[ \t]+|(?=\n|$))(.*)$/s);
                if (match) {
                    firstText.value = match[2];
                    node.data = {
                        ...node.data,
                        hProperties: {
                            ...node.data?.hProperties,
                            'data-quote-variant': QUOTE_MARKER_VARIANTS[match[1]],
                        },
                    };
                }
            }
        }

        node.children?.forEach(visit);
    };

    return (tree: any) => visit(tree);
};

const getQuoteVariant = (props: any): QuoteVariant => {
    const variant = props?.['data-quote-variant']
        || props?.node?.properties?.['data-quote-variant']
        || props?.node?.properties?.dataQuoteVariant;
    return variant && variant in QUOTE_VARIANT_STYLES ? variant : 'default';
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
    disableLinks?: boolean;
    updatedAt?: string;
    lastRagSyncedAt?: string;
    isRagSynced?: boolean;
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
                                    disableLinks = false,
                                    lastRagSyncedAt,
                                    isRagSynced
                                }: ArticleProps) {
    const navigate = useNavigate();

    // 1. 准备数据
    const displayTitle = title || "";
    const displayCategory = category || "未分类";
    const displayDate = date || "";
    const displayTags = tags || [];
    const displayMarkdown = content || "";

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

    // 1. 本地状态管理同步时间，以便同步成功后即时刷新 UI，无需重新请求接口
    const [localSyncedTime, setLocalSyncedTime] = useState<string | undefined>(lastRagSyncedAt);
    const [localIsSynced, setLocalIsSynced] = useState<boolean>(!!isRagSynced);

    // 监听 props 变化，同步更新本地状态 (响应父组件的数据刷新)
    useEffect(() => {
        setLocalSyncedTime(lastRagSyncedAt);
        setLocalIsSynced(!!isRagSynced);
    }, [lastRagSyncedAt, isRagSynced]);

    const toast = useToast();
    const [isSyncing, setIsSyncing] = React.useState(false);

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
        if (!articleId || !content) return;

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
            toast.error('同步失败，请检查后端日志');
        } finally {
            setIsSyncing(false);
        }
    };

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

            if (!inline && match) {
                return <CodeBlock language={lang} code={codeStr} {...rest} />;
            }
            return (
                <code
                    className="bg-pink-50 text-pink-600 border border-pink-200 px-1.5 py-0.5 rounded-md font-mono text-[0.9em] mx-1 break-words" {...props}>
                    {children}
                </code>
            );
        },
        blockquote: ({children, ...props}: { children: ReactNode; node?: any; [key: string]: any }) => {
            const styles = QUOTE_VARIANT_STYLES[getQuoteVariant(props)];

            return (
                <blockquote
                    className={`not-prose relative my-8 pl-6 pr-10 pt-4 border-l-4 ${styles.container} rounded-r-lg flex items-center min-h-[60px]`}>
                    <div
                        className={`absolute top-0 right-4 text-6xl ${styles.mark} font-serif leading-none select-none`}>”
                    </div>
                    <div className="relative z-10 w-full">{children}</div>
                </blockquote>
            );
        },
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
            className="overflow-x-auto my-8 border border-gray-200 rounded-lg">
            <table className="w-full text-sm text-left my-0">{children}</table>
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

    // 只要传入了 articleId，组件挂载后就会自动开始计时并上报
    useReadStats(articleId);

    // 4. 所有的 Hook 执行完毕后，再进行条件渲染
    if (!content && !title) {
        return <div className="min-h-[60vh]"></div>;
    }

    return (
        <>
            <style>{CUSTOM_STYLES}</style>

            <div
                className={`min-h-screen bg-white transition-colors duration-300 ${isEmbedded ? '!bg-transparent !min-h-full' : ''}`}>

                <main
                    className={`relative z-10 max-w-5xl mx-auto px-4 ${isEmbedded ? 'py-6' : 'py-20'}`}>
                    <div className="bg-white rounded-2xl p-8 sm:p-14 shadow-none ring-1 ring-slate-900/5">

                        {/* Header */}
                        <header className="mb-10 pb-8 border-b border-slate-100">
                            <div className="flex flex-wrap items-center gap-3 mb-6">
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

                                {onBack && !disableLinks && (
                                    <button onClick={onBack}
                                            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                                        <ArticleIcons.ArrowLeft className="w-4 h-4"/>
                                        返回文集
                                    </button>
                                )}
                            </div>

                            <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight mb-6">
                                {displayTitle}
                            </h1>

                            <div className="flex flex-wrap items-center gap-6 text-sm text-slate-500 font-medium">
                                <div className="flex items-center gap-2"><ArticleIcons.FileText
                                    className="w-4 h-4 text-slate-400"/><span>{stats.wordCount} 字</span></div>
                                <div className="flex items-center gap-2"><ArticleIcons.Clock
                                    className="w-4 h-4 text-slate-400"/><span>{stats.readTime} 分钟阅读</span></div>
                                <div className="flex items-center gap-2"><ArticleIcons.Calendar
                                    className="w-4 h-4 text-slate-400"/><span>{displayDate}</span></div>
                            </div>
                        </header>

                        {/* Markdown Render */}
                        <article className="
                            mx-auto
                            prose prose-lg prose-slate
                            max-w-[75ch]
                            prose-img:rounded-xl prose-img:shadow-lg prose-img:my-8
                            prose-p:text-justify prose-p:my-6
                        ">
                            <ReactMarkdown
                                remarkPlugins={[remarkQuoteVariants, remarkGfm, remarkMath]}
                                rehypePlugins={[rehypeKatex, rehypeRaw]}
                                components={components as any}
                            >
                                {contentWithSyntax}
                            </ReactMarkdown>
                        </article>

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
                                               className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                               title="点击下载">
                                                <Download className="w-4 h-4"/>
                                            </a>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                    </div>

                    <TableOfContents
                        headers={headers}
                        activeId={activeHeader}
                        isEmbedded={isEmbedded ?? false}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        onSync={handleSyncToKB}
                        isSyncing={isSyncing}
                        syncStatus={syncStatus}
                        lastSyncedTime={localSyncedTime}
                    />
                </main>

                <button
                    onClick={handleScrollToTop}
                    className={`
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
