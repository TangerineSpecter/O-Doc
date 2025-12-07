import React from 'react';
import { AlertTriangle, Info, X, Loader2 } from 'lucide-react';

type ModalType = 'danger' | 'warning' | 'info';

interface ConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void | Promise<void>;
    title: string;
    description: React.ReactNode; // 支持传入 JSX 以便自定义样式（如加粗）
    confirmText?: string;
    cancelText?: string;
    type?: ModalType;
    isLoading?: boolean;
}

const TYPE_CONFIG = {
    danger: {
        icon: <AlertTriangle className="w-5 h-5 text-red-600" />,
        bg: 'bg-red-100',
        btnBg: 'bg-red-600 hover:bg-red-700',
        btnText: 'text-white'
    },
    warning: {
        icon: <AlertTriangle className="w-5 h-5 text-orange-600" />,
        bg: 'bg-orange-100',
        btnBg: 'bg-orange-500 hover:bg-orange-600',
        btnText: 'text-white'
    },
    info: {
        icon: <Info className="w-5 h-5 text-blue-600" />,
        bg: 'bg-blue-100',
        btnBg: 'bg-blue-600 hover:bg-blue-700',
        btnText: 'text-white'
    }
};

export default function ConfirmationModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    description,
    confirmText = '确认',
    cancelText = '取消',
    type = 'danger',
    isLoading = false
}: ConfirmationModalProps) {
    if (!isOpen) return null;

    const config = TYPE_CONFIG[type];

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 animate-in fade-in duration-200">
            {/* Backdrop */}
            <div 
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" 
                onClick={() => !isLoading && onClose()}
            ></div>

            {/* Modal Content */}
            <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-2 duration-200" onClick={e => e.stopPropagation()}>
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
                        <div className={`w-10 h-10 rounded-full ${config.bg} flex items-center justify-center flex-shrink-0`}>
                            {config.icon}
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-slate-900">{title}</h3>
                        </div>
                    </div>
                    
                    <div className="text-sm text-slate-600 mb-6 leading-relaxed ml-1">
                        {description}
                    </div>

                    <div className="flex justify-end gap-3">
                        <button
                            onClick={onClose}
                            disabled={isLoading}
                            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
                        >
                            {cancelText}
                        </button>
                        <button
                            onClick={onConfirm}
                            disabled={isLoading}
                            className={`px-4 py-2 text-sm font-medium rounded-lg shadow-sm disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2 ${config.btnBg} ${config.btnText}`}
                        >
                            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                            {confirmText}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}