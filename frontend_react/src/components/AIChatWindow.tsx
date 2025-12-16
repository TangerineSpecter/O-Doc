// frontend_react/src/components/AIChatWindow.tsx

import {useEffect, useRef, useState} from 'react';
import {BookOpen, Bot, Maximize2, Minimize2, Send, Trash2, User, X} from 'lucide-react';

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

interface AIChatWindowProps {
    isOpen: boolean;
    onClose: () => void;
}

export const AIChatWindow = ({isOpen, onClose}: AIChatWindowProps) => {
    // 窗口状态
    const [isMinimized, setIsMinimized] = useState(false);

    // 对话状态
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [useKb, setUseKb] = useState(false);

    // --- 平滑输出相关的 Refs ---
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const tokenQueueRef = useRef<string[]>([]); // 字符缓冲队列
    const isThinkingRef = useRef(false); // 标记是否正在输出中

    // --- 核心逻辑 1: 平滑输出定时器 ---
    useEffect(() => {
        const interval = setInterval(() => {
            if (tokenQueueRef.current.length > 0) {
                const nextChars = tokenQueueRef.current.splice(0, 2).join('');

                setMessages(prev => {
                    const newMsgs = [...prev];
                    const lastMsg = newMsgs[newMsgs.length - 1];
                    if (lastMsg && lastMsg.role === 'assistant') {
                        lastMsg.content += nextChars;
                    }
                    return newMsgs;
                });
            }
        }, 30);

        return () => clearInterval(interval);
    }, []);

    // 自动滚动到底部
    useEffect(() => {
        if (!isMinimized && isOpen) {
            messagesEndRef.current?.scrollIntoView({behavior: "smooth"});
        }
    }, [messages, isMinimized, isOpen]);

    // 清空消息
    const handleClearMessages = () => {
        tokenQueueRef.current = [];
        if (messages.length > 0 && confirm('确定要清空当前对话记录吗？')) {
            setMessages([]);
        }
    };

    // 发送消息处理
    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const userMsg = input;
        setInput('');

        setMessages(prev => [...prev, {role: 'user', content: userMsg}]);
        setIsLoading(true);
        isThinkingRef.current = true;

        setMessages(prev => [...prev, {role: 'assistant', content: ''}]);

        try {
            const response = await fetch('/api/ai/chat/', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    message: userMsg,
                    history: messages.map(m => ({role: m.role, content: m.content})),
                    use_knowledge_base: useKb
                })
            });

            if (!response.body) throw new Error("No response body");

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const {done, value} = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, {stream: true});
                tokenQueueRef.current.push(...chunk.split(''));
            }
        } catch (error) {
            console.error(error);
            setMessages(prev => {
                const newMsgs = [...prev];
                newMsgs[newMsgs.length - 1].content = '网络连接异常，请检查后端服务。';
                return newMsgs;
            });
        } finally {
            setIsLoading(false);
            isThinkingRef.current = false;
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
        // 1. 添加全屏遮罩层，实现居中
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/20 backdrop-blur-[2px] animate-in fade-in duration-200">

            {/* 2. 主对话框容器：大幅增加宽高 */}
            <div
                className="relative w-[900px] max-w-[95vw] h-[80vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 ring-1 ring-slate-900/5 overflow-hidden"
                onClick={(e) => e.stopPropagation()} // 防止点击对话框关闭遮罩
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
                            className="p-2 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-orange-600 transition-colors mr-1"
                            title="清空会话"
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
                <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/30 scroll-smooth">
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
                            <div
                                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border shadow-sm ${
                                    msg.role === 'user'
                                        ? 'bg-white text-slate-600 border-slate-200'
                                        : 'bg-orange-100 text-orange-600 border-orange-200'
                                }`}>
                                {msg.role === 'user' ? <User className="w-5 h-5"/> : <Bot className="w-5 h-5"/>}
                            </div>

                            <div
                                className={`max-w-[85%] px-5 py-3.5 text-[15px] leading-relaxed shadow-sm break-words ${
                                    msg.role === 'user'
                                        ? 'bg-slate-800 text-white rounded-2xl rounded-tr-none'
                                        : 'bg-white border border-slate-100 text-slate-700 rounded-2xl rounded-tl-none'
                                }`}>
                                {msg.content}
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
                    <div ref={messagesEndRef}/>
                </div>

                {/* Footer */}
                <div className="p-5 bg-white border-t border-slate-100">
                    <div className="flex items-center justify-between mb-3 px-1">
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