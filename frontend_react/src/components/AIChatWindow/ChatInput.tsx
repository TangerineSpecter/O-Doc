// frontend_react/src/components/AIChatWindow/ChatInput.tsx

import { type ClipboardEvent, type DragEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Send, Image as ImageIcon, X, UploadCloud } from 'lucide-react';
import { processImageFile, validateImageFile, MAX_CHAT_IMAGES } from './utils/imageProcess';

interface ChatInputProps {
    input: string;
    setInput: (value: string) => void;
    isLoading: boolean;
    onSend: (msg: string, images?: string[]) => void;
}

export const ChatInput = ({
    input,
    setInput,
    isLoading,
    onSend,
}: ChatInputProps) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [images, setImages] = useState<string[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [isProcessingImage, setIsProcessingImage] = useState(false);

    const handleAddFiles = async (files: FileList | File[]) => {
        const fileArr = Array.from(files);
        const imageFiles = fileArr.filter(file => file.type.startsWith('image/'));
        if (imageFiles.length === 0) return;

        const remainingSlots = MAX_CHAT_IMAGES - images.length;
        if (remainingSlots <= 0) return;

        const toProcess = imageFiles.slice(0, remainingSlots);
        setIsProcessingImage(true);
        try {
            const processedList: string[] = [];
            for (const file of toProcess) {
                const validation = validateImageFile(file);
                if (!validation.valid) continue;
                const dataUrl = await processImageFile(file);
                processedList.push(dataUrl);
            }
            if (processedList.length > 0) {
                setImages(prev => [...prev, ...processedList].slice(0, MAX_CHAT_IMAGES));
            }
        } catch (err) {
            console.error('处理图片失败:', err);
        } finally {
            setIsProcessingImage(false);
        }
    };

    const handleRemoveImage = (index: number) => {
        setImages(prev => prev.filter((_, i) => i !== index));
    };

    const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
        const items = e.clipboardData?.items;
        if (!items) return;

        const pastedImageFiles: File[] = [];
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (file) {
                    pastedImageFiles.push(file);
                }
            }
        }

        if (pastedImageFiles.length > 0) {
            e.preventDefault();
            void handleAddFiles(pastedImageFiles);
        }
    };

    const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isDragging) setIsDragging(true);
    };

    const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        // 确保真正离开容器时才取消高亮
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setIsDragging(false);
    };

    const handleDrop = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
            void handleAddFiles(e.dataTransfer.files);
        }
    };

    const handleSendClick = () => {
        const trimmed = input.trim();
        if ((!trimmed && images.length === 0) || isLoading || isProcessingImage) return;

        onSend(trimmed, images.length > 0 ? images : undefined);
        setInput('');
        setImages([]);
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

    const canSend = (input.trim().length > 0 || images.length > 0) && !isLoading && !isProcessingImage;

    return (
        <div
            className="relative group"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {/* 隐藏的图片选择 input */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                    if (e.target.files) {
                        void handleAddFiles(e.target.files);
                        e.target.value = '';
                    }
                }}
            />

            {/* 拖拽进入时的指示高亮 */}
            {isDragging && (
                <div className="absolute inset-0 z-20 flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-orange-400 bg-orange-50/90 text-sm font-medium text-orange-600 backdrop-blur-sm pointer-events-none transition-all">
                    <UploadCloud className="w-5 h-5 animate-bounce" />
                    <span>松开鼠标添加图片（最多 {MAX_CHAT_IMAGES} 张）</span>
                </div>
            )}

            <div className="absolute inset-0 bg-orange-500/5 rounded-2xl blur opacity-0 group-focus-within:opacity-100 transition-opacity pointer-events-none" />

            <div className="relative flex flex-col p-1.5 bg-slate-50 border border-slate-200 rounded-2xl focus-within:ring-2 focus-within:ring-orange-500/10 focus-within:border-orange-400 focus-within:bg-white transition-all shadow-sm">
                {/* 待发送图片缩略图列表 */}
                {images.length > 0 && (
                    <div className="flex items-center gap-2 px-2 pt-1 pb-2 overflow-x-auto scrollbar-hide border-b border-slate-200/60 mb-1">
                        {images.map((imgUrl, idx) => (
                            <div
                                key={idx}
                                className="relative group/thumb shrink-0 w-14 h-14 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 shadow-xs"
                            >
                                <img
                                    src={imgUrl}
                                    alt={`待发送图片 ${idx + 1}`}
                                    className="w-full h-full object-cover"
                                />
                                <button
                                    type="button"
                                    onClick={() => handleRemoveImage(idx)}
                                    title="移除图片"
                                    className="absolute top-1 right-1 p-0.5 rounded-full bg-black/60 hover:bg-black/80 text-white transition-all opacity-80 hover:opacity-100"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                        ))}
                        {images.length < MAX_CHAT_IMAGES && (
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                title="继续添加图片"
                                className="shrink-0 w-14 h-14 rounded-xl border border-dashed border-slate-300 hover:border-orange-400 bg-slate-50/80 hover:bg-orange-50/50 flex flex-col items-center justify-center text-slate-400 hover:text-orange-500 transition-all text-[11px] gap-0.5"
                            >
                                <ImageIcon className="w-4 h-4" />
                                <span className="text-[10px] scale-90">添加</span>
                            </button>
                        )}
                    </div>
                )}

                <div className="flex items-end gap-1.5 w-full">
                    {/* 上传图片按钮 */}
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isLoading || isProcessingImage || images.length >= MAX_CHAT_IMAGES}
                        title="上传图片（可多选，或截图直接粘贴/拖拽入框）"
                        className="shrink-0 mb-0.5 p-2 text-slate-400 hover:text-orange-500 hover:bg-orange-50/80 rounded-xl transition-all disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400 flex items-center justify-center"
                    >
                        <ImageIcon className="w-4 h-4" />
                    </button>

                    <textarea
                        ref={textareaRef}
                        rows={1}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onPaste={handlePaste}
                        placeholder={images.length > 0 ? "向 AI 提问关于图片的内容（或直接按回车发送）..." : "输入您的问题（支持复制截图、拖拽或点击图标发图）..."}
                        className="flex-1 bg-transparent border-none focus:ring-0 text-sm sm:text-[15px] px-2 py-1.5 resize-none h-[36px] max-h-[160px] overflow-y-auto scrollbar-hide outline-none leading-normal placeholder:text-slate-400"
                    />

                    <button
                        onClick={handleSendClick}
                        disabled={!canSend}
                        className="shrink-0 mb-0.5 p-2 bg-orange-500 text-white rounded-xl hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shadow-orange-500/20 active:scale-95 flex items-center justify-center group/btn"
                    >
                        <Send className="w-4 h-4 group-hover/btn:translate-x-0.5 transition-transform" />
                    </button>
                </div>
            </div>
        </div>
    );
};

