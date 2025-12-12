import {useEffect, useRef, useState} from 'react';
import {BookOpen, Bot, Minimize2, Send, Trash2, User, X} from 'lucide-react';

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

    // --- 最小化状态 ---
    if (isMinimized) {
        return (
            <div
                className="fixed right-0 top-1/2 -translate-y-1/2 z-[100] bg-gradient-to-r from-orange-500 to-orange-600 text-white p-3 rounded-l-xl shadow-lg cursor-pointer hover:w-14 transition-all w-12 flex flex-col items-center gap-2 group border-y border-l border-white/20"
                onClick={() => setIsMinimized(false)}
                title="展开 AI 对话"
            >
                <Bot className="w-6 h-6 animate-pulse"/>
                <span
                    className="text-[10px] font-bold writing-vertical-rl tracking-widest opacity-80 group-hover:opacity-100">AI对话</span>
            </div>
        );
    }

    // --- 正常窗口状态 ---
    return (
        <div
            className="fixed right-6 bottom-6 w-[380px] h-[600px] bg-white rounded-2xl shadow-2xl border border-slate-200 z-[100] flex flex-col animate-in slide-in-from-bottom-10 duration-300 ring-1 ring-slate-900/5">
            {/* Header */}
            <div
                className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/80 backdrop-blur-sm rounded-t-2xl">
                <div className="flex items-center gap-2 text-slate-800 font-bold">
                    <div className="p-1.5 bg-orange-100 text-orange-600 rounded-lg">
                        <Bot className="w-4 h-4"/>
                    </div>
                    <span>小橘 AI助手</span>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={handleClearMessages}
                        className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-orange-600 transition-colors mr-1"
                        title="清空会话"
                    >
                        <Trash2 className="w-4 h-4"/>
                    </button>
                    <button
                        onClick={() => setIsMinimized(true)}
                        className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
                        title="最小化"
                    >
                        <Minimize2 className="w-4 h-4"/>
                    </button>
                    <button
                        onClick={onClose}
                        className="p-1.5 hover:bg-red-50 hover:text-red-500 rounded-lg text-slate-400 transition-colors"
                        title="关闭"
                    >
                        <X className="w-4 h-4"/>
                    </button>
                </div>
            </div>

            {/* Chat Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-5 bg-slate-50/30 scroll-smooth">
                {messages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4 -mt-8">
                        <div
                            className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center">
                            <Bot className="w-8 h-8 text-orange-500"/>
                        </div>
                        <div className="text-center space-y-1">
                            <p className="font-medium text-slate-600">有什么可以帮你的吗？</p>
                            <p className="text-xs">支持搜索文档、解答问题、代码生成</p>
                        </div>
                    </div>
                )}

                {messages.map((msg, idx) => (
                    <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                        <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border shadow-sm ${
                                msg.role === 'user'
                                    ? 'bg-white text-slate-600 border-slate-200'
                                    : 'bg-orange-100 text-orange-600 border-orange-200'
                            }`}>
                            {msg.role === 'user' ? <User className="w-4 h-4"/> : <Bot className="w-4 h-4"/>}
                        </div>

                        <div className={`max-w-[80%] px-4 py-2.5 text-sm leading-relaxed shadow-sm break-words ${
                            msg.role === 'user'
                                ? 'bg-slate-800 text-white rounded-2xl rounded-tr-none'
                                : 'bg-white border border-slate-100 text-slate-700 rounded-2xl rounded-tl-none'
                        }`}>
                            {msg.content}
                            {/* 这里保留了：仅当正在等待后端响应且内容还没出来时，显示3个跳动小点 */}
                            {msg.role === 'assistant' && isLoading && msg.content.length === 0 && (
                                <span className="flex gap-1 items-center h-5">
                                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></span>
                                    <span
                                        className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-75"></span>
                                    <span
                                        className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-150"></span>
                                </span>
                            )}
                            {/* 原来的光标逻辑已被删除 */}
                        </div>
                    </div>
                ))}
                <div ref={messagesEndRef}/>
            </div>

            {/* Footer */}
            <div className="p-4 bg-white border-t border-slate-100 rounded-b-2xl">
                <div className="flex items-center justify-between mb-3 px-1">
                    <button
                        onClick={() => setUseKb(!useKb)}
                        className={`text-[10px] font-medium flex items-center gap-1.5 px-2.5 py-1 rounded-md border transition-all ${
                            useKb
                                ? 'bg-blue-50 text-blue-600 border-blue-200 shadow-sm'
                                : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                        }`}
                    >
                        <BookOpen className="w-3 h-3"/>
                        {useKb ? '知识库模式：已开启' : '知识库模式：未开启'}
                    </button>
                    <span className="text-[10px] text-slate-300 font-mono">Model: Auto</span>
                </div>

                <div
                    className="flex items-center gap-2 p-1.5 bg-slate-50 border border-slate-200 rounded-xl focus-within:ring-2 focus-within:ring-orange-500/20 focus-within:border-orange-500 transition-all">
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                        placeholder="输入问题，Enter 发送..."
                        className="flex-1 bg-transparent border-none focus:ring-0 text-sm px-3 py-2 resize-none h-[44px] max-h-[120px] overflow-y-auto scrollbar-hide outline-none leading-relaxed"
                    />
                    <button
                        onClick={handleSend}
                        disabled={isLoading || !input.trim()}
                        className="shrink-0 p-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm active:scale-95 flex items-center justify-center"
                        style={{height: '32px', width: '32px'}}
                    >
                        <Send className="w-3.5 h-3.5"/>
                    </button>
                </div>
            </div>
        </div>
    );
};