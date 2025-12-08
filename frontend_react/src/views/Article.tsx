import React, { useMemo, ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import 'katex/dist/katex.min.css';
import { Paperclip, Download } from 'lucide-react';

import { articleDemoData } from "../mock/articleDemoData";
import { useArticle } from '../hooks/useArticle';
import { ArticleIcons, MermaidChart, CodeBlock, CUSTOM_STYLES } from '../components/Article/MarkdownElements';
import { TableOfContents } from '../components/Article/TableOfContents';

// 2. 在这里直接定义 AttachmentItem 接口 (解耦依赖)
export interface AttachmentItem {
    id: string;
    name: string;
    size: string;
    url: string;
    type: string;
}

interface ArticleProps {
    isEmbedded?: boolean;
    scrollContainerId?: string;
    onBack?: () => void;
    content?: string;
    title?: string;
    category?: string;
    tags?: string[];
    date?: string;
    attachments?: AttachmentItem[]; // 使用本地定义的接口
    onEdit?: () => void;
    onDelete?: () => void;
}

const DEFAULT_ARTICLE_DATA = articleDemoData;

export default function Article({
    isEmbedded,
    scrollContainerId,
    onBack,
    content,
    title,
    category,
    tags,
    date,
    attachments,
    onEdit,
    onDelete
}: ArticleProps) {
    // 1. 准备数据
    const displayTitle = title || DEFAULT_ARTICLE_DATA.title;
    const displayCategory = category || DEFAULT_ARTICLE_DATA.category;
    const displayDate = date || DEFAULT_ARTICLE_DATA.date;
    const displayTags = tags && tags.length > 0 ? tags : DEFAULT_ARTICLE_DATA.tags;
    const displayMarkdown = content !== undefined ? content : DEFAULT_ARTICLE_DATA.content;

    // 2. 使用 Hook
    const {
        contentWithSyntax,
        headers,
        activeHeader,
        stats,
        showScrollTop,
        handleScrollToTop
    } = useArticle(displayMarkdown, scrollContainerId);

    // 3. 配置 Markdown 组件映射
    const components = useMemo(() => ({
        pre: (props: any) => <div className="not-prose">{props.children}</div>,
        p: (props: any) => {
            const { children } = props;
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
            const { inline, className, children, ...rest } = props;
            const match = /language-(\w+)/.exec(className || '');
            const lang = match ? match[1] : '';
            const codeStr = String(children).replace(/\n$/, '');

            if (!inline && lang === 'mermaid') {
                return <MermaidChart chart={codeStr} />;
            }

            if (!inline && match) {
                return <CodeBlock language={lang} code={codeStr} {...rest} />;
            }
            return (
                <code className="bg-pink-50 text-pink-600 border border-pink-200 px-1.5 py-0.5 rounded-md font-mono text-[0.9em] mx-1 break-words" {...props}>
                    {children}
                </code>
            );
        },
        blockquote: ({ children }: { children: ReactNode }) => (
            <blockquote className="not-prose relative my-8 pl-6 pr-10 pt-4 border-l-4 border-violet-500 bg-gradient-to-r from-violet-50 to-transparent rounded-r-lg text-violet-800 italic flex items-center min-h-[60px]">
                <div className="absolute top-0 right-4 text-6xl text-violet-500/10 font-serif leading-none select-none">”</div>
                <div className="relative z-10 w-full">{children}</div>
            </blockquote>
        ),
        input: (props: any) => {
            if (props.type === 'checkbox') return <input type="checkbox" defaultChecked={props.checked} className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded cursor-pointer" />;
            return <input {...props} />;
        },
        h2: ({ children }: { children: ReactNode }) => <h2 id={String(children).toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-')}>{children}</h2>,
        h3: ({ children }: { children: ReactNode }) => <h3 id={String(children).toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-')}>{children}</h3>,
        h4: ({ children }: { children: ReactNode }) => <h4 id={String(children).toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-')}>{children}</h4>,
        table: ({ children }: { children: ReactNode }) => <div className="overflow-x-auto my-8 border border-gray-200 rounded-lg"><table className="w-full text-sm text-left my-0">{children}</table></div>,
        th: ({ children }: { children: ReactNode }) => <th className="bg-gray-50 px-4 py-3 font-semibold text-gray-700 border-b border-gray-200">{children}</th>,
        td: ({ children }: { children: ReactNode }) => <td className="px-4 py-3 border-b border-gray-100 text-gray-600">{children}</td>
    }), []);

    return (
        <>
            <style>{CUSTOM_STYLES}</style>

            <div className={`min-h-screen bg-white transition-colors duration-300 ${isEmbedded ? '!bg-transparent !min-h-full' : ''}`}>

                <main className={`relative z-10 max-w-5xl mx-auto xl:mx-0 xl:ml-28 px-4 ${isEmbedded ? 'py-6' : 'py-20'}`}>
                    <div className="bg-white rounded-2xl p-8 sm:p-14 shadow-none ring-1 ring-slate-900/5">

                        {/* Header */}
                        <header className="mb-10 pb-8 border-b border-slate-100">
                            <div className="flex flex-wrap items-center gap-3 mb-6">
                                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-blue-600 text-white shadow-sm shadow-blue-500/30">
                                    {displayCategory}
                                </span>

                                {displayTags.map(tag => (
                                    <span key={tag} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                                        <ArticleIcons.Tag className="w-3 h-3 mr-1 opacity-50" />
                                        {tag}
                                    </span>
                                ))}

                                {onBack && (
                                    <button onClick={onBack} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                                        <ArticleIcons.ArrowLeft className="w-4 h-4" />
                                        返回文集
                                    </button>
                                )}
                            </div>

                            <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight mb-6">
                                {displayTitle}
                            </h1>

                            <div className="flex flex-wrap items-center gap-6 text-sm text-slate-500 font-medium">
                                <div className="flex items-center gap-2"><ArticleIcons.FileText className="w-4 h-4 text-slate-400" /><span>{stats.wordCount} 字</span></div>
                                <div className="flex items-center gap-2"><ArticleIcons.Clock className="w-4 h-4 text-slate-400" /><span>{stats.readTime} 分钟阅读</span></div>
                                <div className="flex items-center gap-2"><ArticleIcons.Calendar className="w-4 h-4 text-slate-400" /><span>{displayDate}</span></div>
                            </div>
                        </header>

                        {/* Markdown Render */}
                        <article className="max-w-none prose prose-slate prose-lg prose-p:[&:has(>.katex:only-child)]:text-center prose-a:text-[#0ea5e9] prose-a:no-underline hover:prose-a:underline">
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm, remarkMath]}
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
                                    <Paperclip className="w-4 h-4 text-slate-500" />
                                    附件下载 ({attachments.length})
                                </h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {attachments.map(att => (
                                        <div key={att.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white hover:border-orange-300 hover:shadow-sm transition-all group">
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                <div className="w-10 h-10 rounded-lg bg-white border border-slate-100 flex items-center justify-center shrink-0">
                                                    <ArticleIcons.FileText className="w-5 h-5 text-blue-500" />
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="text-sm font-medium text-slate-700 truncate group-hover:text-orange-600 transition-colors">{att.name}</div>
                                                    <div className="text-xs text-slate-400">{att.size} · {att.type.toUpperCase()}</div>
                                                </div>
                                            </div>
                                            <a href={att.url} download={att.name} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="点击下载">
                                                <Download className="w-4 h-4" />
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
                    <ArticleIcons.ArrowUp className="w-5 h-5 group-hover:animate-bounce" />
                </button>
            </div>
        </>
    );
}