import { useState, useEffect } from 'react';
import { X, Globe, Sparkles, Loader2, Link as LinkIcon } from 'lucide-react';

interface SaveWebpageModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (url: string, needPolishing: boolean) => Promise<void>;
}

export default function SaveWebpageModal({ isOpen, onClose, onConfirm }: SaveWebpageModalProps) {
    const [url, setUrl] = useState('');
    const [needPolishing, setNeedPolishing] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    // 重置状态
    useEffect(() => {
        if (isOpen) {
            setUrl('');
            setNeedPolishing(false);
            setIsLoading(false);
            setError('');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSubmit = async () => {
        if (!url.trim()) {
            setError('请输入有效的网址');
            return;
        }
        // 简单的 URL 校验
        if (!/^http(s)?:\/\//.test(url)) {
            setError('网址必须以 http:// 或 https:// 开头');
            return;
        }

        try {
            setIsLoading(true);
            setError('');
            await onConfirm(url, needPolishing);
            // 注意：关闭 Modal 由父组件控制或在成功后自动关闭
        } catch (e) {
            // 错误处理由父组件 Toast 负责，这里主要负责按钮状态恢复
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity"
                onClick={!isLoading ? onClose : undefined}
            />

            {/* Modal Content */}
            <div className="relative w-full max-w-md bg-white rounded-xl shadow-2xl border border-slate-100 overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-blue-100 text-blue-600 rounded-lg">
                            <Globe size={18} />
                        </div>
                        <h3 className="font-bold text-slate-800">保存网页到知识库</h3>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={isLoading}
                        className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded-full transition-colors disabled:opacity-50"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-5">
                    {/* URL Input */}
                    <div className="space-y-1.5">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                            目标网址 <span className="text-red-500">*</span>
                        </label>
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <LinkIcon size={16} className="text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                            </div>
                            <input
                                type="url"
                                value={url}
                                onChange={(e) => {
                                    setUrl(e.target.value);
                                    if (error) setError('');
                                }}
                                placeholder="https://example.com/article..."
                                className={`w-full pl-9 pr-4 py-2.5 bg-slate-50 border rounded-lg text-sm outline-none transition-all ${error
                                        ? 'border-red-300 focus:border-red-500 focus:ring-4 focus:ring-red-500/10'
                                        : 'border-slate-200 hover:border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10'
                                    }`}
                                autoFocus
                            />
                        </div>
                        {error && <p className="text-xs text-red-500 font-medium ml-1">{error}</p>}
                    </div>

                    {/* Options */}
                    <div
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${needPolishing
                                ? 'bg-purple-50 border-purple-200 shadow-sm'
                                : 'bg-white border-slate-200 hover:border-slate-300'
                            }`}
                        onClick={() => !isLoading && setNeedPolishing(!needPolishing)}
                    >
                        <div className={`flex items-center justify-center w-5 h-5 rounded border transition-colors ${needPolishing ? 'bg-purple-500 border-purple-500 text-white' : 'bg-white border-slate-300'
                            }`}>
                            {needPolishing && <Sparkles size={12} />}
                        </div>
                        <div className="flex-1">
                            <div className={`text-sm font-medium ${needPolishing ? 'text-purple-700' : 'text-slate-700'}`}>
                                AI 智能润色
                            </div>
                            <div className="text-xs text-slate-400 mt-0.5">
                                自动提取正文、优化排版并生成摘要
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        disabled={isLoading}
                        className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-white hover:border-slate-300 border border-transparent rounded-lg transition-all disabled:opacity-50"
                    >
                        取消
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isLoading}
                        className="flex items-center gap-2 px-6 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 active:bg-black rounded-lg shadow-md hover:shadow-lg transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {isLoading ? <Loader2 size={16} className="animate-spin" /> : null}
                        {isLoading ? '解析中...' : '开始保存'}
                    </button>
                </div>
            </div>
        </div>
    );
}