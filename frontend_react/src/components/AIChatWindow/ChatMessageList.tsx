// frontend_react/src/components/AIChatWindow/ChatMessageList.tsx

import { useMemo, type RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { Bot, User, WandSparkles, Check, BrainCircuit, ChevronDown, Loader2 } from 'lucide-react';

import { type Message, type ActivityStep, type LoadedSkill } from './types';
import { type AgentConfig } from '../../api/setting';
import { useAuth } from '../../contexts/AuthContext';
import { getArticleDetail } from '../../api/article';
import {
    CodeBlock,
    CompactVariantBlockquote,
    MermaidChart,
    rehypeInlineStyleSyntax,
    remarkQuoteVariants,
    SimpleChart,
} from '../Article/MarkdownElements';
import {isImageAvatarValue} from '../../utils/avatar';

interface ChatMessageListProps {
    messages: Message[];
    isLoading: boolean;
    activitySteps: ActivityStep[];
    activeAgent: AgentConfig | null;
    activeAgentSkills: string[];
    activeAgentMcpServers: string[];
    chatBodyRef: RefObject<HTMLDivElement | null>;
    messagesEndRef: RefObject<HTMLDivElement | null>;
    onScroll: () => void;
    setIsMinimized: (minimized: boolean) => void;
    useThinking?: boolean;
}

const truncateText = (value: string, maxLength = 800) => (
    value.length > maxLength ? `${value.slice(0, maxLength)}...（已截断 ${value.length - maxLength} 字符）` : value
);

const compactValue = (value: unknown, depth = 0): unknown => {
    if (typeof value === 'string') return truncateText(value, 500);
    if (value == null || typeof value !== 'object') return value;
    if (depth >= 3) return '[Object]';

    if (Array.isArray(value)) {
        const items = value.slice(0, 12).map(item => compactValue(item, depth + 1));
        return value.length > 12 ? [...items, `...（已省略 ${value.length - 12} 项）`] : items;
    }

    const entries = Object.entries(value as Record<string, unknown>);
    return entries.slice(0, 24).reduce<Record<string, unknown>>((result, [key, item]) => {
        result[key] = compactValue(item, depth + 1);
        if (key === 'content' && typeof item === 'string') {
            result[key] = truncateText(item, 360);
        }
        return result;
    }, entries.length > 24 ? { _truncated: `已省略 ${entries.length - 24} 个字段` } : {});
};

const formatJsonPreview = (value: unknown) => {
    try {
        return JSON.stringify(compactValue(value), null, 2);
    } catch {
        return String(value ?? '');
    }
};

const formatSkillLine = (skill: LoadedSkill) => {
    const version = skill.version ? ` v${skill.version}` : '';
    const source = skill.source ? ` · ${skill.source}` : '';
    return `${skill.name}${version}${source}${skill.description ? `\n${skill.description}` : ''}`;
};

export const ChatMessageList = ({
    messages,
    isLoading,
    activitySteps,
    activeAgent,
    activeAgentSkills,
    activeAgentMcpServers,
    chatBodyRef,
    messagesEndRef,
    onScroll,
    setIsMinimized,
    useThinking = false,
}: ChatMessageListProps) => {
    const navigate = useNavigate();
    const { userInfo } = useAuth();

    // Markdown 组件渲染配置
    const markdownComponents = useMemo(() => {
        const handleArticleLinkClick = async (href: string) => {
            const articlePathMatch = href.match(/^\/article\/([^/]+)$/);
            if (articlePathMatch) {
                const articleId = articlePathMatch[1];
                try {
                    const article = await getArticleDetail(articleId);
                    if (article && article.collId) {
                        navigate(`/article/${article.collId}/${article.articleId}`);
                        return;
                    }
                } catch (err) {
                    console.warn("Auto-fix link failed, fallback to original:", err);
                }
            }
            navigate(href);
        };

        return {
            code(props: any) {
                const { inline, className, children, ...rest } = props;
                const match = /language-(\w+)/.exec(className || '');
                const lang = match ? match[1] : '';
                const codeStr = String(children).replace(/\n$/, '');

                if (!inline && lang === 'mermaid') {
                    return <MermaidChart chart={codeStr} />;
                }

                if (!inline && lang === 'chart') {
                    return <SimpleChart chart={codeStr} />;
                }

                if (!inline && match) {
                    return <CodeBlock language={lang} code={codeStr} {...rest} />;
                }

                return (
                    <code
                        className="bg-white text-orange-600 px-1.5 py-0.5 rounded-md font-mono text-[0.9em] mx-1 break-words border border-slate-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
                        {...props}
                    >
                        {children}
                    </code>
                );
            },
            a: ({ node, href, children, ...props }: any) => {
                const isInternal = href?.startsWith('/');
                return (
                    <a
                        href={href}
                        onClick={(e) => {
                            if (isInternal && href) {
                                e.preventDefault();
                                setIsMinimized(true);
                                handleArticleLinkClick(href);
                            }
                        }}
                        target={isInternal ? undefined : "_blank"}
                        rel={isInternal ? undefined : "noopener noreferrer"}
                        className="text-orange-600 hover:text-orange-700 font-medium hover:underline decoration-orange-300 underline-offset-2 cursor-pointer transition-colors"
                        {...props}
                    >
                        {children}
                    </a>
                );
            },
            table: ({ children }: any) => (
                <div className="overflow-x-auto my-4 border border-slate-200 rounded-lg bg-white shadow-sm">
                    <table className="w-full text-sm text-left">{children}</table>
                </div>
            ),
            thead: ({ children }: any) => (
                <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                    {children}
                </thead>
            ),
            th: ({ children }: any) => (
                <th className="px-4 py-3 whitespace-nowrap">
                    {children}
                </th>
            ),
            td: ({ children }: any) => (
                <td className="px-4 py-3 border-b border-slate-100 text-slate-600 last:border-0">
                    {children}
                </td>
            ),
            p: ({ children }: any) => {
                const childrenArray = Array.isArray(children) ? children : [children];
                const hasMathBlock = childrenArray.some((child: any) =>
                    child?.props?.className?.includes('katex-display')
                );

                if (hasMathBlock) {
                    return <div className="my-4 overflow-x-auto">{children}</div>;
                }
                return <p className="mb-2 leading-relaxed last:mb-0">{children}</p>;
            },
            ul: ({ children }: any) => <ul className="list-disc pl-5 space-y-1 my-2 marker:text-slate-400">{children}</ul>,
            ol: ({ children }: any) => <ol className="list-decimal pl-5 space-y-1 my-2 marker:text-slate-400">{children}</ol>,
            blockquote: CompactVariantBlockquote,
        };
    }, [navigate, setIsMinimized]);

    return (
        <div
            ref={chatBodyRef}
            onScroll={onScroll}
            className="flex-1 min-h-0 overflow-y-auto p-6 pb-10 space-y-6 bg-slate-50/30"
        >
            {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-6 -mt-10">
                    <div className="w-20 h-20 bg-white rounded-3xl shadow-sm border border-slate-100 flex items-center justify-center overflow-hidden">
                        {isImageAvatarValue(activeAgent?.avatar) ? (
                            <img src={activeAgent?.avatar} alt={activeAgent?.name || 'Agent'} className="h-full w-full object-cover" />
                        ) : (
                            activeAgent?.avatar?.trim() || <Bot className="w-10 h-10 text-orange-500" />
                        )}
                    </div>
                    <div className="text-center space-y-2">
                        <p className="text-lg font-medium text-slate-600">
                            {activeAgent ? `和 ${activeAgent.name} 聊点什么？` : '有什么可以帮你的吗？'}
                        </p>
                        <div className="flex gap-2 justify-center text-xs text-slate-400">
                            {activeAgent ? (
                                <>
                                    <span className="px-2 py-1 bg-white border border-slate-200 rounded-md">
                                        {activeAgent.modelDetail?.name || 'Agent 模型'}
                                    </span>
                                    <span className="px-2 py-1 bg-white border border-slate-200 rounded-md">
                                        {activeAgentSkills.length} 个技能
                                    </span>
                                    <span className="px-2 py-1 bg-white border border-slate-200 rounded-md">
                                        {activeAgentMcpServers.length} 个工具
                                    </span>
                                </>
                            ) : (
                                <>
                                    <span className="px-2 py-1 bg-white border border-slate-200 rounded-md">文档检索</span>
                                    <span className="px-2 py-1 bg-white border border-slate-200 rounded-md">代码生成</span>
                                    <span className="px-2 py-1 bg-white border border-slate-200 rounded-md">创意写作</span>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {messages.map((msg, idx) => {
                const showAvatar = idx === 0 || messages[idx - 1].role !== msg.role;
                const isLatestAssistant = msg.role === 'assistant' && idx === messages.length - 1 && isLoading;
                return (
                    <div key={idx} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                        {/* 头像 */}
                        {showAvatar ? (
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border shadow-sm overflow-hidden ${
                                msg.role === 'user'
                                    ? 'bg-white text-slate-600 border-slate-200'
                                    : 'bg-orange-100 text-orange-600 border-orange-200'
                            }`}>
                                {msg.role === 'user' ? (
                                    userInfo?.avatar ? (
                                        <img src={userInfo.avatar} alt="用户头像" className="h-full w-full object-cover" />
                                    ) : (
                                        <User className="w-5 h-5" />
                                    )
                                ) : isImageAvatarValue(activeAgent?.avatar) ? (
                                    <img src={activeAgent?.avatar} alt={activeAgent?.name || 'Agent'} className="h-full w-full object-cover" />
                                ) : (
                                    activeAgent?.avatar?.trim() || <Bot className="w-5 h-5" />
                                )}
                            </div>
                        ) : (
                            <div className="w-10 h-10 shrink-0" />
                        )}

                        {/* 消息气泡 */}
                        <div className={`max-w-[85%] break-words overflow-hidden text-[15px] leading-relaxed ${
                            msg.role === 'user'
                                ? 'bg-slate-800 text-white rounded-xl px-5 py-3.5 shadow-sm'
                                : msg.statusId === 'typing'
                                    ? 'flex items-center px-2 py-1.5'
                                    : msg.status
                                        ? 'bg-orange-50 border border-orange-200 text-orange-800 rounded-xl px-4 py-2.5 shadow-[0_2px_8px_rgba(251,146,60,0.04)] ring-1 ring-orange-100/50'
                                        : `bg-[#eef2f6] text-slate-800 rounded-xl px-5 py-3.5 ${isLatestAssistant ? 'streaming-bubble' : ''}`
                        }`}>
                            {msg.role === 'assistant' ? (
                                msg.status ? (
                                    <div className="px-0.5">
                                        {msg.statusId === 'typing' ? (
                                            <div className="flex items-center gap-1.5">
                                                <WandSparkles className="w-3.5 h-3.5 shrink-0 text-orange-500" style={{ animation: 'spin 6s linear infinite' }} />
                                                <span className="text-[11px] font-semibold text-slate-400 tracking-wider select-none">{useThinking ? '思考中' : '生成中'}</span>
                                                <span className="flex gap-1 items-center ml-0.5">
                                                    <span className="h-1 w-1 rounded-full bg-orange-400/80 animate-pulse" style={{ animationDuration: '1.2s' }} />
                                                    <span className="h-1 w-1 rounded-full bg-orange-400/80 animate-pulse" style={{ animationDuration: '1.2s', animationDelay: '0.2s' }} />
                                                    <span className="h-1 w-1 rounded-full bg-orange-400/80 animate-pulse" style={{ animationDuration: '1.2s', animationDelay: '0.4s' }} />
                                                </span>
                                            </div>
                                        ) : msg.meta?.kind === 'mcp' ? (
                                            <details className="group min-w-[240px]">
                                                <summary className="flex cursor-pointer list-none items-center gap-2">
                                                    {msg.status === 'done' ? (
                                                        <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                                                    ) : (
                                                        <WandSparkles className="h-3.5 w-3.5 shrink-0 text-orange-500 animate-pulse" />
                                                    )}
                                                    <span className="text-sm font-semibold text-orange-800">{msg.content}</span>
                                                    <ChevronDown className="ml-auto h-3.5 w-3.5 text-orange-500 transition-transform group-open:rotate-180" />
                                                </summary>
                                                <div className="mt-3 border-t border-orange-200/70 pt-3 text-xs text-orange-900/80">
                                                    <div className="grid gap-2">
                                                        <div>
                                                            <span className="font-semibold">Tool：</span>
                                                            <span className="font-mono">{msg.meta.toolName}</span>
                                                        </div>
                                                        <div>
                                                            <div className="mb-1 font-semibold">参数</div>
                                                            <pre className="max-h-64 overflow-auto rounded-lg border border-orange-200/70 bg-white/70 p-3 text-[11px] leading-5 text-slate-700 whitespace-pre-wrap">{formatJsonPreview(msg.meta.arguments ?? {})}</pre>
                                                        </div>
                                                    </div>
                                                </div>
                                            </details>
                                        ) : msg.meta?.kind === 'skills' ? (
                                            <details className="group min-w-[240px]">
                                                <summary className="flex cursor-pointer list-none items-center gap-2">
                                                    <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                                                    <span className="text-sm font-semibold text-orange-800">{msg.content}</span>
                                                    <ChevronDown className="ml-auto h-3.5 w-3.5 text-orange-500 transition-transform group-open:rotate-180" />
                                                </summary>
                                                <div className="mt-3 space-y-2 border-t border-orange-200/70 pt-3 text-xs text-orange-900/80">
                                                    {msg.meta.skills.map((skill, skillIndex) => (
                                                        <pre key={`${skill.id || skill.name}-${skillIndex}`} className="rounded-lg border border-orange-200/70 bg-white/70 p-3 whitespace-pre-wrap text-[11px] leading-5 text-slate-700">{formatSkillLine(skill)}</pre>
                                                    ))}
                                                </div>
                                            </details>
                                        ) : msg.status === 'done' ? (
                                            <div className="flex items-center gap-2">
                                                <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                                                <span className="text-sm font-semibold text-orange-800">{msg.content}</span>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <WandSparkles className="h-3.5 w-3.5 shrink-0 text-orange-500 animate-pulse" />
                                                <span className="text-sm font-semibold text-orange-800">{msg.content}</span>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <>
                                        {msg.thinking && (
                                            <details
                                                open={isLoading && idx === messages.length - 1}
                                                className="mb-3 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-amber-900 group"
                                            >
                                                <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold">
                                                    <BrainCircuit className="w-3.5 h-3.5" />
                                                    <span>思考过程</span>
                                                    <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-medium text-amber-700 border border-amber-200/70">
                                                        {isLoading && idx === messages.length - 1 ? '生成中' : `${msg.thinking.length} 字`}
                                                    </span>
                                                    <ChevronDown className="ml-auto w-3.5 h-3.5 transition-transform group-open:rotate-180" />
                                                </summary>
                                                <div className="mt-2 max-h-52 overflow-y-auto whitespace-pre-wrap border-t border-amber-200/70 pt-2 text-xs leading-5 text-amber-800/90">
                                                    {msg.thinking}
                                                </div>
                                            </details>
                                        )}
                                        <ReactMarkdown
                                            remarkPlugins={[remarkQuoteVariants, remarkGfm, remarkMath]}
                                            rehypePlugins={[rehypeKatex, rehypeInlineStyleSyntax]}
                                            components={markdownComponents as any}
                                        >
                                            {msg.content}
                                        </ReactMarkdown>
                                    </>
                                )
                            ) : (
                                <div className="whitespace-pre-wrap">{msg.content}</div>
                            )}

                            {/* Loading 动画 */}
                            {msg.role === 'assistant' && !msg.status && isLoading && msg.content.length === 0 && (
                                activitySteps.length === 0 && (
                                    <span className="flex h-6 items-center gap-2 text-xs text-slate-400">
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        <span>正在生成回答</span>
                                    </span>
                                )
                            )}
                        </div>
                    </div>
                );
            })}
            <div ref={messagesEndRef} className="h-6" />
        </div>
    );
};
