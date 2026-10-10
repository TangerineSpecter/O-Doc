import {useState, useEffect, useCallback} from 'react';
import {
    Camera,
    Copy,
    Check,
    RotateCcw,
    Image as ImageIcon,
    XCircle,
    RefreshCw,
    AlertCircle,
    ChevronLeft,
    ChevronRight,
    ZoomIn,
    X,
    ExternalLink,
} from 'lucide-react';
import AuthenticatedResourceImage from '../common/AuthenticatedResourceImage';
import {useToast} from '../common/ToastProvider';

interface TravelPhotoCardProps {
    photo?: {
        status: string;
        error?: string;
        imageUrl?: string;
        imageUrls?: string[];
        images?: string[];
    };
    photos?: Array<{imageUrl?: string} | string>;
    busy: boolean;
    onRegenerate: () => void;
    onQuery: () => void;
    onPick: () => void;
    onAbandon: () => void;
}

const photoStatusMap: Record<string, {label: string; color: string}> = {
    pending: {label: '等待生成', color: 'bg-slate-100 text-slate-600 border-slate-200'},
    generating: {label: '正在绘制…', color: 'bg-blue-50 text-blue-700 border-blue-200 animate-pulse'},
    manual: {label: '需要处理', color: 'bg-amber-50 text-amber-700 border-amber-200'},
    inserted: {label: '已补入原帖', color: 'bg-emerald-50 text-emerald-700 border-emerald-200'},
    abandoned: {label: '已放弃', color: 'bg-slate-100 text-slate-400 border-slate-200'},
};

export default function TravelPhotoCard({
    photo,
    photos,
    busy,
    onRegenerate,
    onQuery,
    onPick,
    onAbandon,
}: TravelPhotoCardProps) {
    const toast = useToast();
    const [copied, setCopied] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [zoomOpen, setZoomOpen] = useState(false);

    // 智能提取多图列表（兼容 imageUrl、imageUrls、images、photos 数组）
    const imageList: string[] = (() => {
        const list: string[] = [];
        if (Array.isArray(photos)) {
            photos.forEach(item => {
                if (typeof item === 'string' && item) list.push(item);
                else if (typeof item === 'object' && item?.imageUrl) list.push(item.imageUrl);
            });
        }
        if (Array.isArray(photo?.imageUrls)) {
            photo.imageUrls.forEach(url => {
                if (typeof url === 'string' && url) list.push(url);
            });
        }
        if (Array.isArray(photo?.images)) {
            photo.images.forEach(url => {
                if (typeof url === 'string' && url) list.push(url);
            });
        }
        if (typeof photo?.imageUrl === 'string' && photo.imageUrl) {
            if (!list.includes(photo.imageUrl)) {
                list.unshift(photo.imageUrl);
            }
        }
        return Array.from(new Set(list.filter(Boolean)));
    })();

    const totalCount = imageList.length;
    const safeIndex = totalCount > 0 ? (currentIndex >= totalCount ? 0 : currentIndex) : 0;
    const currentImage = imageList[safeIndex] || photo?.imageUrl || '';

    const prevImage = useCallback(() => {
        if (totalCount <= 1) return;
        setCurrentIndex(prev => (prev === 0 ? totalCount - 1 : prev - 1));
    }, [totalCount]);

    const nextImage = useCallback(() => {
        if (totalCount <= 1) return;
        setCurrentIndex(prev => (prev === totalCount - 1 ? 0 : prev + 1));
    }, [totalCount]);

    // 键盘监听（大图模式下 ESC 退出，左右方向键切换）
    useEffect(() => {
        if (!zoomOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setZoomOpen(false);
            else if (e.key === 'ArrowLeft') prevImage();
            else if (e.key === 'ArrowRight') nextImage();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [zoomOpen, prevImage, nextImage]);

    if (!photo) return null;

    const resourceId = currentImage.match(/^\/api\/resource\/view\/([^/?#]+)$/)?.[1];
    const statusMeta = photoStatusMap[photo.status] || {
        label: photo.status,
        color: 'bg-slate-100 text-slate-600 border-slate-200',
    };

    const handleCopyMarkdown = async (targetUrl = currentImage) => {
        if (!targetUrl) return;
        try {
            await navigator.clipboard.writeText(`![旅行场景照](${targetUrl})`);
            setCopied(true);
            toast.success('已复制图片 Markdown 代码');
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error('复制失败，请手动右键复制');
        }
    };

    return (
        <>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:p-5">
                {/* 顶部标题与状态标签 */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
                            <Camera className="h-4 w-4" />
                        </span>
                        <h4 className="text-xs font-bold text-slate-800">旅行场景照掠影</h4>
                        {totalCount > 1 && (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                                {totalCount} 张
                            </span>
                        )}
                    </div>
                    <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-medium ${statusMeta.color}`}>
                        {statusMeta.label}
                    </span>
                </div>

                {/* 错误提示 */}
                {photo.error && (
                    <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200/80 bg-amber-50/80 p-2.5 text-xs text-amber-800">
                        <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                        <p className="flex-1 leading-relaxed">{photo.error}</p>
                    </div>
                )}

                {/* 16:9 照片相框容器（支持轮播与点击放大） */}
                <div className="mt-3 overflow-hidden rounded-xl border border-slate-100 bg-slate-900/5 p-1.5 shadow-inner">
                    {currentImage ? (
                        <div
                            onClick={() => setZoomOpen(true)}
                            className="group relative aspect-video w-full cursor-zoom-in overflow-hidden rounded-lg bg-slate-950 flex items-center justify-center"
                        >
                            {/* 图片本体 */}
                            {resourceId ? (
                                <AuthenticatedResourceImage
                                    resourceId={resourceId}
                                    alt="旅行场景插画"
                                    fitMode="contain"
                                    className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.02]"
                                />
                            ) : (
                                <img
                                    src={currentImage}
                                    alt="旅行场景插画"
                                    className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.02]"
                                />
                            )}

                            {/* 悬停放大镜遮罩指示 */}
                            <div className="absolute inset-0 bg-slate-950/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs font-medium text-white shadow-lg backdrop-blur-sm">
                                    <ZoomIn className="h-3.5 w-3.5" />
                                    点击放大查看
                                </span>
                            </div>

                            {/* 轮播左切换按钮 */}
                            {totalCount > 1 && (
                                <button
                                    type="button"
                                    onClick={e => {
                                        e.stopPropagation();
                                        prevImage();
                                    }}
                                    aria-label="上一张图片"
                                    className="absolute left-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white shadow-md backdrop-blur-sm hover:bg-black/75 transition-all opacity-80 group-hover:opacity-100"
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </button>
                            )}

                            {/* 轮播右切换按钮 */}
                            {totalCount > 1 && (
                                <button
                                    type="button"
                                    onClick={e => {
                                        e.stopPropagation();
                                        nextImage();
                                    }}
                                    aria-label="下一张图片"
                                    className="absolute right-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white shadow-md backdrop-blur-sm hover:bg-black/75 transition-all opacity-80 group-hover:opacity-100"
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </button>
                            )}

                            {/* 底部指示器与圆点 */}
                            {totalCount > 1 && (
                                <div className="absolute bottom-2 left-0 right-0 flex items-center justify-center gap-1.5 pointer-events-none">
                                    <span className="rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-mono font-medium text-white backdrop-blur-sm shadow-xs">
                                        {safeIndex + 1} / {totalCount}
                                    </span>
                                </div>
                            )}
                        </div>
                    ) : photo.status === 'generating' ? (
                        <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 text-slate-400 bg-white rounded-lg">
                            <RefreshCw className="h-6 w-6 animate-spin text-orange-500" />
                            <span className="text-xs">AI 正在绘制 16:9 场景插画…</span>
                        </div>
                    ) : (
                        <div className="flex aspect-video w-full flex-col items-center justify-center gap-1.5 text-slate-400 bg-white rounded-lg">
                            <ImageIcon className="h-6 w-6 stroke-1 text-slate-300" />
                            <span className="text-xs">暂无场景照片</span>
                        </div>
                    )}
                </div>

                {/* 快捷操作栏 */}
                <div className="mt-3.5 flex flex-wrap items-center gap-2">
                    {currentImage && (
                        <button
                            type="button"
                            onClick={() => void handleCopyMarkdown(currentImage)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-2xs hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700 transition-colors whitespace-nowrap shrink-0"
                        >
                            {copied ? (
                                <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                            ) : (
                                <Copy className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            )}
                            <span>{copied ? '已复制' : '复制 Markdown'}</span>
                        </button>
                    )}

                    {photo.status === 'inserted' && (
                        <button
                            type="button"
                            disabled={busy}
                            onClick={onRegenerate}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50/70 px-2.5 py-1.5 text-xs font-medium text-orange-700 shadow-2xs hover:bg-orange-100 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                        >
                            <RotateCcw className="h-3.5 w-3.5 text-orange-600 shrink-0" />
                            <span>重新生成场景照</span>
                        </button>
                    )}

                    {photo.status !== 'inserted' && (
                        <>
                            <button
                                type="button"
                                disabled={busy}
                                onClick={onQuery}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
                            >
                                <RefreshCw className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                <span>恢复查询</span>
                            </button>
                            <button
                                type="button"
                                disabled={busy}
                                onClick={onRegenerate}
                                className="inline-flex items-center gap-1 rounded-lg border border-orange-200 bg-orange-50 px-2.5 py-1.5 text-xs font-medium text-orange-700 hover:bg-orange-100 disabled:opacity-50 whitespace-nowrap shrink-0"
                            >
                                <RotateCcw className="h-3.5 w-3.5 text-orange-600 shrink-0" />
                                <span>重新生成</span>
                            </button>
                            <button
                                type="button"
                                disabled={busy}
                                onClick={onPick}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
                            >
                                <ImageIcon className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                <span>图库替换</span>
                            </button>
                            <button
                                type="button"
                                disabled={busy}
                                onClick={onAbandon}
                                className="inline-flex items-center gap-1 rounded-lg border border-red-100 bg-red-50/50 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 whitespace-nowrap shrink-0"
                            >
                                <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                                <span>放弃配图</span>
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* 点击图片放大查看模态框 (Lightbox Modal) */}
            {zoomOpen && currentImage && (
                <div data-modal-scroll-lock
                    className="fixed inset-0 z-[150] flex flex-col items-center justify-center bg-slate-950/85 p-4 backdrop-blur-md animate-in fade-in duration-200"
                    onClick={() => setZoomOpen(false)}
                >
                    {/* 顶栏控制组 */}
                    <div
                        className="absolute top-4 left-4 right-4 flex items-center justify-between text-white"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold tracking-wide">
                                场景插画掠影
                            </span>
                            {totalCount > 1 && (
                                <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-mono">
                                    {safeIndex + 1} / {totalCount}
                                </span>
                            )}
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => void handleCopyMarkdown(currentImage)}
                                className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/20 transition-colors"
                            >
                                <Copy className="h-3.5 w-3.5" />
                                <span>复制 Markdown</span>
                            </button>
                            {currentImage && (
                                <a
                                    href={currentImage}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/20 transition-colors"
                                >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                    <span>原图</span>
                                </a>
                            )}
                            <button
                                type="button"
                                onClick={() => setZoomOpen(false)}
                                aria-label="关闭预览"
                                className="rounded-lg bg-white/10 p-1.5 text-white hover:bg-white/20 transition-colors"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                    </div>

                    {/* 大图核心展示区 */}
                    <div
                        className="relative flex max-h-[82vh] max-w-[92vw] items-center justify-center overflow-hidden rounded-2xl shadow-2xl"
                        onClick={e => e.stopPropagation()}
                    >
                        {resourceId ? (
                            <AuthenticatedResourceImage
                                resourceId={resourceId}
                                alt="旅行场景大图"
                                fitMode="contain"
                                className="max-h-[82vh] max-w-[92vw] object-contain rounded-xl"
                            />
                        ) : (
                            <img
                                src={currentImage}
                                alt="旅行场景大图"
                                className="max-h-[82vh] max-w-[92vw] object-contain rounded-xl"
                            />
                        )}

                        {/* 大图模式下的上一张切换 */}
                        {totalCount > 1 && (
                            <button
                                type="button"
                                onClick={e => {
                                    e.stopPropagation();
                                    prevImage();
                                }}
                                aria-label="上一张"
                                className="absolute left-3 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white shadow-xl backdrop-blur-md hover:bg-black/90 transition-all"
                            >
                                <ChevronLeft className="h-5 w-5" />
                            </button>
                        )}

                        {/* 大图模式下的下一张切换 */}
                        {totalCount > 1 && (
                            <button
                                type="button"
                                onClick={e => {
                                    e.stopPropagation();
                                    nextImage();
                                }}
                                aria-label="下一张"
                                className="absolute right-3 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white shadow-xl backdrop-blur-md hover:bg-black/90 transition-all"
                            >
                                <ChevronRight className="h-5 w-5" />
                            </button>
                        )}
                    </div>

                    {/* 快捷键提示 */}
                    <p className="mt-3 text-xs text-white/50">
                        支持方向键 ← / → 切换图片，ESC 退出查看
                    </p>
                </div>
            )}
        </>
    );
}
