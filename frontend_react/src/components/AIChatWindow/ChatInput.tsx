// frontend_react/src/components/AIChatWindow/ChatInput.tsx

import { type KeyboardEvent } from 'react';
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

    return (
        <div className="relative group">
            <div className="absolute inset-0 bg-orange-500/5 rounded-2xl blur opacity-0 group-focus-within:opacity-100 transition-opacity" />
            <div className="relative flex items-end gap-2 p-2 bg-slate-50 border border-slate-200 rounded-2xl focus-within:ring-2 focus-within:ring-orange-500/10 focus-within:border-orange-400 focus-within:bg-white transition-all shadow-sm">
                <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="输入您的问题..."
                    className="flex-1 bg-transparent border-none focus:ring-0 text-base px-3 py-2 resize-none h-[52px] max-h-[200px] overflow-y-auto scrollbar-hide outline-none leading-relaxed placeholder:text-slate-400"
                />
                <button
                    onClick={handleSendClick}
                    disabled={isLoading || !input.trim()}
                    className="shrink-0 mb-0.5 p-2.5 bg-orange-500 text-white rounded-xl hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shadow-orange-500/20 active:scale-95 flex items-center justify-center group/btn"
                >
                    <Send className="w-5 h-5 group-hover/btn:translate-x-0.5 transition-transform" />
                </button>
            </div>
        </div>
    );
};
