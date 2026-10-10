import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Check, Crop, FlipHorizontal, Loader2, Maximize2, Minus, Plus, RotateCcw, X} from 'lucide-react';
import {useEscapeDismissal} from '../../hooks/useEscapeDismissal';
import {
    createCroppedAvatarBlob,
    CropCornerHandle,
    getCropPixelCoords,
    getInitialSquareCrop,
    moveSquareCrop,
    NormalizedCropRect,
    resizeSquareCrop,
    zoomSquareCrop,
} from '../../utils/avatarCrop';
import {getProcessedImageOutput} from '../../utils/imageUpload';

export interface AvatarCropModalProps {
    isOpen: boolean;
    file?: File | null;
    imageUrl?: string | null;
    onClose: () => void;
    onConfirm: (croppedFile: File) => void | Promise<void>;
}

export const AvatarCropModal: React.FC<AvatarCropModalProps> = ({
    isOpen,
    file,
    imageUrl,
    onClose,
    onConfirm,
}) => {
    const [imageSrc, setImageSrc] = useState<string>('');
    const [fileName, setFileName] = useState<string>('avatar.png');
    const [naturalDimensions, setNaturalDimensions] = useState<{width: number; height: number}>({width: 0, height: 0});
    const [crop, setCrop] = useState<NormalizedCropRect>({x: 0, y: 0, width: 1, height: 1});
    const [flipHorizontal, setFlipHorizontal] = useState<boolean>(false);
    const [loading, setLoading] = useState<boolean>(true);
    const [processing, setProcessing] = useState<boolean>(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    const imageElementRef = useRef<HTMLImageElement | null>(null);
    const imageContainerRef = useRef<HTMLDivElement | null>(null);

    // 拖动状态
    const dragRef = useRef<{
        type: 'move' | CropCornerHandle;
        startX: number;
        startY: number;
        startCrop: NormalizedCropRect;
        displayWidth: number;
        displayHeight: number;
    } | null>(null);

    useEscapeDismissal(isOpen, () => {
        if (!processing) onClose();
    });

    // 加载图片与初始化选区
    useEffect(() => {
        if (!isOpen) return;

        let active = true;
        let blobUrlToRevoke: string | null = null;

        const load = async () => {
            try {
                setLoading(true);
                setLoadError(null);
                let src = '';
                let name = 'avatar.png';

                if (file) {
                    src = URL.createObjectURL(file);
                    blobUrlToRevoke = src;
                    name = file.name;
                } else if (imageUrl) {
                    name = imageUrl.split('/').pop()?.split('?')[0] || 'avatar.png';
                    if (!/\.(png|jpe?g|webp)$/i.test(name)) {
                        name += '.png';
                    }
                    const res = await fetch(imageUrl);
                    if (!res.ok) throw new Error('网络请求失败');
                    const blob = await res.blob();
                    src = URL.createObjectURL(blob);
                    blobUrlToRevoke = src;
                } else {
                    setLoading(false);
                    return;
                }

                const img = new Image();
                img.onload = () => {
                    if (!active) {
                        if (blobUrlToRevoke) URL.revokeObjectURL(blobUrlToRevoke);
                        return;
                    }
                    imageElementRef.current = img;
                    setImageSrc(src);
                    setFileName(name);
                    setNaturalDimensions({width: img.naturalWidth, height: img.naturalHeight});
                    setCrop(getInitialSquareCrop(img.naturalWidth, img.naturalHeight));
                    setFlipHorizontal(false);
                    setLoading(false);
                };
                img.onerror = () => {
                    if (!active) return;
                    setLoadError('图片解析失败，请检查文件格式');
                    setLoading(false);
                };
                img.src = src;
            } catch {
                if (!active) return;
                setLoadError('无法读取图片内容，请重新选择');
                setLoading(false);
            }
        };

        void load();

        return () => {
            active = false;
            if (blobUrlToRevoke) {
                URL.revokeObjectURL(blobUrlToRevoke);
            }
        };
    }, [isOpen, file, imageUrl]);

    // 开始拖拽或缩放
    const handlePointerDown = (
        e: React.PointerEvent<HTMLDivElement>,
        type: 'move' | CropCornerHandle,
    ) => {
        e.preventDefault();
        e.stopPropagation();
        if (processing || !imageContainerRef.current) return;

        const rect = imageContainerRef.current.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        e.currentTarget.setPointerCapture(e.pointerId);

        dragRef.current = {
            type,
            startX: e.clientX,
            startY: e.clientY,
            startCrop: crop,
            displayWidth: rect.width,
            displayHeight: rect.height,
        };
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        if (!drag) return;
        e.preventDefault();

        const dx = e.clientX - drag.startX;
        const dy = e.clientY - drag.startY;

        if (drag.type === 'move') {
            const nextCrop = moveSquareCrop(
                drag.startCrop,
                drag.displayWidth,
                drag.displayHeight,
                dx,
                dy,
            );
            setCrop(nextCrop);
        } else {
            const nextCrop = resizeSquareCrop(
                drag.startCrop,
                drag.displayWidth,
                drag.displayHeight,
                drag.type,
                dx,
                dy,
            );
            setCrop(nextCrop);
        }
    };

    const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!dragRef.current) return;
        try {
            e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
            // 忽略指针已释放
        }
        dragRef.current = null;
    };

    // 鼠标滚轮微调缩放选区
    const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
        if (processing || !imageContainerRef.current) return;
        e.preventDefault();
        const rect = imageContainerRef.current.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        // 向下滚放大选区，向上滚缩小选区
        const zoomDelta = e.deltaY < 0 ? 0.95 : 1.05;
        setCrop(prev => zoomSquareCrop(prev, rect.width, rect.height, zoomDelta));
    };

    // 重置为居中最大方形
    const handleResetMax = useCallback(() => {
        if (!naturalDimensions.width || !naturalDimensions.height) return;
        setCrop(getInitialSquareCrop(naturalDimensions.width, naturalDimensions.height));
    }, [naturalDimensions]);

    // 切换图片左右水平反转
    const handleToggleFlipHorizontal = () => {
        setFlipHorizontal(prev => !prev);
        // 翻转时同步镜像裁切框的水平位置，保证当前框选的主体在反转后依然被选中
        setCrop(prev => ({
            ...prev,
            x: Math.max(0, Math.min(1 - prev.width, 1 - prev.x - prev.width)),
        }));
    };

    // 按钮微调缩放
    const handleZoomStep = (zoomIn: boolean) => {
        if (!imageContainerRef.current) return;
        const rect = imageContainerRef.current.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        const factor = zoomIn ? 0.9 : 1.1;
        setCrop(prev => zoomSquareCrop(prev, rect.width, rect.height, factor));
    };

    // 提交裁切
    const handleConfirm = async () => {
        const img = imageElementRef.current;
        if (!img || processing) return;

        setProcessing(true);
        try {
            const dummyFile = new File([], fileName);
            const {type: mimeType, extension} = getProcessedImageOutput(dummyFile);

            const blob = await createCroppedAvatarBlob(img, crop, {
                targetSize: 512,
                mimeType,
                quality: 0.94,
                flipHorizontal,
            });

            const cleanBaseName = fileName.replace(/\.[^.]+$/, '').replace(/_avatar$/, '');
            const finalFileName = `${cleanBaseName}_avatar.${extension}`;
            const croppedFile = new File([blob], finalFileName, {
                type: mimeType,
                lastModified: Date.now(),
            });

            await onConfirm(croppedFile);
            onClose();
        } catch (err) {
            console.error('裁切头像失败:', err);
        } finally {
            setProcessing(false);
        }
    };

    if (!isOpen) return null;

    const pixelCoords = naturalDimensions.width && naturalDimensions.height
        ? getCropPixelCoords(crop, naturalDimensions.width, naturalDimensions.height)
        : null;

    return (
        <div data-modal-scroll-lock className="fixed inset-0 z-[120] flex items-center justify-center p-4 animate-in fade-in duration-200">
            {/* 半透明遮罩背景 */}
            <div
                className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
                onClick={() => !processing && onClose()}
            />

            {/* 弹窗主体卡片 */}
            <div className="relative flex w-full max-w-4xl max-h-[92vh] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200">
                {/* 顶部标题栏 */}
                <div className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-slate-50/70 px-6 py-4">
                    <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
                            <Crop className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-slate-900">裁切头像</h3>
                            <p className="text-xs text-slate-500">
                                框选 1:1 方形头像展示范围，拖动方框定位，拖动四角缩放
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={processing}
                        aria-label="关闭裁切弹窗"
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/80 hover:text-slate-600 transition-colors disabled:opacity-50"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* 内容区域：左侧原图与裁切框，右侧预览与快捷控制 */}
                <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto p-6 md:grid-cols-[minmax(0,1fr)_260px] scrollbar-hide">
                    {/* 左侧主视口 */}
                    <div
                        onWheel={handleWheel}
                        className="relative flex min-h-[340px] items-center justify-center rounded-xl border border-slate-200 bg-slate-950/95 p-3 select-none overflow-hidden"
                    >
                        {loading ? (
                            <div className="flex flex-col items-center justify-center text-slate-300 gap-2">
                                <Loader2 className="h-7 w-7 animate-spin text-orange-500" />
                                <span className="text-xs">加载图片中…</span>
                            </div>
                        ) : loadError ? (
                            <div className="flex flex-col items-center justify-center text-red-400 gap-2 p-6 text-center">
                                <span className="text-sm font-medium">{loadError}</span>
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="mt-2 text-xs text-slate-400 hover:text-white underline"
                                >
                                    返回并重新选择图片
                                </button>
                            </div>
                        ) : imageSrc && naturalDimensions.width ? (
                            <div
                                ref={imageContainerRef}
                                className="relative max-h-[58vh] max-w-full overflow-hidden shadow-2xl"
                                style={{
                                    aspectRatio: `${naturalDimensions.width}/${naturalDimensions.height}`,
                                    width: `min(100%, calc(58vh * ${naturalDimensions.width / Math.max(naturalDimensions.height, 1)}))`,
                                }}
                            >
                                {/* 底层完整原图 */}
                                <img
                                    src={imageSrc}
                                    alt="裁切底图"
                                    draggable={false}
                                    className={`absolute inset-0 h-full w-full object-contain pointer-events-none transition-transform duration-200 ${
                                        flipHorizontal ? '-scale-x-100' : ''
                                    }`}
                                />

                                {/* 1:1 方形裁切框 */}
                                <div
                                    role="region"
                                    aria-label="头像裁切选区；拖动以移动位置"
                                    onPointerDown={e => handlePointerDown(e, 'move')}
                                    onPointerMove={handlePointerMove}
                                    onPointerUp={handlePointerUp}
                                    onPointerCancel={handlePointerUp}
                                    className="absolute touch-none cursor-move border-2 border-white shadow-[0_0_0_9999px_rgba(15,23,42,0.68)] active:cursor-grabbing"
                                    style={{
                                        left: `${crop.x * 100}%`,
                                        top: `${crop.y * 100}%`,
                                        width: `${crop.width * 100}%`,
                                        height: `${crop.height * 100}%`,
                                    }}
                                >
                                    {/* 3x3 九宫格参考线 */}
                                    <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-60">
                                        {Array.from({length: 9}).map((_, i) => (
                                            <span key={i} className="border border-white/30" />
                                        ))}
                                    </div>

                                    {/* 四个角调整大小手柄 */}
                                    {(['nw', 'ne', 'sw', 'se'] as const).map(handle => {
                                        const isTop = handle.includes('n');
                                        const isLeft = handle.includes('w');
                                        return (
                                            <div
                                                key={handle}
                                                role="slider"
                                                aria-label={`拖拽调整${handle}角大小`}
                                                onPointerDown={e => handlePointerDown(e, handle)}
                                                className={`absolute h-4 w-4 rounded-full border-2 border-orange-500 bg-white shadow-md transition-transform hover:scale-125 ${
                                                    isTop ? '-top-2' : '-bottom-2'
                                                } ${
                                                    isLeft ? '-left-2' : '-right-2'
                                                } ${
                                                    (handle === 'nw' || handle === 'se')
                                                        ? 'cursor-nwse-resize'
                                                        : 'cursor-nesw-resize'
                                                }`}
                                            />
                                        );
                                    })}
                                </div>

                                {/* 底部提示胶囊 */}
                                <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-slate-900/80 px-3 py-1 text-[11px] font-medium text-white shadow-sm backdrop-blur-sm whitespace-nowrap">
                                    拖动方框定位 · 拖拽四角缩放 · 鼠标滚轮微调
                                </div>
                            </div>
                        ) : null}
                    </div>

                    {/* 右侧预览与工具区 */}
                    <div className="flex flex-col gap-5">
                        {/* 实时效果预览 */}
                        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                            <p className="text-xs font-bold text-slate-700 tracking-wide mb-3 flex items-center justify-between">
                                <span>效果预览</span>
                                <span className="text-[10px] font-semibold text-orange-600 bg-orange-50 border border-orange-200/80 px-1.5 py-0.5 rounded">
                                    1:1 正方形
                                </span>
                            </p>

                            <div className="flex items-center justify-around gap-3 py-2">
                                {/* Agent 圆角卡片头像预览 */}
                                <div className="flex flex-col items-center gap-1.5">
                                    <div className="relative h-20 w-20 overflow-hidden rounded-[1.35rem] border border-slate-200 bg-white shadow-sm ring-2 ring-orange-500/10">
                                        <div
                                            className={`w-full h-full relative transition-transform duration-200 ${
                                                flipHorizontal ? '-scale-x-100' : ''
                                            }`}
                                        >
                                            {imageSrc && (
                                                <img
                                                    src={imageSrc}
                                                    alt="方形预览"
                                                    draggable={false}
                                                    className="absolute max-w-none pointer-events-none select-none"
                                                    style={{
                                                        width: `${(1 / crop.width) * 100}%`,
                                                        height: `${(1 / crop.height) * 100}%`,
                                                        left: `${-(crop.x / crop.width) * 100}%`,
                                                        top: `${-(crop.y / crop.height) * 100}%`,
                                                    }}
                                                />
                                            )}
                                        </div>
                                    </div>
                                    <span className="text-[11px] text-slate-500">Agent卡片</span>
                                </div>

                                {/* 圆形头像预览 */}
                                <div className="flex flex-col items-center gap-1.5">
                                    <div className="relative h-14 w-14 overflow-hidden rounded-full border border-slate-200 bg-white shadow-sm ring-2 ring-orange-500/10">
                                        <div
                                            className={`w-full h-full relative transition-transform duration-200 ${
                                                flipHorizontal ? '-scale-x-100' : ''
                                            }`}
                                        >
                                            {imageSrc && (
                                                <img
                                                    src={imageSrc}
                                                    alt="圆形预览"
                                                    draggable={false}
                                                    className="absolute max-w-none pointer-events-none select-none"
                                                    style={{
                                                        width: `${(1 / crop.width) * 100}%`,
                                                        height: `${(1 / crop.height) * 100}%`,
                                                        left: `${-(crop.x / crop.width) * 100}%`,
                                                        top: `${-(crop.y / crop.height) * 100}%`,
                                                    }}
                                                />
                                            )}
                                        </div>
                                    </div>
                                    <span className="text-[11px] text-slate-500">圆形视图</span>
                                </div>
                            </div>
                        </div>

                        {/* 快捷微调操作 */}
                        <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-3">
                            <p className="text-xs font-bold text-slate-700">取景调整</p>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={handleResetMax}
                                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-orange-50 hover:border-orange-200 hover:text-orange-700 transition-colors"
                                    title="恢复为画面居中的最大正方形选区"
                                >
                                    <RotateCcw className="h-3.5 w-3.5" />
                                    居中重置
                                </button>
                                <button
                                    type="button"
                                    onClick={handleToggleFlipHorizontal}
                                    className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                                        flipHorizontal
                                            ? 'border-orange-500 bg-orange-50 text-orange-700 font-semibold shadow-xs'
                                            : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-orange-50 hover:border-orange-200 hover:text-orange-700'
                                    }`}
                                    title="水平左右镜像翻转图片"
                                >
                                    <FlipHorizontal className="h-3.5 w-3.5" />
                                    {flipHorizontal ? '已左右反转' : '左右反转'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleZoomStep(true)}
                                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-orange-50 hover:border-orange-200 hover:text-orange-700 transition-colors"
                                    title="缩小选区（聚焦面部）"
                                >
                                    <Minus className="h-3.5 w-3.5" />
                                    聚焦特写
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleZoomStep(false)}
                                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-orange-50 hover:border-orange-200 hover:text-orange-700 transition-colors"
                                    title="放大选区（展示更多画面）"
                                >
                                    <Plus className="h-3.5 w-3.5" />
                                    展示更多
                                </button>
                            </div>
                        </div>

                        {/* 规格信息卡片 */}
                        <div className="rounded-xl border border-orange-100 bg-orange-50/60 p-3 text-xs leading-5 text-orange-950">
                            <div className="flex items-center gap-1.5 font-semibold text-orange-800 mb-1">
                                <Maximize2 className="h-3.5 w-3.5" />
                                {pixelCoords ? `选区 ${pixelCoords.sWidth} × ${pixelCoords.sHeight} px` : '标准输出'}
                            </div>
                            <p className="text-[11px] text-orange-900/80">
                                自动导出为 512 × 512 标准方形高清头像，彻底解决原图长宽比不对、头像拉伸或偏离人物中心的问题。
                            </p>
                        </div>
                    </div>
                </div>

                {/* 底部按钮栏 */}
                <div className="flex shrink-0 items-center justify-between border-t border-slate-100 bg-slate-50/80 px-6 py-3.5">
                    <span className="text-xs text-slate-400 truncate max-w-[200px] sm:max-w-none">
                        {naturalDimensions.width ? `原图 ${naturalDimensions.width} × ${naturalDimensions.height} · ${fileName}` : ''}
                    </span>
                    <div className="flex items-center gap-2.5">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={processing}
                            className="rounded-lg px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-200 transition-colors disabled:opacity-50"
                        >
                            取消
                        </button>
                        <button
                            type="button"
                            onClick={handleConfirm}
                            disabled={processing || loading || Boolean(loadError)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2 text-xs font-medium text-white shadow-sm shadow-orange-500/20 hover:bg-orange-600 active:bg-orange-700 transition-colors disabled:opacity-50"
                        >
                            {processing ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                                <Check className="h-3.5 w-3.5" />
                            )}
                            {processing ? '裁切生成中…' : '完成裁切并使用'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
