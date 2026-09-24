import {useCallback, useEffect, useState} from 'react';
import {Download, ImageOff, RotateCcw, X, ZoomIn, ZoomOut} from 'lucide-react';
import {downloadResource} from '../../api/resources';

interface Props {
    open: boolean;
    resourceId?: string;
    imageUrl?: string;
    alt?: string;
    title?: string;
    onClose: () => void;
}

export default function ImageLightboxModal({open, resourceId, imageUrl, alt = '查看原图', title, onClose}: Props) {
    const [blobUrl, setBlobUrl] = useState<string>('');
    const [loading, setLoading] = useState<boolean>(false);
    const [failed, setFailed] = useState<boolean>(false);
    const [scale, setScale] = useState<number>(1);

    // 加载图片资源
    useEffect(() => {
        if (!open) {
            setScale(1);
            return;
        }

        if (imageUrl) {
            setBlobUrl(imageUrl);
            setLoading(false);
            setFailed(false);
            return;
        }

        if (!resourceId) {
            setBlobUrl('');
            return;
        }

        let active = true;
        let createdUrl = '';
        setLoading(true);
        setFailed(false);

        void downloadResource(resourceId)
            .then(blob => {
                if (!active) return;
                createdUrl = URL.createObjectURL(blob);
                setBlobUrl(createdUrl);
                setLoading(false);
            })
            .catch(() => {
                if (!active) return;
                setFailed(true);
                setLoading(false);
            });

        return () => {
            active = false;
            if (createdUrl) {
                URL.revokeObjectURL(createdUrl);
            }
        };
    }, [open, resourceId, imageUrl]);

    // 快捷键监听（使用捕获阶段优先拦截 Esc，避免下层弹窗/抽屉误关）
    useEffect(() => {
        if (!open) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
                onClose();
            } else if (event.key === '+' || event.key === '=') {
                setScale(s => Math.min(3, +(s + 0.25).toFixed(2)));
            } else if (event.key === '-') {
                setScale(s => Math.max(0.5, +(s - 0.25).toFixed(2)));
            } else if (event.key === '0') {
                setScale(1);
            }
        };
        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [open, onClose]);

    const handleZoomIn = useCallback(() => {
        setScale(s => Math.min(3, +(s + 0.25).toFixed(2)));
    }, []);

    const handleZoomOut = useCallback(() => {
        setScale(s => Math.max(0.5, +(s - 0.25).toFixed(2)));
    }, []);

    const handleResetZoom = useCallback(() => {
        setScale(1);
    }, []);

    const handleToggleZoom = useCallback(() => {
        setScale(s => (s > 1 ? 1 : 1.75));
    }, []);

    const handleDownload = useCallback(() => {
        if (!blobUrl) return;
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `${title || alt || 'prompt-image'}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }, [blobUrl, title, alt]);

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[130] flex flex-col items-center justify-between bg-slate-950/80 backdrop-blur-md p-3 sm:p-5 select-none animate-in fade-in duration-200"
            onClick={onClose}
        >
            {/* 顶部工具栏 */}
            <div
                className="w-full max-w-5xl flex items-center justify-between text-white py-2 px-3 sm:px-4 bg-slate-900/60 backdrop-blur rounded-2xl border border-white/10 shadow-lg z-10 shrink-0"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center gap-2.5 min-w-0 pr-4">
                    <span className="shrink-0 px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 text-[11px] font-semibold border border-orange-500/30">
                        高清原图
                    </span>
                    <h3 className="text-xs sm:text-sm font-semibold truncate text-slate-100">
                        {title || alt}
                    </h3>
                </div>

                <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                    <div className="flex items-center rounded-xl bg-white/10 p-0.5 border border-white/5">
                        <button
                            type="button"
                            onClick={handleZoomOut}
                            disabled={scale <= 0.5}
                            className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                            title="缩小 (-)"
                        >
                            <ZoomOut className="h-4 w-4"/>
                        </button>
                        <button
                            type="button"
                            onClick={handleResetZoom}
                            className="px-2 py-1 text-[11px] font-mono font-medium text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                            title="重置比例 (0)"
                        >
                            {Math.round(scale * 100)}%
                        </button>
                        <button
                            type="button"
                            onClick={handleZoomIn}
                            disabled={scale >= 3}
                            className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                            title="放大 (+)"
                        >
                            <ZoomIn className="h-4 w-4"/>
                        </button>
                        {scale !== 1 && (
                            <button
                                type="button"
                                onClick={handleResetZoom}
                                className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors ml-0.5"
                                title="还原"
                            >
                                <RotateCcw className="h-3.5 w-3.5"/>
                            </button>
                        )}
                    </div>

                    {blobUrl && (
                        <button
                            type="button"
                            onClick={handleDownload}
                            className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white transition-colors flex items-center gap-1.5 text-xs border border-white/5"
                            title="下载原图"
                        >
                            <Download className="h-4 w-4"/>
                            <span className="hidden sm:inline">下载</span>
                        </button>
                    )}

                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1.5 rounded-xl bg-white/10 hover:bg-rose-500/80 text-slate-300 hover:text-white transition-colors border border-white/5 ml-1"
                        title="关闭 (Esc)"
                    >
                        <X className="h-4 w-4"/>
                    </button>
                </div>
            </div>

            {/* 主展示区 */}
            <div
                className="w-full flex-1 flex items-center justify-center p-2 sm:p-4 overflow-hidden relative"
                onClick={onClose}
            >
                {loading && (
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                        <span className="h-8 w-8 animate-spin rounded-full border-2 border-orange-400 border-t-transparent"/>
                        <span className="text-xs">正在加载高清原图…</span>
                    </div>
                )}

                {failed && (
                    <div className="flex flex-col items-center gap-2 text-rose-400 p-6 rounded-2xl bg-white/5 backdrop-blur border border-white/10">
                        <ImageOff className="h-10 w-10"/>
                        <span className="text-xs">图片加载失败或已被清理</span>
                    </div>
                )}

                {blobUrl && !loading && (
                    <div
                        className="max-h-[80vh] max-w-[85vw] flex items-center justify-center transition-transform duration-150 cursor-zoom-in"
                        style={{transform: `scale(${scale})`}}
                        onClick={e => {
                            e.stopPropagation();
                            handleToggleZoom();
                        }}
                        title="双击或点击快速切换缩放"
                    >
                        <img
                            src={blobUrl}
                            alt={alt}
                            className="max-h-[80vh] max-w-[85vw] w-auto h-auto object-contain rounded-xl shadow-2xl drop-shadow-2xl border border-white/10"
                        />
                    </div>
                )}
            </div>

            {/* 底部小提示 */}
            <div className="text-[11px] text-slate-400 py-1 px-3 rounded-full bg-slate-900/40 backdrop-blur border border-white/5 shrink-0">
                双击图片缩放 · 按 Esc 或点击空白处关闭
            </div>
        </div>
    );
}
