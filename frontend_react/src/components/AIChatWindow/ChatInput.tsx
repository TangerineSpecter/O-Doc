// frontend_react/src/components/AIChatWindow/ChatInput.tsx

import { type KeyboardEvent, useEffect, useRef } from 'react';
import { Send } from 'lucide-react';

interface ChatInputProps {
    input: string;
    setInput: (value: string) => void;
    isLoading: boolean;
    onSend: (msg: string) => void;
}

export const ChatInput = ({
    input,
    setInput,
    isLoading,
    onSend,
}: ChatInputProps) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const handleSendClick = () => {
        if (!input.trim() || isLoading) return;
        onSend(input);
        setInput('');
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendClick();
        }
    };

    // 动态根据输入内容自适应高度，单行保持精致紧凑与垂直居中
    useEffect(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = 'auto';
        const minHeight = 36;
        const maxHeight = 160;
        const nextHeight = Math.min(Math.max(el.scrollHeight, minHeight), maxHeight);
        el.style.height = `${nextHeight}px`;
    }, [input]);

    return (
        <div className="relative group">
            <div className="absolute inset-0 bg-orange-500/5 rounded-2xl blur opacity-0 group-focus-within:opacity-100 transition-opacity" />
            <div className="relative flex items-end gap-2 p-1.5 bg-slate-50 border border-slate-200 rounded-2xl focus-within:ring-2 focus-within:ring-orange-500/10 focus-within:border-orange-400 focus-within:bg-white transition-all shadow-sm">
                <textarea
                    ref={textareaRef}
                    rows={1}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="输入您的问题..."
                    className="flex-1 bg-transparent border-none focus:ring-0 text-sm sm:text-[15px] px-3 py-1.5 resize-none h-[36px] max-h-[160px] overflow-y-auto scrollbar-hide outline-none leading-normal placeholder:text-slate-400"
                />
                <button
                    onClick={handleSendClick}
                    disabled={isLoading || !input.trim()}
                    className="shrink-0 mb-0.5 p-2 bg-orange-500 text-white rounded-xl hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shadow-orange-500/20 active:scale-95 flex items-center justify-center group/btn"
                >
                    <Send className="w-4 h-4 group-hover/btn:translate-x-0.5 transition-transform" />
                </button>
            </div>
        </div>
    );
};
