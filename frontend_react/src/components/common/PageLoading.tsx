import { Loader2 } from 'lucide-react';

interface PageLoadingProps {
    /** 加载提示文案，例如 "正在加载闪念..." */
    message?: string;
    /** 容器最小高度，默认 'min-h-[360px]' */
    minHeight?: string;
    /** 图标尺寸大小 */
    size?: 'sm' | 'md' | 'lg';
    /** 外部自定义 class */
    className?: string;
}

export default function PageLoading({
    message = '正在加载...',
    minHeight = 'min-h-[360px]',
    size = 'md',
    className = '',
}: PageLoadingProps) {
    const sizeClasses = {
        sm: 'w-6 h-6',
        md: 'w-8 h-8',
        lg: 'w-10 h-10',
    };

    return (
        <div className={`w-full flex items-center justify-center py-12 ${minHeight} ${className}`}>
            <div className="flex flex-col items-center gap-3">
                <Loader2 className={`${sizeClasses[size] || sizeClasses.md} text-orange-500 animate-spin`} />
                {message && (
                    <p className="text-slate-400 text-sm font-medium tracking-wide">
                        {message}
                    </p>
                )}
            </div>
        </div>
    );
}
