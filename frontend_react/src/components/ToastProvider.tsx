// src/components/ToastProvider.tsx
import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Info, XCircle, Leaf, Citrus, AlertTriangle } from 'lucide-react';

// --- Toast 提示组件 ---

// --- 类型定义 ---
type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
    id: number;
    message: string;
    type: ToastType;
    isVisible: boolean;
}

interface ToastContextType {
    showToast: (message: string, type?: ToastType) => void;
    success: (message: string) => void;
    error: (message: string) => void;
    warning: (message: string) => void;
    info: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

// --- 🎨 沉浸质感配色 (微渐变 + 内高光 + 彩色阴影) ---
const TOAST_STYLES = {
    // 成功：翡翠绿 (Emerald) - 沉稳且高级
    success: {
        container: 'bg-gradient-to-r from-emerald-500 to-emerald-600 shadow-emerald-500/40 ring-emerald-400',
        icon: <Leaf className="w-5 h-5 text-white" strokeWidth={2.5} />, 
    },
    // 警告：琥珀橙 (Amber/Orange) - 活力且醒目
    warning: {
        container: 'bg-gradient-to-r from-orange-500 to-orange-600 shadow-orange-500/40 ring-orange-400',
        icon: <Citrus className="w-5 h-5 text-white" strokeWidth={2.5} />, 
    },
    // 错误：玫瑰红 (Rose) - 柔和但有力
    error: {
        container: 'bg-gradient-to-r from-rose-500 to-rose-600 shadow-rose-500/40 ring-rose-400',
        icon: <XCircle className="w-5 h-5 text-white" strokeWidth={2.5} />, 
    },
    // 信息：海洋蓝 (Sky/Blue)
    info: {
        container: 'bg-gradient-to-r from-blue-500 to-blue-600 shadow-blue-500/40 ring-blue-400',
        icon: <Info className="w-5 h-5 text-white" strokeWidth={2.5} />, 
    }
};

export const ToastProvider = ({ children }: { children: ReactNode }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const removeToast = useCallback((id: number) => {
        setToasts((prev) => prev.map(t => t.id === id ? { ...t, isVisible: false } : t));
        setTimeout(() => {
            setToasts((prev) => prev.filter((toast) => toast.id !== id));
        }, 300);
    }, []);

    const showToast = useCallback((message: string, type: ToastType = 'info') => {
        const id = Date.now();
        setToasts((prev) => {
            const newToast = { id, message, type, isVisible: true };
            if (prev.length >= 3) {
                return [...prev.slice(1), newToast];
            }
            return [...prev, newToast];
        });

        // 3秒自动消失
        setTimeout(() => {
            removeToast(id);
        }, 3000);
    }, [removeToast]);

    const success = (msg: string) => showToast(msg, 'success');
    const error = (msg: string) => showToast(msg, 'error');
    const warning = (msg: string) => showToast(msg, 'warning');
    const info = (msg: string) => showToast(msg, 'info');

    return (
        <ToastContext.Provider value={{ showToast, success, error, warning, info }}>
            {children}
            
            {/* 容器：顶部居中 */}
            <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-3 pointer-events-none items-center w-full max-w-sm px-4">
                {toasts.map((toast) => {
                    const style = TOAST_STYLES[toast.type];
                    
                    return (
                        <div
                            key={toast.id}
                            onClick={() => removeToast(toast.id)} // 点击卡片即关闭
                            className={`
                                pointer-events-auto cursor-pointer
                                flex items-center gap-3.5 px-5 py-3.5
                                rounded-xl 
                                shadow-lg
                                ring-1 ring-inset ring-white/10 
                                transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] origin-top
                                hover:scale-[1.02] active:scale-95
                                text-white
                                ${style.container}
                                ${toast.isVisible 
                                    ? 'translate-y-0 opacity-100 scale-100' 
                                    : '-translate-y-8 opacity-0 scale-95'
                                }
                            `}
                        >
                            {/* 图标 (无背景，直接展示，更通透) */}
                            <div className="shrink-0 drop-shadow-md">
                                {style.icon}
                            </div>

                            {/* 文本内容 */}
                            <div className="flex-1 min-w-0">
                                <p className="text-[15px] font-bold leading-none tracking-wide drop-shadow-sm">
                                    {toast.message}
                                </p>
                            </div>
                        </div>
                    );
                })}
            </div>
        </ToastContext.Provider>
    );
};

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};