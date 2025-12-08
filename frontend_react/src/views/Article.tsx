import React, { useState, useEffect, useMemo, ReactNode } from 'react';
import { articleDemoData } from "../mock/articleDemoData";

// --- 依赖库 ---
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
// Mac 终端风格高亮
import { tomorrow as darkTheme } from 'react-syntax-highlighter/dist/esm/styles/prism';
import mermaid from 'mermaid';
import 'katex/dist/katex.min.css';
import { Edit3, Trash2, Paperclip, Download, FileText } from 'lucide-react';
import { AttachmentItem } from './EditorPage'; // 引入类型

// 定义 Article 组件接收的参数类型
interface ArticleProps {
    isEmbedded?: boolean;        // 可选，布尔值
    scrollContainerId?: string;  // 可选，字符串
    onBack?: () => void;         // 可选，函数
    content?: string;            // 可选，字符串
    // 如果你后面要把 title, tags 等传进来，也加在这里
    title?: string;
    category?: string;
    tags?: string[];
    date?: string;
    // 附件
    attachments?: AttachmentItem[];
    // 操作回调
    onEdit?: () => void;
    onDelete?: () => void;
}

interface HeaderItem {
    text: string;
    level: number;
    slug: string;
}


// --- 强制样式 ---
const CUSTOM_STYLES = `
  /* 1. 隐藏行内代码的反引号 */
  .prose :where(code):not(:where([class~="not-prose"] *))::before { content: none !important; }
  .prose :where(code):not(:where([class~="not-prose"] *))::after { content: none !important; }

  /* 2. 确保公式过长时可以内部滚动，而不是撑开页面 */
  .katex-display { overflow-x: auto; overflow-y: hidden; max-width: 100%; }

  /* 3. 自定义高亮特效 */
  .custom-underline-red { text-decoration: underline; text-decoration-color: #FF5582A6; text-decoration-thickness: 7px; text-underline-offset: -3px; }
  .custom-underline-wavy { text-decoration: underline; text-decoration-style: wavy; text-decoration-color: #0ea5e9; text-decoration-thickness: 2px; text-underline-offset: 4px; }
  .custom-watercolor { background: linear-gradient(120deg, #fef08a 0%, #fde047 100%); padding: 0.1em 0.3em; border-radius: 0.2em; color: #854d0e; }

  /* 4. 内联标签 */
  .md-tag-inline {
    display: inline-flex; align-items: center; padding: 0 0.4em; margin: 0 0.2em;
    border-radius: 0.25rem; font-size: 0.85em; font-weight: 500;
    color: #4f46e5; background-color: #eef2ff; border: 1px solid #e0e7ff;
  }
`;

// --- Icons ---
const Icons = {
    Tag: (props: React.SVGProps<SVGSVGElement>) => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" /><path d="M7 7h.01" /></svg>,
    Clock: (props: React.SVGProps<SVGSVGElement>) => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
    Calendar: (props: React.SVGProps<SVGSVGElement>) => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>,
    FileText: (props: React.SVGProps<SVGSVGElement>) => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><line x1="10" y1="9" x2="8" y2="9" /></svg>,
    ArrowUp: (props: React.SVGProps<SVGSVGElement>) => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="m18 15-6-6-6 6" /></svg>,
    Copy: (props: React.SVGProps<SVGSVGElement>) => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>,
    Check: (props: React.SVGProps<SVGSVGElement>) => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-400" {...props}><polyline points="20 6 9 17 4 12" /></svg>,
    ArrowLeft: (props: React.SVGProps<SVGSVGElement>) => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg>
};

// --- Copy Button ---
const CopyButton = ({ text }: { text: string }) => {
    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return (
        <button onClick={handleCopy} className="text-slate-400 hover:text-white transition-colors p-1" title="Copy code">
            {copied ? <Icons.Check /> : <Icons.Copy />}
        </button>
    );
};

// --- Mermaid Component ---
const MermaidChart = ({ chart }: { chart: string }) => {
    const [svg, setSvg] = useState('');

    useEffect(() => {
        mermaid.initialize({
            startOnLoad: false,
            theme: 'neutral',
            securityLevel: 'loose',
            fontFamily: 'Inter, sans-serif'
        });

        const render = async () => {
            try {
                const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
                const { svg } = await mermaid.render(id, chart);
                setSvg(svg);
            } catch (error) {
                setSvg('<div class="text-red-500 text-sm p-4 bg-red-50 rounded">Mermaid Render Error</div>');
            }
        };
        render();
    }, [chart]);

    return (
        <div className="my-8 w-full bg-white border border-slate-200 rounded-xl shadow-sm p-6 overflow-x-auto flex justify-center">
            <div dangerouslySetInnerHTML={{ __html: svg }} />
        </div>
    );
};

// --- TOC (Modified) ---
const TableOfContents = ({
    headers,
    activeId,
    isEmbedded,
    onEdit,
    onDelete
}: {
    headers: HeaderItem[],
    activeId: string,
    isEmbedded: boolean,
    onEdit?: () => void,
    onDelete?: () => void
}) => {
    if (!headers?.length) return null;

    const visibilityClass = isEmbedded ? 'hidden 2xl:block' : 'hidden xl:block';

    return (
        <div className={`${visibilityClass} absolute left-full top-0 ml-4 h-full w-64`}>
            <div className="sticky top-6">

                {(onEdit || onDelete) && (
                    <div className="flex items-center gap-2 mb-4">
                        {onEdit && (
                            <button
                                onClick={onEdit}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-md text-xs font-medium text-slate-600 shadow-sm hover:text-orange-600 hover:border-orange-200 hover:bg-orange-50 hover:shadow transition-all duration-200"
                            >
                                <Edit3 className="w-3.5 h-3.5" />
                                <span>编辑文档</span>
                            </button>
                        )}
                        {onDelete && (
                            <button
                                onClick={onDelete}
                                className="flex items-center justify-center p-1.5 bg-white border border-slate-200 rounded-md text-slate-400 shadow-sm hover:text-red-600 hover:border-red-200 hover:bg-red-50 hover:shadow transition-all duration-200"
                                title="删除文档"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                )}

                <h5 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span> 目录
                </h5>
                <ul className="space-y-1 relative border-l border-slate-200">
                    {headers.map((h, i) => (
                        <li key={i}>
                            <a href={`#${h.slug}`} className={`block text-sm py-1.5 border-l-2 transition-all truncate ${h.level > 2 ? 'pl-6 text-xs' : 'pl-4'} ${activeId === h.slug ? 'border-[#0ea5e9] text-[#0ea5e9] font-medium bg-sky-50/30' : 'border-transparent text-slate-500 hover:text-slate-900'}`}>
                                {h.text}
                            </a>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};

// --- Data (JSON 格式) ---
// 导入外部 JSON 演示数据
const DEFAULT_ARTICLE_DATA = articleDemoData;

// content: 外部传入的 markdown 内容
export default function Article({
    isEmbedded,
    scrollContainerId,
    onBack,
    content,
    title,
    category,
    tags,
    date,
    attachments, // 新增：接收附件 Prop
    onEdit,
    onDelete
}: ArticleProps) {
    const displayTitle = title || DEFAULT_ARTICLE_DATA.title;
    const displayCategory = category || DEFAULT_ARTICLE_DATA.category;
    const displayDate = date || DEFAULT_ARTICLE_DATA.date;
    const displayTags = tags && tags.length > 0 ? tags : DEFAULT_ARTICLE_DATA.tags;
    const displayMarkdown = content !== undefined ? content : DEFAULT_ARTICLE_DATA.content;

    const [headers, setHeaders] = useState<HeaderItem[]>([]);
    const [activeHeader, setActiveHeader] = useState("");
    const [stats, setStats] = useState({ wordCount: 0, readTime: 0 });
    const [showScrollTop, setShowScrollTop] = useState(false);

    // 1. 预处理
    const contentWithSyntax = useMemo(() => {

        let text = displayMarkdown || ""; // 防空
        // 匹配标签（仅用于内容内标签的样式化，不再提取到顶部显示）
        text = text.replace(/(\s|^)#([\w\u4e00-\u9fa5]+)/g, (_, p, t) => {
            return `${p}<span class="md-tag-inline">#${t}</span>`;
        });
        // 匹配自定义语法
        text = text.replace(/\+\+(.*?)\+\+/g, '<span class="custom-underline-red">$1</span>')
            .replace(/\^\^(.*?)\^\^/g, '<span class="custom-underline-wavy">$1</span>')
            .replace(/==(.*?)==/g, '<span class="custom-watercolor">$1</span>');
        return text;
    }, [displayMarkdown]);

    // 2. 统计
    useEffect(() => {
        const safeText = displayMarkdown || "";
        const textContent = safeText.replace(/[#*`>~-]/g, '');
        setStats({
            wordCount: textContent.trim().length,
            readTime: Math.ceil(textContent.trim().length / 400)
        });

        const lines = safeText.split('\n');
        const headerItems: HeaderItem[] = [];
        lines.forEach(line => {
            const match = line.match(/^(#{2,6})\s+(.*)$/);
            if (match) {
                headerItems.push({
                    text: match[2].replace(/[*_~`]/g, ''),
                    level: match[1].length,
                    slug: match[2].toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-')
                });
            }
        });
        setHeaders(headerItems);
    }, [displayMarkdown]);

    // 3. 滚动监听
    useEffect(() => {
        const target = scrollContainerId ? document.getElementById(scrollContainerId) : window;

        const handleScroll = () => {
            const currentScrollTop = scrollContainerId
                ? (target as HTMLElement).scrollTop
                : (window.pageYOffset || document.documentElement.scrollTop);

            setShowScrollTop(currentScrollTop > 300);

            if (headers.length === 0) return;
            for (const header of headers) {
                const el = document.getElementById(header.slug);
                if (el && el.getBoundingClientRect().top < 150) {
                    setActiveHeader(header.slug);
                }
            }
        };

        target?.addEventListener('scroll', handleScroll, { passive: true });
        handleScroll();

        return () => target?.removeEventListener('scroll', handleScroll);
    }, [headers, scrollContainerId]);

    const handleScrollToTop = () => {
        if (scrollContainerId) {
            const container = document.getElementById(scrollContainerId);
            if (container) {
                container.scrollTo({ top: 0, behavior: 'smooth' });
                return;
            }
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // --- Components ---
    const components = useMemo(() => ({
        pre: (props: any) => <div className="not-prose">{props.children}</div>,
        p: (props: any) => {
            const { children } = props;
            const childrenArray = React.Children.toArray(children);
            const validChildren = childrenArray.filter(child => {
                if (typeof child === 'string') {
                    return child.trim().length > 0;
                }
                return true;
            });
            const isMathBlock = validChildren.length > 0 && validChildren.every(child => {
                if (React.isValidElement(child)) {
                    const element = child as React.ReactElement<{ className?: string }>;
                    return element.props.className?.includes('katex');
                }
                return false;
            });

            if (isMathBlock) {
                return (
                    <div className="flex justify-center w-full my-6 overflow-x-auto">
                        {children}
                    </div>
                );
            }
            return <p className="mb-4 leading-7 text-justify">{children}</p>;
        },
        code(props: any) {
            const { node, inline, className, children, ...rest } = props;
            const match = /language-(\w+)/.exec(className || '');
            const lang = match ? match[1] : '';
            const codeStr = String(children).replace(/\n$/, '');

            if (!inline && lang === 'mermaid') {
                return <MermaidChart chart={codeStr} />;
            }

            if (!inline && match) {
                return (
                    <div className="code-block-wrapper my-6 rounded-xl overflow-hidden bg-[#1e293b] shadow-2xl border border-slate-700/50 text-[15px]">
                        <div className="flex items-center justify-between px-4 py-2 bg-[#0f172a] border-b border-slate-700/50">
                            <div className="flex gap-1.5"><div className="w-3 h-3 rounded-full bg-[#ff5f56]" /><div className="w-3 h-3 rounded-full bg-[#ffbd2e]" /><div className="w-3 h-3 rounded-full bg-[#27c93f]" /></div>
                            <div className="flex items-center gap-3">
                                <span className="text-xs font-mono text-slate-400 uppercase">{lang}</span>
                                <CopyButton text={codeStr} />
                            </div>
                        </div>
                        <SyntaxHighlighter
                            style={darkTheme}
                            language={lang}
                            PreTag="div"
                            customStyle={{ margin: 0, background: 'transparent' }}
                            {...rest}
                        >
                            {codeStr}
                        </SyntaxHighlighter>
                    </div>
                );
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
        h5: ({ children }: { children: ReactNode }) => <h5 id={String(children).toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-')}>{children}</h5>,
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
                                        <Icons.Tag className="w-3 h-3 mr-1 opacity-50" />
                                        {tag}
                                    </span>
                                ))}

                                {onBack && (
                                    <button onClick={onBack} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                                        <Icons.ArrowLeft className="w-4 h-4" />
                                        返回文集
                                    </button>
                                )}
                            </div>

                            <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight mb-6">
                                {displayTitle}
                            </h1>

                            <div className="flex flex-wrap items-center gap-6 text-sm text-slate-500 font-medium">
                                <div className="flex items-center gap-2"><Icons.FileText className="w-4 h-4 text-slate-400" /><span>{stats.wordCount} 字</span></div>
                                <div className="flex items-center gap-2"><Icons.Clock className="w-4 h-4 text-slate-400" /><span>{stats.readTime} 分钟阅读</span></div>
                                <div className="flex items-center gap-2"><Icons.Calendar className="w-4 h-4 text-slate-400" /><span>{displayDate}</span></div>
                            </div>
                        </header>

                        {/* Markdown Render */}
                        <article className="max-w-none prose prose-slate prose-lg prose-p:[&:has(>.katex:only-child)]:text-center prose-a:text-[#0ea5e9] prose-a:no-underline hover:prose-a:underline">
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm, remarkMath]}
                                rehypePlugins={[rehypeKatex, rehypeRaw]} // 确保 rehypeRaw 存在以支持 video 标签
                                components={components as any}
                            >
                                {contentWithSyntax}
                            </ReactMarkdown>
                        </article>

                        {/* --- 附件展示区域 (新增) --- */}
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
                                                    <FileText className="w-5 h-5 text-blue-500" />
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
                    <Icons.ArrowUp className="w-5 h-5 group-hover:animate-bounce" />
                </button>
            </div>
        </>
    );
}