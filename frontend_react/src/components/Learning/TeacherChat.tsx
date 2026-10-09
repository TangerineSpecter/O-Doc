import {type KeyboardEvent, useEffect, useRef, useState} from 'react';
import ReactMarkdown from 'react-markdown';
import {Info, Loader2, Send, User} from 'lucide-react';
import type {ChatMessage} from '../../types/api/learning';
import TeacherAvatar from './TeacherAvatar';

interface TeacherChatProps {
    name: string;
    messages: ChatMessage[];
    busy: boolean;
    pending: boolean;
    send: (message: string) => Promise<void>;
}

const QUICK_PROMPTS = [
    '这句话为什么这样表达？',
    '有什么类似的地道例句？',
    '能帮我分析一下我的薄弱点吗？',
];

export default function TeacherChat({name, messages, busy, pending, send}: TeacherChatProps) {
    const [text, setText] = useState('');
    const [error, setError] = useState('');
    const [sending, setSending] = useState(false);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const followLatestRef = useRef(true);
    const lastMessageId = messages[messages.length - 1]?.id;
    const lastMessageContent = messages[messages.length - 1]?.content;

    // 轮询产生新数组不代表新消息；阅读历史时保留位置，只在跟随最新消息时滚动。
    useEffect(() => {
        if (messagesContainerRef.current && followLatestRef.current) {
            messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
        }
    }, [messages.length, lastMessageId, lastMessageContent, pending]);

    const handleSend = async (contentToSend?: string) => {
        const value = (contentToSend ?? text).trim();
        if (!value || busy || pending || sending) return;

        setError('');
        setSending(true);
        // 主动发送新问题时恢复跟随，后续自己的消息和老师回复保持可见。
        followLatestRef.current = true;
        if (messagesContainerRef.current) {
            messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
        }
        try {
            await send(value);
            if (!contentToSend) setText('');
        } catch (err) {
            setError(err instanceof Error ? err.message : '发送失败，请重试');
        } finally {
            setSending(false);
        }
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void handleSend();
        }
    };

    const handleSelectPrompt = (prompt: string) => {
        setText(prompt);
        textareaRef.current?.focus();
    };

    return (
        <section className="flex h-[560px] max-h-[calc(100vh-140px)] flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
            {/* 顶部助教卡片 Header */}
            <div className="shrink-0 border-b border-slate-100 bg-gradient-to-r from-orange-50/50 via-white to-white px-4 py-3.5 sm:px-5">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <TeacherAvatar size="md" isThinking={pending} showOnlineStatus={true} />
                        <div className="min-w-0">
                            <h2 className="truncate text-sm font-bold text-slate-850">与{name}交流</h2>
                            <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
                                <span>AI 伴学助教</span>
                                <span className="h-1 w-1 rounded-full bg-slate-300" />
                                <span className="text-emerald-600 font-medium">在线答疑</span>
                            </p>
                        </div>
                    </div>

                    <div className="shrink-0 rounded-full bg-orange-50 px-2.5 py-0.5 text-[10px] font-medium text-orange-700 border border-orange-200/50">
                        渐进提示
                    </div>
                </div>

                <div className="mt-2 flex items-center gap-1.5 text-[11px] leading-tight text-slate-400">
                    <Info size={12} className="shrink-0 text-slate-400" />
                    <span className="truncate">可追问讲解与建议；作答中只提供提示引导</span>
                </div>
            </div>

            {/* 消息对话滚动区域 */}
            <div
                ref={messagesContainerRef}
                onScroll={e => {
                    const {scrollHeight, scrollTop, clientHeight} = e.currentTarget;
                    followLatestRef.current = scrollHeight - scrollTop - clientHeight <= 48;
                }}
                className="flex-1 space-y-4 overflow-y-auto p-4 scrollbar-hide"
                aria-live="polite"
            >
                {/* 空状态引导 */}
                {!messages.length && (
                    <div className="flex h-full flex-col items-center justify-center p-4 text-center">
                        <TeacherAvatar size="lg" showOnlineStatus={false} isThinking={false} className="mb-3" />
                        <p className="text-sm font-semibold text-slate-700">有什么疑问，随时问我</p>
                        <p className="mt-1 max-w-[240px] text-xs leading-relaxed text-slate-400">
                            无论是题目解析、语法地道表达还是学习节奏，我都陪你一起探讨。
                        </p>

                        <div className="mt-4 flex flex-col gap-1.5 w-full max-w-[260px]">
                            {QUICK_PROMPTS.map(prompt => (
                                <button
                                    key={prompt}
                                    type="button"
                                    onClick={() => handleSelectPrompt(prompt)}
                                    className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2 text-left text-xs text-slate-600 transition-all hover:border-orange-200 hover:bg-orange-50/60 hover:text-orange-700 active:scale-[0.98]"
                                >
                                    💡 {prompt}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* 消息流列表 */}
                {messages.map(m => {
                    const isUser = m.role === 'user';
                    return (
                        <div
                            key={m.id}
                            className={`flex items-start gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
                        >
                            {/* 头像 */}
                            {isUser ? (
                                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs shadow-2xs mt-0.5 bg-orange-100 text-orange-600 font-semibold">
                                    <User size={14} />
                                </div>
                            ) : (
                                <TeacherAvatar size="sm" showOnlineStatus={false} isThinking={false} className="mt-0.5" />
                            )}

                            {/* 消息本体与气泡 */}
                            <div className={`flex max-w-[82%] flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                                <span className="mb-1 px-1 text-[10px] text-slate-400 font-medium">
                                    {isUser ? '我' : name}
                                </span>

                                <div
                                    className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-2xs ${
                                        isUser
                                            ? 'rounded-tr-xs bg-gradient-to-r from-orange-500 to-orange-600 text-white selection:bg-orange-700 selection:text-white'
                                            : 'rounded-tl-xs border border-slate-200/70 bg-slate-50 text-slate-800'
                                    }`}
                                >
                                    {isUser ? (
                                        <p className="whitespace-pre-wrap break-words">{m.content}</p>
                                    ) : (
                                        <div className="prose prose-sm max-w-none break-words text-slate-800 leading-relaxed text-sm [&>p]:mb-2 [&>p:last-child]:mb-0 [&>ul]:list-disc [&>ul]:pl-4 [&>ol]:list-decimal [&>ol]:pl-4">
                                            <ReactMarkdown>{m.content}</ReactMarkdown>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}

                {/* 正在思考 / 回复动画 */}
                {pending && (
                    <div className="flex items-start gap-2.5">
                        <TeacherAvatar size="sm" showOnlineStatus={false} isThinking={true} className="mt-0.5" />
                        <div className="flex flex-col items-start">
                            <span className="mb-1 px-1 text-[10px] text-slate-400 font-medium">{name}</span>
                            <div className="flex items-center gap-2 rounded-2xl rounded-tl-xs border border-orange-100 bg-orange-50/60 px-3.5 py-2.5 shadow-2xs text-xs text-orange-700">
                                <div className="flex items-center gap-1">
                                    <span className="h-1.5 w-1.5 rounded-full bg-orange-500 animate-bounce [animation-delay:-0.3s]" />
                                    <span className="h-1.5 w-1.5 rounded-full bg-orange-500 animate-bounce [animation-delay:-0.15s]" />
                                    <span className="h-1.5 w-1.5 rounded-full bg-orange-500 animate-bounce" />
                                </div>
                                <span className="font-medium">{name} 正在思考回复…</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* 错误提示 */}
            {error && (
                <div className="mx-3.5 mb-2 rounded-xl bg-red-50 px-3 py-1.5 text-xs text-red-600 border border-red-100 flex items-center justify-between">
                    <span>{error}</span>
                    <button type="button" onClick={() => setError('')} className="text-red-400 hover:text-red-600 underline">
                        关闭
                    </button>
                </div>
            )}

            {/* 底部输入框区 */}
            <div className="shrink-0 border-t border-slate-100 bg-white p-3 sm:p-3.5">
                <form
                    onSubmit={e => {
                        e.preventDefault();
                        void handleSend();
                    }}
                    className="relative rounded-xl border border-slate-200 bg-slate-50/60 p-2.5 transition-all focus-within:border-orange-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-orange-100"
                >
                    <textarea
                        ref={textareaRef}
                        aria-label="向老师提问"
                        maxLength={3000}
                        rows={2}
                        className="w-full resize-none border-0 bg-transparent p-0 text-sm text-slate-800 placeholder-slate-400 outline-none scrollbar-hide focus:ring-0 leading-relaxed"
                        placeholder="这句话为什么这样表达？"
                        value={text}
                        onChange={e => setText(e.target.value)}
                        onKeyDown={handleKeyDown}
                    />

                    <div className="mt-2 flex items-center justify-between pt-1 border-t border-slate-100/80">
                        <span className="text-[11px] text-slate-400">
                            按 <kbd className="font-sans text-slate-500 bg-slate-100 px-1 py-0.5 rounded text-[10px]">Enter</kbd> 发送
                        </span>

                        <button
                            type="submit"
                            disabled={busy || pending || sending || !text.trim()}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs whitespace-nowrap shrink-0 transition-all hover:bg-orange-600 active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
                        >
                            {sending ? (
                                <Loader2 size={13} className="animate-spin shrink-0 text-current" />
                            ) : (
                                <Send size={13} className="shrink-0 text-current" />
                            )}
                            <span>发送</span>
                        </button>
                    </div>
                </form>
            </div>
        </section>
    );
}
