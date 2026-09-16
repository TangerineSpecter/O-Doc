import {useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {AlertCircle, ArrowLeft, ChevronDown, ChevronUp, Copy, Check, RefreshCw} from 'lucide-react';

export interface ErrorStateProps {
    /** 错误标题，若不传则自动基于错误内容智能推断 */
    title?: string;
    /** 错误描述说明，若不传则自动基于错误内容生成友好建议 */
    description?: string;
    /** 错误信息或 Error 对象 */
    error?: unknown;
    /** 重试回调 */
    onRetry?: () => void | Promise<void>;
    /** 重试按钮文本，默认为 "重新加载" */
    retryText?: string;
    /** 返回操作回调，若与 backPath 同时提供则优先执行 onBack */
    onBack?: () => void;
    /** 返回路径，例如 "/books/collId" */
    backPath?: string;
    /** 返回按钮文本，默认为 "返回上一页" */
    backText?: string;
    /** 是否以整页居中容器方式呈现，默认为 true */
    fullPage?: boolean;
    /** 自定义外层样式类名 */
    className?: string;
}

function parseErrorInfo(error: unknown): {statusCode?: number; message: string; is500: boolean; is404: boolean; isNetwork: boolean} {
    let message = '';
    if (typeof error === 'string') {
        message = error;
    } else if (error instanceof Error) {
        message = error.message;
    } else if (typeof error === 'object' && error !== null) {
        const anyErr = error as {message?: string; msg?: string; status?: number; response?: {status?: number; data?: {msg?: string}}};
        message = anyErr.response?.data?.msg || anyErr.msg || anyErr.message || JSON.stringify(error);
    }

    const statusMatch = message.match(/(?:status code|code|status)\s*[:=]?\s*(4\d\d|5\d\d)/i);
    const statusCode = statusMatch ? parseInt(statusMatch[1], 10) : undefined;
    const is500 = statusCode === 500 || /500|Internal Server Error/i.test(message);
    const is404 = statusCode === 404 || /404|Not Found/i.test(message);
    const isNetwork = /Network Error|Failed to fetch|NetworkError/i.test(message);

    return {statusCode, message: message || '未知错误', is500, is404, isNetwork};
}

export function ErrorState({
    title,
    description,
    error,
    onRetry,
    retryText = '重新加载',
    onBack,
    backPath,
    backText = '返回上一页',
    fullPage = true,
    className = '',
}: ErrorStateProps) {
    const navigate = useNavigate();
    const [retrying, setRetrying] = useState(false);
    const [showDetails, setShowDetails] = useState(false);
    const [copied, setCopied] = useState(false);

    const info = parseErrorInfo(error);

    // 智能推断标题与描述
    let resolvedTitle = title;
    let resolvedDesc = description;

    if (!resolvedTitle) {
        if (info.is500) resolvedTitle = '服务响应异常 (500)';
        else if (info.is404) resolvedTitle = '内容未找到 (404)';
        else if (info.isNetwork) resolvedTitle = '网络连接异常';
        else resolvedTitle = '页面加载失败';
    }

    if (!resolvedDesc) {
        if (info.is500) resolvedDesc = '后端服务遇到临时异常，可能是接口暂时不可用或处于维护中。';
        else if (info.is404) resolvedDesc = '所请求的资源不存在或已被删除，请核对访问地址。';
        else if (info.isNetwork) resolvedDesc = '无法连接到服务器，请检查您的网络连接后重试。';
        else resolvedDesc = '暂时无法加载所需内容，您可以尝试刷新重试或返回。';
    }

    const handleRetry = async () => {
        if (!onRetry || retrying) return;
        setRetrying(true);
        try {
            await onRetry();
        } finally {
            setRetrying(false);
        }
    };

    const handleBack = () => {
        if (onBack) {
            onBack();
        } else if (backPath) {
            navigate(backPath);
        } else {
            navigate(-1);
        }
    };

    const handleCopyDetails = async () => {
        try {
            await navigator.clipboard.writeText(info.message);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // ignore
        }
    };

    const content = (
        <div
            role="alert"
            className={`relative mx-auto w-full max-w-lg rounded-2xl border border-slate-200/90 bg-white p-6 sm:p-8 text-center shadow-sm animate-in fade-in zoom-in-95 duration-200 ${className}`}
        >
            {/* 状态徽标 */}
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-100 bg-rose-50 text-rose-500 shadow-xs">
                <AlertCircle className="h-7 w-7" />
            </div>

            {/* 标题与描述 */}
            <h2 className="font-serif text-lg sm:text-xl font-bold tracking-tight text-slate-800">
                {resolvedTitle}
            </h2>
            <p className="mt-2 text-xs sm:text-sm leading-relaxed text-slate-500">
                {resolvedDesc}
            </p>

            {/* 技术错误详情 */}
            {info.message && (
                <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50/80 p-3 text-left">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-slate-400">
                            Error Details
                        </span>
                        <div className="flex items-center gap-1.5">
                            <button
                                type="button"
                                onClick={handleCopyDetails}
                                title="复制错误信息"
                                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-slate-400 hover:bg-slate-200/60 hover:text-slate-600 transition-colors"
                            >
                                {copied ? <Check className="h-3 w-3 text-lime-600" /> : <Copy className="h-3 w-3" />}
                                {copied ? '已复制' : '复制'}
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowDetails(v => !v)}
                                className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] text-slate-400 hover:bg-slate-200/60 hover:text-slate-600 transition-colors"
                            >
                                {showDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                {showDetails ? '收起' : '展开'}
                            </button>
                        </div>
                    </div>
                    <p
                        className={`mt-1.5 font-mono text-[11px] leading-relaxed text-rose-600 break-all select-all ${
                            showDetails ? '' : 'line-clamp-2'
                        }`}
                    >
                        {info.message}
                    </p>
                </div>
            )}

            {/* 操作按钮组 */}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                {onRetry && (
                    <button
                        type="button"
                        onClick={handleRetry}
                        disabled={retrying}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2 text-xs sm:text-sm font-medium text-white shadow-xs shadow-orange-500/20 transition-all hover:bg-orange-600 active:scale-95 disabled:opacity-50"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 ${retrying ? 'animate-spin' : ''}`} />
                        {retrying ? '正在重试...' : retryText}
                    </button>
                )}
                {(onBack || backPath) && (
                    <button
                        type="button"
                        onClick={handleBack}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs sm:text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
                    >
                        <ArrowLeft className="h-3.5 w-3.5 text-slate-400" />
                        {backText}
                    </button>
                )}
            </div>
        </div>
    );

    if (fullPage) {
        return (
            <main className="flex min-h-[calc(100vh-6rem)] w-full items-center justify-center bg-slate-50 px-4 py-10 sm:px-6">
                {content}
            </main>
        );
    }

    return content;
}

export default ErrorState;
