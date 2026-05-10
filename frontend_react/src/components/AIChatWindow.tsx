// frontend_react/src/components/AIChatWindow.tsx

import {useEffect, useRef, useState, useMemo} from 'react';
import {BookOpen, Bot, BrainCircuit, ChevronDown, Maximize2, Minimize2, Send, Trash2, User, X} from 'lucide-react';
import {useNavigate} from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

// 引入自定义组件和 API
import {AIConfigError} from '../api/ai';
import ConfirmationModal from './common/ConfirmationModal';
import {getArticleDetail} from '../api/article';
import {CodeBlock, MermaidChart} from './Article/MarkdownElements';

interface Message {
    role: 'user' | 'assistant';
    content: string;
    thinking?: string;
}

interface AIChatWindowProps {
    isOpen: boolean;
    onClose: () => void;
}

export const AIChatWindow = ({isOpen, onClose}: AIChatWindowProps) => {
    const navigate = useNavigate();

    // 窗口状态
    const [isMinimized, setIsMinimized] = useState(false);

    // 对话状态
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [useKb, setUseKb] = useState(false);
    const [useThinking, setUseThinking] = useState(false);

    // 弹窗状态
    const [isClearModalOpen, setIsClearModalOpen] = useState(false);

    // --- 平滑输出相关的 Refs ---
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const tokenQueueRef = useRef<string[]>([]); // 回答字符缓冲队列
    const thinkingQueueRef = useRef<string[]>([]); // 思考字符缓冲队列
    const isThinkingRef = useRef(false); // 标记是否正在输出中
    const streamFinishedRef = useRef(true);

    // --- Markdown 组件配置 (使用 useMemo 避免重复创建导致重渲染) ---
    const markdownComponents = useMemo(() => ({
        // 1. 处理代码块和 Mermaid 图表
        code(props: any) {
            const {inline, className, children, ...rest} = props;
            const match = /language-(\w+)/.exec(className || '');
            const lang = match ? match[1] : '';
            const codeStr = String(children).replace(/\n$/, '');

            // Mermaid 流程图渲染
            if (!inline && lang === 'mermaid') {
                return <MermaidChart chart={codeStr}/>;
            }

            // 代码高亮块
            if (!inline && match) {
                return <CodeBlock language={lang} code={codeStr} {...rest} />;
            }

            // 行内代码
            return (
                <code
                    className="bg-slate-100 text-orange-600 px-1.5 py-0.5 rounded-md font-mono text-[0.9em] mx-1 break-words border border-slate-200"
                    {...props}
                >
                    {children}
                </code>
            );
        },
        // 2. 增强的链接渲染：处理路由跳转、最小化窗口、修复缺失的 collId
        a: ({node, href, children, ...props}: any) => {
            const isInternal = href?.startsWith('/');
            return (
                <a
                    href={href}
                    onClick={async (e) => {
                        if (isInternal && href) {
                            e.preventDefault();

                            // 交互优化：点击链接时先最小化窗口，防止遮挡
                            setIsMinimized(true);

                            // 检查链接格式：如果是 /article/xxxx 且只有两段（缺少 collId），尝试修复
                            const articlePathMatch = href.match(/^\/article\/([^/]+)$/);

                            if (articlePathMatch) {
                                const articleId = articlePathMatch[1];
                                try {
                                    // 调用 API 获取文章详情以拿到 collId
                                    const article = await getArticleDetail(articleId);
                                    if (article && article.collId) {
                                        navigate(`/article/${article.collId}/${article.articleId}`);
                                        return;
                                    }
                                } catch (err) {
                                    console.warn("Auto-fix link failed, fallback to original:", err);
                                }
                            }

                            // 默认跳转
                            navigate(href);
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
        // 3. 优化表格样式
        table: ({children}: any) => (
            <div className="overflow-x-auto my-4 border border-slate-200 rounded-lg bg-white/50">
                <table className="w-full text-sm text-left">{children}</table>
            </div>
        ),
        thead: ({children}: any) => (
            <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
            {children}
            </thead>
        ),
        th: ({children}: any) => (
            <th className="px-4 py-3 whitespace-nowrap">
                {children}
            </th>
        ),
        td: ({children}: any) => (
            <td className="px-4 py-3 border-b border-slate-100 text-slate-600 last:border-0">
                {children}
            </td>
        ),
        // 4. 数学公式支持
        p: ({children}: any) => {
            // 简单的检查是否包含块级公式
            const childrenArray = Array.isArray(children) ? children : [children];
            const hasMathBlock = childrenArray.some((child: any) =>
                child?.props?.className?.includes('katex-display')
            );

            if (hasMathBlock) {
                return <div className="my-4 overflow-x-auto">{children}</div>;
            }
            return <p className="mb-2 leading-relaxed last:mb-0">{children}</p>;
        },
        // 5. 列表样式
        ul: ({children}: any) => <ul className="list-disc pl-5 space-y-1 my-2 marker:text-slate-400">{children}</ul>,
        ol: ({children}: any) => <ol className="list-decimal pl-5 space-y-1 my-2 marker:text-slate-400">{children}</ol>,
        blockquote: ({children}: any) => (
            <blockquote
                className="border-l-4 border-orange-200 pl-4 py-1 my-3 bg-orange-50/50 text-slate-600 italic rounded-r">
                {children}
            </blockquote>
        ),
    }), [navigate]);

    // --- ESC 键监听：最小化窗口 ---
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen && !isMinimized) {
                // 如果当前正在输入框中，可能需要权衡是否拦截，这里默认直接最小化
                setIsMinimized(true);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, isMinimized]);

    // --- 核心逻辑 1: 平滑输出定时器 ---
    useEffect(() => {
        const takeSmoothChars = (queue: string[]) => {
            const length = queue.length;
            if (length === 0) return '';

            const count = length > 240 ? 6 : length > 120 ? 4 : length > 48 ? 2 : 1;
            return queue.splice(0, count).join('');
        };

        const interval = setInterval(() => {
            const nextAnswerChars = takeSmoothChars(tokenQueueRef.current);
            const nextThinkingChars = takeSmoothChars(thinkingQueueRef.current);

            if (nextAnswerChars || nextThinkingChars) {
                setMessages(prev => {
                    const newMsgs = [...prev];
                    const lastMsg = newMsgs[newMsgs.length - 1];
                    if (lastMsg && lastMsg.role === 'assistant') {
                        newMsgs[newMsgs.length - 1] = {
                            ...lastMsg,
                            content: `${lastMsg.content}${nextAnswerChars}`,
                            thinking: `${lastMsg.thinking || ''}${nextThinkingChars}`
                        };
                    }
                    return newMsgs;
                });
            }

            if (
                streamFinishedRef.current &&
                isThinkingRef.current &&
                tokenQueueRef.current.length === 0 &&
                thinkingQueueRef.current.length === 0
            ) {
                isThinkingRef.current = false;
                setIsLoading(false);
            }
        }, 24);

        return () => clearInterval(interval);
    }, []);

    // 自动滚动到底部
    useEffect(() => {
        if (!isMinimized && isOpen) {
            messagesEndRef.current?.scrollIntoView({behavior: "smooth"});
        }
    }, [messages, isMinimized, isOpen]);

    // 打开清空确认弹窗
    const handleClearMessages = () => {
        if (messages.length > 0) {
            setIsClearModalOpen(true);
        }
    };

    // 执行清空操作
    const confirmClear = () => {
        tokenQueueRef.current = [];
        thinkingQueueRef.current = [];
        streamFinishedRef.current = true;
        isThinkingRef.current = false;
        setMessages([]);
        setIsLoading(false);
        setIsClearModalOpen(false);
    };

    // 发送消息处理
    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const userMsg = input;
        setInput('');

        tokenQueueRef.current = [];
        thinkingQueueRef.current = [];
        streamFinishedRef.current = false;
        setMessages(prev => [...prev, {role: 'user', content: userMsg}]);
        setIsLoading(true);
        isThinkingRef.current = true;

        // 预先添加一个空的 assistant 消息用于接收流
        setMessages(prev => [...prev, {role: 'assistant', content: '', thinking: ''}]);

        try {
            const response = await fetch('/api/ai/chat/', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    message: userMsg,
                    history: messages.map(m => ({role: m.role, content: m.content})),
                    use_knowledge_base: useKb,
                    include_thinking: useThinking
                })
            });

            if (!response.ok) {
                if (response.status === 400) {
                    try {
                        const errorData = await response.json();
                        const errorMsg = errorData.error || '';
                        if (errorMsg.includes('No default model configured') || errorMsg.includes('model')) {
                            throw new AIConfigError('未配置大模型，请先在系统设置中配置 AI 模型');
                        }
                        throw new Error(errorMsg || 'AI 配置错误');
                    } catch (e) {
                        if (e instanceof AIConfigError) throw e;
                        throw new AIConfigError('未配置大模型，请先在系统设置中配置 AI 模型');
                    }
                }
                throw new Error('AI 请求失败');
            }

            if (!response.body) throw new Error("No response body");

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullText = '';
            let buffer = '';

            const appendAnswer = (content: string) => {
                for (const char of content) {
                    tokenQueueRef.current.push(char);
                }
            };

            const appendThinking = (content: string) => {
                for (const char of content) {
                    thinkingQueueRef.current.push(char);
                }
            };

            const handleStreamLine = (line: string) => {
                if (!line.trim()) return;

                try {
                    const event = JSON.parse(line);
                    const content = event.content || '';

                    if (event.type === 'error') {
                        throw new Error(content || 'AI 服务异常，请检查配置');
                    }

                    if (event.type === 'thinking') {
                        appendThinking(content);
                        return;
                    }

                    appendAnswer(content);
                } catch (error) {
                    if (error instanceof SyntaxError) {
                        appendAnswer(line);
                        return;
                    }
                    throw error;
                }
            };

            while (true) {
                const {done, value} = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, {stream: true});
                fullText += chunk;

                if (/\[System Error\]/.test(fullText)) {
                    if (fullText.includes('No default model configured')) {
                        throw new AIConfigError('未配置大模型，请先在系统设置中配置 AI 模型');
                    }
                    throw new AIConfigError('AI 服务异常，请检查配置');
                }

                buffer += chunk;
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    handleStreamLine(line);
                }
            }

            if (buffer.trim()) {
                handleStreamLine(buffer);
            }
        } catch (error) {
            console.error(error);
            tokenQueueRef.current = [];
            thinkingQueueRef.current = [];
            streamFinishedRef.current = true;
            isThinkingRef.current = false;
            setIsLoading(false);
            setMessages(prev => {
                const newMsgs = [...prev];
                if (error instanceof AIConfigError) {
                    newMsgs[newMsgs.length - 1].content = `⚠️ ${error.message}`;
                } else {
                    newMsgs[newMsgs.length - 1].content = error instanceof Error ? error.message : '网络连接异常，请检查后端服务。';
                }
                return newMsgs;
            });
        } finally {
            streamFinishedRef.current = true;
        }
    };

    if (!isOpen) return null;

    // --- 最小化状态 (侧边停靠) ---
    if (isMinimized) {
        return (
            <div
                className="fixed right-0 top-1/2 -translate-y-1/2 z-[100] bg-gradient-to-r from-orange-500 to-orange-600 text-white p-3 rounded-l-xl shadow-lg cursor-pointer hover:w-16 transition-all w-12 flex flex-col items-center gap-3 group border-y border-l border-white/20"
                onClick={() => setIsMinimized(false)}
                title="展开 AI 对话"
            >
                <Bot className="w-6 h-6 animate-pulse"/>
                <div className="flex flex-col items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                    <span className="text-[10px] font-bold writing-vertical-rl tracking-widest">AI</span>
                    <Maximize2 className="w-3 h-3 mt-1"/>
                </div>
            </div>
        );
    }

    // --- 正常窗口状态 (居中大屏) ---
    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/20 backdrop-blur-[2px] animate-in fade-in duration-200">

            {/* 确认弹窗 */}
            <ConfirmationModal
                isOpen={isClearModalOpen}
                onClose={() => setIsClearModalOpen(false)}
                onConfirm={confirmClear}
                title="清空对话"
                description="确定要清空当前所有对话记录吗？此操作无法撤销。"
                confirmText="清空"
                type="warning"
            />

            {/* 主对话框容器 */}
            <div
                className="relative w-[900px] max-w-[95vw] h-[80vh] max-h-[820px] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 ring-1 ring-slate-900/5 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >

                {/* Header */}
                <div
                    className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80 backdrop-blur-sm">
                    <div className="flex items-center gap-3 text-slate-800 font-bold text-lg">
                        <div className="p-2 bg-orange-100 text-orange-600 rounded-xl shadow-sm">
                            <Bot className="w-5 h-5"/>
                        </div>
                        <span>小橘 AI助手</span>
                        <span
                            className="text-xs font-normal text-slate-400 px-2 py-0.5 bg-slate-100 rounded-full border border-slate-200">Pro</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={handleClearMessages}
                            disabled={messages.length === 0}
                            className={`p-2 rounded-lg transition-colors mr-1 ${
                                messages.length === 0
                                    ? 'text-slate-200 cursor-not-allowed'
                                    : 'text-slate-400 hover:bg-slate-200 hover:text-orange-600'
                            }`}
                            title={messages.length === 0 ? "暂无对话" : "清空会话"}
                        >
                            <Trash2 className="w-5 h-5"/>
                        </button>
                        <button
                            onClick={() => setIsMinimized(true)}
                            className="p-2 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
                            title="最小化"
                        >
                            <Minimize2 className="w-5 h-5"/>
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-red-50 hover:text-red-500 rounded-lg text-slate-400 transition-colors"
                            title="关闭"
                        >
                            <X className="w-5 h-5"/>
                        </button>
                    </div>
                </div>

                {/* Chat Body */}
                <div className="flex-1 min-h-0 overflow-y-auto p-6 pb-10 space-y-6 bg-slate-50/30 scroll-smooth">
                    {messages.length === 0 && (
                        <div
                            className="h-full flex flex-col items-center justify-center text-slate-400 space-y-6 -mt-10">
                            <div
                                className="w-20 h-20 bg-white rounded-3xl shadow-sm border border-slate-100 flex items-center justify-center">
                                <Bot className="w-10 h-10 text-orange-500"/>
                            </div>
                            <div className="text-center space-y-2">
                                <p className="text-lg font-medium text-slate-600">有什么可以帮你的吗？</p>
                                <div className="flex gap-2 justify-center text-xs text-slate-400">
                                    <span
                                        className="px-2 py-1 bg-white border border-slate-200 rounded-md">文档检索</span>
                                    <span
                                        className="px-2 py-1 bg-white border border-slate-200 rounded-md">代码生成</span>
                                    <span
                                        className="px-2 py-1 bg-white border border-slate-200 rounded-md">创意写作</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {messages.map((msg, idx) => (
                        <div key={idx}
                             className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                            {/* 头像 */}
                            <div
                                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border shadow-sm ${
                                    msg.role === 'user'
                                        ? 'bg-white text-slate-600 border-slate-200'
                                        : 'bg-orange-100 text-orange-600 border-orange-200'
                                }`}>
                                {msg.role === 'user' ? <User className="w-5 h-5"/> : <Bot className="w-5 h-5"/>}
                            </div>

                            {/* 消息气泡 */}
                            <div
                                className={`max-w-[85%] px-5 py-3.5 text-[15px] leading-relaxed shadow-sm break-words overflow-hidden ${
                                    msg.role === 'user'
                                        ? 'bg-slate-800 text-white rounded-2xl rounded-tr-none'
                                        : 'bg-white border border-slate-100 text-slate-700 rounded-2xl rounded-tl-none'
                                }`}>

                                {msg.role === 'assistant' ? (
                                    /* AI 回复使用 ReactMarkdown 渲染，支持引用链接点击跳转 */
                                    <>
                                        {msg.thinking && (
                                            <details
                                                open={isLoading && idx === messages.length - 1}
                                                className="mb-3 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-amber-900 group"
                                            >
                                                <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold">
                                                    <BrainCircuit className="w-3.5 h-3.5"/>
                                                    <span>思考过程</span>
                                                    <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-medium text-amber-700 border border-amber-200/70">
                                                        {isLoading && idx === messages.length - 1 ? '生成中' : `${msg.thinking.length} 字`}
                                                    </span>
                                                    <ChevronDown className="ml-auto w-3.5 h-3.5 transition-transform group-open:rotate-180"/>
                                                </summary>
                                                <div className="mt-2 max-h-52 overflow-y-auto whitespace-pre-wrap border-t border-amber-200/70 pt-2 text-xs leading-5 text-amber-800/90">
                                                    {msg.thinking}
                                                </div>
                                            </details>
                                        )}
                                        <ReactMarkdown
                                            remarkPlugins={[remarkGfm, remarkMath]}
                                            rehypePlugins={[rehypeKatex]}
                                            components={markdownComponents as any}
                                        >
                                            {msg.content}
                                        </ReactMarkdown>
                                    </>
                                ) : (
                                    /* 用户消息保持纯文本渲染 */
                                    <div className="whitespace-pre-wrap">{msg.content}</div>
                                )}

                                {/* Loading 动画 */}
                                {msg.role === 'assistant' && isLoading && msg.content.length === 0 && (
                                    <span className="flex gap-1 items-center h-6">
                                        <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></span>
                                        <span
                                            className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-75"></span>
                                        <span
                                            className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-150"></span>
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                    <div ref={messagesEndRef} className="h-6"/>
                </div>

                {/* Footer */}
                <div className="p-5 bg-white border-t border-slate-100">
                    <div className="flex items-center justify-between mb-3 px-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                onClick={() => setUseKb(!useKb)}
                                className={`text-xs font-medium flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${
                                    useKb
                                        ? 'bg-blue-50 text-blue-600 border-blue-200 shadow-sm ring-1 ring-blue-100'
                                        : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                                }`}
                            >
                                <BookOpen className="w-3.5 h-3.5"/>
                                {useKb ? '知识库模式：已开启' : '知识库模式：未开启'}
                            </button>
                            <button
                                onClick={() => setUseThinking(!useThinking)}
                                className={`text-xs font-medium flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${
                                    useThinking
                                        ? 'bg-amber-50 text-amber-700 border-amber-200 shadow-sm ring-1 ring-amber-100'
                                        : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                                }`}
                            >
                                <BrainCircuit className="w-3.5 h-3.5"/>
                                {useThinking ? '思考模式：已开启' : '思考模式：未开启'}
                            </button>
                        </div>
                        <span className="text-[11px] text-slate-300 font-mono flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                            Model: Auto
                        </span>
                    </div>

                    <div className="relative group">
                        <div
                            className="absolute inset-0 bg-orange-500/5 rounded-2xl blur opacity-0 group-focus-within:opacity-100 transition-opacity"></div>
                        <div
                            className="relative flex items-end gap-2 p-2 bg-slate-50 border border-slate-200 rounded-2xl focus-within:ring-2 focus-within:ring-orange-500/10 focus-within:border-orange-400 focus-within:bg-white transition-all shadow-sm">
                            <textarea
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSend();
                                    }
                                }}
                                placeholder="输入您的问题..."
                                className="flex-1 bg-transparent border-none focus:ring-0 text-base px-3 py-2 resize-none h-[52px] max-h-[200px] overflow-y-auto scrollbar-hide outline-none leading-relaxed placeholder:text-slate-400"
                            />
                            <button
                                onClick={handleSend}
                                disabled={isLoading || !input.trim()}
                                className="shrink-0 mb-0.5 p-2.5 bg-orange-500 text-white rounded-xl hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shadow-orange-500/20 active:scale-95 flex items-center justify-center group/btn"
                            >
                                <Send className="w-5 h-5 group-hover/btn:translate-x-0.5 transition-transform"/>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
