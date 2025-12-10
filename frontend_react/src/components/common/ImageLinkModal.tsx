import React, { useState } from 'react';
import { ImageIcon, X, Loader2 } from 'lucide-react';

interface ImageLinkModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (url: string, altText: string) => void;
}

export default function ImageLinkModal({
    isOpen,
    onClose,
    onConfirm
}: ImageLinkModalProps) {
    const [url, setUrl] = useState('https://');
    const [altText, setAltText] = useState('图片');
    const [isLoading, setIsLoading] = useState(false);

    if (!isOpen) return null;

    const handleConfirm = async () => {
        if (!url.trim()) return;
        
        setIsLoading(true);
        try {
            // 简单的URL验证
            new URL(url);
            onConfirm(url, altText);
        } catch (error) {
            alert('请输入有效的图片URL');
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleConfirm();
        }
    };

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 animate-in fade-in duration-200">
            {/* Backdrop */}
            <div 
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" 
                onClick={() => !isLoading && onClose()}
            ></div>

            {/* Modal Content */}
            <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-2 duration-200" onClick={e => e.stopPropagation()}>
                {/* Close Button */}
                <button 
                    onClick={onClose} 
                    disabled={isLoading}
                    className="absolute top-4 right-4 p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>

                <div className="p-6">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                            <ImageIcon className="w-5 h-5 text-orange-600" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-slate-900">插入图片链接</h3>
                        </div>
                    </div>
                    
                    <div className="space-y-4 mb-6">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">图片地址</label>
                            <input
                                type="url"
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                onKeyPress={handleKeyPress}
                                disabled={isLoading}
                                placeholder="https://"
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">图片描述</label>
                            <input
                                type="text"
                                value={altText}
                                onChange={(e) => setAltText(e.target.value)}
                                onKeyPress={handleKeyPress}
                                disabled={isLoading}
                                placeholder="图片"
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-3">
                        <button
                            onClick={onClose}
                            disabled={isLoading}
                            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
                        >
                            取消
                        </button>
                        <button
                            onClick={handleConfirm}
                            disabled={isLoading || !url.trim()}
                            className="px-4 py-2 text-sm font-medium rounded-lg shadow-sm disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white"
                        >
                            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                            确认
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}