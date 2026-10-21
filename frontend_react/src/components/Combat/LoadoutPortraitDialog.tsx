import {useCallback, useEffect, useRef, useState} from 'react';
import type {DragEvent, PointerEvent as ReactPointerEvent} from 'react';
import {collectDroppedFiles} from '@/utils/imageUpload';
import {createRequestKey} from '@/utils/requestKey';
import {
    AlertCircle,
    Check,
    Eye,
    EyeOff,
    ImagePlus,
    LoaderCircle,
    Minus,
    Moon,
    Move,
    Plus,
    RotateCcw,
    Shield,
    Sparkles,
    Sun,
    Upload,
    UserRound,
    Wand2,
    X,
} from 'lucide-react';
import {getPortraitOptions} from '@/api/loadoutPortrait';
import type {PortraitOptions} from '@/api/loadoutPortrait';
import {Select} from '@/components/common/Select';
import WorldDialog from '@/components/AgentWorld/WorldDialog';
import {usePortraitImage} from './useLoadoutPortrait';
import type {useLoadoutPortrait} from './useLoadoutPortrait';
import {usePortraitReference} from './usePortraitReference';
import {usePortraitUpload} from './usePortraitUpload';

type Props = {agentId: string; portrait: ReturnType<typeof useLoadoutPortrait>; onClose: () => void};

const statusLabels: Record<string, string> = {
    submitting: '正在提交…',
    generating: 'AI 正在绘制冒险形象…',
    download_pending: '正在保存立绘…',
    succeeded: '绘制完成，确认后应用',
    failed: '生成失败',
    submission_unknown: '提交结果暂不明确，请稍后查询',
    timed_out: '等待超时，可重新生成',
    cancelled: '已停止等待',
};

const QUICK_TAGS = ['冒险者长袍', '持握法杖', '神秘兜帽', '金边轻甲', '精致发饰', '微风拂动', '自信微笑'];

export default function LoadoutPortraitDialog({agentId, portrait, onClose}: Props) {
    const [options, setOptions] = useState<PortraitOptions | null>(null);
    const [modelId, setModelId] = useState('');
    const [extra, setExtra] = useState('');
    const [optionsError, setOptionsError] = useState('');
    const [optionsLoading, setOptionsLoading] = useState(true);
    const [retry, setRetry] = useState(0);

    // 工作流选项卡与展台配置
    const [activeTab, setActiveTab] = useState<'generate' | 'upload'>('generate');
    const [stageTheme, setStageTheme] = useState<'light' | 'dark'>('light');
    const [showSafeZone, setShowSafeZone] = useState(true); // 是否显示装备槽位参考线 HUD
    const [scaleDraft, setScaleDraft] = useState<number | null>(null);
    const [positionDraft, setPositionDraft] = useState<{x: number; y: number} | null>(null);
    const [previewSource, setPreviewSource] = useState<'current' | 'generated' | 'uploaded'>('current');

    // 拖拽平移：拖拽过程中采用纯物理像素 1:1 位移，0 React 重绘、0 计算量，松开时才一次性结算
    const heroImgRef = useRef<HTMLImageElement>(null);
    const stageRef = useRef<HTMLDivElement>(null);
    const isDraggingRef = useRef(false);
    const [isDraggingState, setIsDraggingState] = useState(false);
    const dragStartInfo = useRef({
        mouseX: 0,
        mouseY: 0,
        startPixelX: 0,
        startPixelY: 0,
        imgWidth: 1,
        imgHeight: 1,
    });
    const currentDragPixels = useRef({x: 0, y: 0});

    // 拖拽上传状态
    const [refDragging, setRefDragging] = useState(false);
    const [styleDragging, setStyleDragging] = useState(false);
    const [localDragging, setLocalDragging] = useState(false);
    const refDragDepth = useRef(0);
    const styleDragDepth = useRef(0);
    const localDragDepth = useRef(0);

    const refFileInput = useRef<HTMLInputElement>(null);
    const styleFileInput = useRef<HTMLInputElement>(null);
    const localFileInput = useRef<HTMLInputElement>(null);

    const reference = usePortraitReference();
    const styleReference = usePortraitReference();
    const localPortrait = usePortraitUpload();

    const generated = portrait.task?.status === 'succeeded' ? portrait.task : null;
    const hasGenerated = Boolean(generated && generated.assetId !== portrait.saved.assetId);
    const hasUploaded = Boolean(localPortrait.uploaded && localPortrait.uploaded.assetId !== portrait.saved.assetId);

    const resolvedPreviewSource =
        previewSource === 'uploaded' && hasUploaded
            ? 'uploaded'
            : previewSource === 'generated' && hasGenerated
              ? 'generated'
              : !portrait.saved.assetId && hasGenerated
                ? 'generated'
                : !portrait.saved.assetId && hasUploaded
                  ? 'uploaded'
                  : 'current';

    const selectedTask = resolvedPreviewSource === 'generated' ? generated : null;
    const selectedUploadedPortrait = resolvedPreviewSource === 'uploaded' ? localPortrait.uploaded : null;
    const selectedAssetId = selectedTask?.assetId || selectedUploadedPortrait?.assetId || portrait.saved.assetId;
    const preview = usePortraitImage(selectedAssetId);

    const scale = scaleDraft ?? portrait.saved.scale ?? 1;
    const offsetX = positionDraft?.x ?? portrait.saved.offsetX ?? 0;
    const offsetY = positionDraft?.y ?? portrait.saved.offsetY ?? 0;

    // 当非拖拽期间（如滑块拖动或居中复位），确保 DOM transform 与 state 保持同步
    useEffect(() => {
        if (!isDraggingRef.current && heroImgRef.current) {
            heroImgRef.current.style.transform = `translate(${offsetX}%, ${offsetY}%) scale(${scale})`;
        }
    }, [offsetX, offsetY, scale]);

    useEffect(() => {
        let alive = true;
        void getPortraitOptions(agentId, modelId || undefined)
            .then(value => {
                if (alive) setOptions(value);
            })
            .catch(err => {
                if (alive) {
                    setOptions(null);
                    setOptionsError(err instanceof Error ? err.message : '模型配置加载失败');
                }
            })
            .finally(() => {
                if (alive) setOptionsLoading(false);
            });
        return () => {
            alive = false;
        };
    }, [agentId, modelId, retry]);

    const capable = options?.configured && options.supportsReferenceImages;
    const hasReference = Boolean(
        reference.reference || options?.agentReferenceImages?.avatar || options?.agentReferenceImages?.fullBody
    );
    const pending = portrait.busy || portrait.loading || reference.busy || styleReference.busy || localPortrait.busy;
    const newImage = Boolean(selectedAssetId && selectedAssetId !== portrait.saved.assetId);
    const sizeChanged = Math.abs(scale - (portrait.saved.scale ?? 1)) > 0.001;
    const positionChanged =
        Math.abs(offsetX - (portrait.saved.offsetX ?? 0)) > 0.001 ||
        Math.abs(offsetY - (portrait.saved.offsetY ?? 0)) > 0.001;
    const canSave = Boolean(preview.url) && (newImage || sizeChanged || positionChanged);
    const error =
        localPortrait.error || reference.error || styleReference.error || portrait.error || optionsError || preview.error;

    const previewChoices: Array<{source: 'current' | 'generated' | 'uploaded'; label: string}> = [
        ...(portrait.saved.assetId ? [{source: 'current' as const, label: '当前立绘'}] : []),
        ...(hasGenerated ? [{source: 'generated' as const, label: 'AI 生成'}] : []),
        ...(hasUploaded ? [{source: 'uploaded' as const, label: '本地上传'}] : []),
    ];

    const uploadBlocked = pending || portrait.active;

    // =========================================================================
    // 零顿挫、零抖动的纯像素级拖拽系统：
    // 1. 拖拽期间不触发任何 setState，不计算进度条，直接以 1:1 物理像素位移 (纯原生丝滑)
    // 2. 拖拽结束松开时，才一次性结算百分比并更新 React 状态
    // =========================================================================
    const handlePointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
        if (e.button !== 0 || !heroImgRef.current || pending || portrait.active) return;
        const img = heroImgRef.current;
        // translate 百分比以未缩放的布局尺寸为基准，不能使用 scale 后的包围盒。
        const imgW = img.offsetWidth;
        const imgH = img.offsetHeight;
        if (imgW <= 0 || imgH <= 0) return;

        // 计算当前百分比对应的初始像素偏移
        const startPxX = imgW * (offsetX / 100);
        const startPxY = imgH * (offsetY / 100);

        isDraggingRef.current = true;
        setIsDraggingState(true);
        dragStartInfo.current = {
            mouseX: e.clientX,
            mouseY: e.clientY,
            startPixelX: startPxX,
            startPixelY: startPxY,
            imgWidth: imgW,
            imgHeight: imgH,
        };
        currentDragPixels.current = {x: startPxX, y: startPxY};

        // 禁用任何动画过渡，保证绝对跟手
        img.style.transition = 'none';

        e.currentTarget.setPointerCapture(e.pointerId);
    }, [offsetX, offsetY, pending, portrait.active]);

    const handlePointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
        if (!isDraggingRef.current || !heroImgRef.current) return;

        const info = dragStartInfo.current;
        const deltaX = e.clientX - info.mouseX;
        const deltaY = e.clientY - info.mouseY;

        const maxX = info.imgWidth * 0.2;
        const maxY = info.imgHeight * 0.2;
        const curPxX = Math.min(maxX, Math.max(-maxX, info.startPixelX + deltaX));
        const curPxY = Math.min(maxY, Math.max(-maxY, info.startPixelY + deltaY));
        currentDragPixels.current = {x: curPxX, y: curPxY};

        // 纯物理像素硬件加速，鼠标动 1px 立绘动 1px，零重绘、零计算、彻底根治顿挫！
        heroImgRef.current.style.transform = `translate(${curPxX}px, ${curPxY}px) scale(${scale})`;
    }, [scale]);

    const handlePointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
        if (!isDraggingRef.current) return;
        isDraggingRef.current = false;
        setIsDraggingState(false);

        try {
            e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
            // ignore
        }

        const info = dragStartInfo.current;
        const curPx = currentDragPixels.current;

        // 在拖拽结束这一刻，一次性计算百分比坐标
        const rawPercentX = (curPx.x / info.imgWidth) * 100;
        const rawPercentY = (curPx.y / info.imgHeight) * 100;

        const finalX = Math.min(20, Math.max(-20, Math.round(rawPercentX)));
        const finalY = Math.min(20, Math.max(-20, Math.round(rawPercentY)));

        // 恢复百分比单位与平滑过渡
        if (heroImgRef.current) {
            heroImgRef.current.style.transition = 'transform 0.15s ease-out';
            heroImgRef.current.style.transform = `translate(${finalX}%, ${finalY}%) scale(${scale})`;
        }

        // 一次性结算通知 React，更新进度条与数字
        setPositionDraft({x: finalX, y: finalY});
    }, [scale]);

    // React 的 wheel 委托监听是 passive；仅在舞台内用原生监听阻止缩放时滚动弹窗。
    useEffect(() => {
        const stage = stageRef.current;
        if (!stage) return;
        const onWheel = (event: WheelEvent) => {
            if (!preview.url || pending || portrait.active || isDraggingRef.current || event.deltaY === 0) return;
            event.preventDefault();
            const delta = event.deltaY < 0 ? 0.05 : -0.05;
            setScaleDraft(prev => {
                const cur = prev ?? portrait.saved.scale ?? 1;
                return Math.round(Math.min(1.5, Math.max(0.6, cur + delta)) * 100) / 100;
            });
        };
        stage.addEventListener('wheel', onWheel, {passive: false});
        return () => stage.removeEventListener('wheel', onWheel);
    }, [pending, portrait.active, portrait.saved.scale, preview.url]);

    // 角色参考图拖拽上传
    const handleRefDragEnter = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (uploadBlocked || !Array.from(e.dataTransfer.types).includes('Files')) return;
        refDragDepth.current++;
        setRefDragging(true);
    };
    const handleRefDragLeave = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        refDragDepth.current = Math.max(0, refDragDepth.current - 1);
        if (!refDragDepth.current) setRefDragging(false);
    };
    const handleRefDrop = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        refDragDepth.current = 0;
        setRefDragging(false);
        if (uploadBlocked) return;
        const file = collectDroppedFiles(e.dataTransfer)[0];
        if (file) void reference.upload(file);
    };

    // 画风参考图拖拽上传
    const handleStyleDragEnter = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (uploadBlocked || !Array.from(e.dataTransfer.types).includes('Files')) return;
        styleDragDepth.current++;
        setStyleDragging(true);
    };
    const handleStyleDragLeave = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        styleDragDepth.current = Math.max(0, styleDragDepth.current - 1);
        if (!styleDragDepth.current) setStyleDragging(false);
    };
    const handleStyleDrop = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        styleDragDepth.current = 0;
        setStyleDragging(false);
        if (uploadBlocked) return;
        const file = collectDroppedFiles(e.dataTransfer)[0];
        if (file) void styleReference.upload(file);
    };

    // 本地立绘上传
    const uploadLocal = async (file: File) => {
        const result = await localPortrait.upload(file);
        if (result) {
            setPreviewSource('uploaded');
            setActiveTab('upload');
        }
    };
    const handleLocalDragEnter = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (uploadBlocked || !Array.from(e.dataTransfer.types).includes('Files')) return;
        localDragDepth.current++;
        setLocalDragging(true);
    };
    const handleLocalDragLeave = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        localDragDepth.current = Math.max(0, localDragDepth.current - 1);
        if (!localDragDepth.current) setLocalDragging(false);
    };
    const handleLocalDrop = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        localDragDepth.current = 0;
        setLocalDragging(false);
        if (uploadBlocked) return;
        const file = collectDroppedFiles(e.dataTransfer)[0];
        if (file) void uploadLocal(file);
    };

    // 生成与保存
    const generate = () => {
        setPreviewSource('generated');
        void portrait.generate({
            modelId: modelId || undefined,
            prompt: extra,
            requestId: createRequestKey(),
            referenceImageId: reference.reference?.id,
            styleReferenceImageId: styleReference.reference?.id,
            ...(options?.defaultAspectRatio ? {aspectRatio: options.defaultAspectRatio} : {}),
            ...(options?.defaultImageSize ? {imageSize: options.defaultImageSize} : {}),
        });
    };

    const save = () => {
        if (selectedTask) void portrait.apply({taskId: selectedTask.taskId}, scale, offsetX, offsetY);
        else if (selectedUploadedPortrait)
            void portrait.apply({assetId: selectedUploadedPortrait.assetId}, scale, offsetX, offsetY);
        else void portrait.saveAdjustments(scale, offsetX, offsetY);
    };

    const addQuickTag = (tag: string) => {
        if (extra.includes(tag)) return;
        setExtra(prev => (prev.trim() ? `${prev.trim()}，${tag}` : tag));
    };

    return (
        <WorldDialog
            title="专属冒险立绘"
            description="为 Agent 生成专属形象，或上传个性立绘并调整装备佩戴效果"
            onClose={onClose}
            size="wide"
            fixedHeight={false}
        >
            <div data-loadout-portrait-dialog className="grid gap-5 p-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
                {/* 左栏：专业立绘工坊展台与一体化微调 */}
                <div className="flex min-w-0 flex-col gap-3">
                    {/* 视口顶部工具栏：版本切换、HUD 安全槽位虚影切换、明暗背景切换 */}
                    <div className="flex items-center justify-between gap-2">
                        {previewChoices.length > 1 ? (
                            <div
                                role="group"
                                aria-label="预览立绘版本"
                                className="inline-flex rounded-xl bg-slate-100 p-0.5 text-xs"
                            >
                                {previewChoices.map(choice => {
                                    const active = resolvedPreviewSource === choice.source;
                                    return (
                                        <button
                                            key={choice.source}
                                            type="button"
                                            aria-pressed={active}
                                            onClick={() => setPreviewSource(choice.source)}
                                            className={`rounded-lg px-3 py-1 font-medium transition-all ${
                                                active
                                                    ? 'bg-white text-orange-600 shadow-sm'
                                                    : 'text-slate-500 hover:text-slate-800'
                                            }`}
                                        >
                                            {choice.label}
                                        </button>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                                <Shield className="h-3.5 w-3.5 text-orange-500" />
                                <span>装备对位舞台</span>
                            </div>
                        )}

                        <div className="flex items-center gap-1.5">
                            {/* 装备槽位 HUD 辅助对位开关 */}
                            <button
                                type="button"
                                onClick={() => setShowSafeZone(v => !v)}
                                className={`flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs transition-colors ${
                                    showSafeZone
                                        ? 'bg-orange-50 font-medium text-orange-700 border border-orange-200/80'
                                        : 'bg-slate-100 text-slate-500 hover:text-slate-800 border border-transparent'
                                }`}
                                title="显示装备页真实槽位参考框，便于对准人物避免遮挡"
                            >
                                {showSafeZone ? (
                                    <Eye className="h-3.5 w-3.5 shrink-0 text-orange-600" />
                                ) : (
                                    <EyeOff className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                                )}
                                <span>{showSafeZone ? '槽位辅助框' : '隐藏辅助'}</span>
                            </button>

                            {/* 展台明暗切换 */}
                            <div className="flex items-center rounded-xl bg-slate-100 p-0.5 text-xs">
                                <button
                                    type="button"
                                    title="浅色白模预览"
                                    onClick={() => setStageTheme('light')}
                                    className={`flex items-center gap-1 rounded-lg px-2 py-1 transition-all ${
                                        stageTheme === 'light'
                                            ? 'bg-white text-orange-600 shadow-sm'
                                            : 'text-slate-400 hover:text-slate-700'
                                    }`}
                                >
                                    <Sun className="h-3.5 w-3.5" />
                                </button>
                                <button
                                    type="button"
                                    title="暗黑星空装备预览（装备页真实风格）"
                                    onClick={() => setStageTheme('dark')}
                                    className={`flex items-center gap-1 rounded-lg px-2 py-1 transition-all ${
                                        stageTheme === 'dark'
                                            ? 'bg-slate-800 text-amber-300 shadow-sm'
                                            : 'text-slate-400 hover:text-slate-700'
                                    }`}
                                >
                                    <Moon className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* 立绘主视口舞台 (纯物理像素拖动，0 顿挫) */}
                    <div
                        ref={stageRef}
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onPointerCancel={handlePointerUp}
                        className={`group relative flex h-[380px] touch-none select-none items-end justify-center overflow-hidden rounded-2xl border transition-colors sm:h-[430px] md:h-[460px] ${
                            stageTheme === 'dark'
                                ? 'border-slate-800 bg-gradient-to-b from-slate-950 via-[#0f172a] to-[#020617] text-slate-100 shadow-inner'
                                : 'border-slate-200/90 bg-gradient-to-b from-slate-50 via-white to-orange-50/25'
                        } ${preview.url ? (isDraggingState ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'}`}
                    >
                        {/* 装备页 4 角几何包角参考 */}
                        <div className="pointer-events-none absolute left-3 top-3 h-3.5 w-3.5 rounded-tl-sm border-l-2 border-t-2 border-orange-400/50" />
                        <div className="pointer-events-none absolute right-3 top-3 h-3.5 w-3.5 rounded-tr-sm border-r-2 border-t-2 border-orange-400/50" />
                        <div className="pointer-events-none absolute bottom-3 left-3 h-3.5 w-3.5 rounded-bl-sm border-b-2 border-l-2 border-orange-400/50" />
                        <div className="pointer-events-none absolute bottom-3 right-3 h-3.5 w-3.5 rounded-br-sm border-b-2 border-r-2 border-orange-400/50" />

                        {/* 装备槽位 HUD 安全虚线参考框 */}
                        {showSafeZone && (
                            <div className="pointer-events-none absolute inset-0 z-0">
                                {/* 顶部头饰位参考 */}
                                <div className="absolute left-1/2 top-[3%] -translate-x-1/2 rounded-lg border border-dashed border-amber-400/30 bg-amber-400/5 px-2 py-1 text-[9px] text-amber-500/70">
                                    [头饰]
                                </div>
                                {/* 左翼参考：手套、武器、胸甲 */}
                                <div className="absolute left-[3%] top-[12%] rounded-lg border border-dashed border-slate-400/25 bg-slate-400/5 px-1.5 py-1 text-[9px] text-slate-400/60">
                                    手套
                                </div>
                                <div className="absolute left-[2%] top-[36%] rounded-lg border border-dashed border-orange-400/30 bg-orange-400/5 px-1.5 py-1 text-[9px] text-orange-500/70">
                                    武器
                                </div>
                                <div className="absolute left-[2%] top-[60%] rounded-lg border border-dashed border-slate-400/25 bg-slate-400/5 px-1.5 py-1 text-[9px] text-slate-400/60">
                                    铠甲
                                </div>
                                {/* 右翼参考：吊坠、副手、靴子 */}
                                <div className="absolute right-[3%] top-[12%] rounded-lg border border-dashed border-slate-400/25 bg-slate-400/5 px-1.5 py-1 text-[9px] text-slate-400/60">
                                    吊坠
                                </div>
                                <div className="absolute right-[2%] top-[36%] rounded-lg border border-dashed border-orange-400/30 bg-orange-400/5 px-1.5 py-1 text-[9px] text-orange-500/70">
                                    副手
                                </div>
                                <div className="absolute right-[2%] top-[60%] rounded-lg border border-dashed border-slate-400/25 bg-slate-400/5 px-1.5 py-1 text-[9px] text-slate-400/60">
                                    靴子
                                </div>
                            </div>
                        )}

                        {/* 脚底投影 / 职业光环底衬 */}
                        <div
                            className={`pointer-events-none absolute bottom-6 transition-all duration-300 md:bottom-8 ${
                                stageTheme === 'dark'
                                    ? 'h-10 w-44 rounded-[100%] bg-gradient-to-r from-orange-500/30 via-amber-400/50 to-orange-500/30 blur-lg'
                                    : 'h-8 w-40 rounded-[100%] border border-orange-200/80 bg-orange-100/50'
                            }`}
                        />

                        {/* 人物立绘核心图片 */}
                        {preview.url ? (
                            <img
                                ref={heroImgRef}
                                src={preview.url}
                                alt="冒险立绘预览"
                                draggable={false}
                                style={{
                                    transform: `translate(${offsetX}%, ${offsetY}%) scale(${scale})`,
                                    transformOrigin: '50% 95.7%',
                                    transition: isDraggingState ? 'none' : 'transform 0.15s ease-out',
                                }}
                                className="pointer-events-none relative h-[240px] w-[220px] max-w-full select-none object-contain sm:h-[300px] sm:w-[270px] md:h-[330px] md:w-[300px]"
                            />
                        ) : (
                            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-slate-400">
                                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
                                    <UserRound className="h-8 w-8 stroke-1 text-slate-400" />
                                </div>
                                <div className="space-y-1">
                                    <p className="text-sm font-medium text-slate-600">暂未设置专属冒险立绘</p>
                                    <p className="text-xs text-slate-400">
                                        在右侧使用 AI 灵感绘制，或上传自己的立绘图片
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* 悬停操作提示浮层 */}
                        {preview.url && !portrait.active && (
                            <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-1.5 rounded-lg bg-black/40 px-2.5 py-1 text-[11px] text-white/90 backdrop-blur-md opacity-80 transition-opacity">
                                <Move className="h-3 w-3 shrink-0" />
                                <span>{isDraggingState ? '松开即完成对位' : '按住拖动平移 · 滚轮缩放'}</span>
                            </div>
                        )}

                        {/* AI 生成中状态药丸 */}
                        {portrait.active && (
                            <div
                                role="status"
                                className="absolute bottom-5 flex items-center gap-2.5 rounded-full border border-orange-200 bg-white/95 px-4 py-2 text-xs font-medium text-orange-700 shadow-xl backdrop-blur-md"
                            >
                                <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-orange-600" />
                                <span>{statusLabels[portrait.task?.status || ''] || '正在处理中…'}</span>
                            </div>
                        )}
                    </div>

                    {/* 精炼一体化微调工具条 */}
                    {preview.url && (
                        <div className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-2xs">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                                <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                                    <span>立绘对位调节</span>
                                    <span className="font-normal text-slate-400 text-[11px]">
                                        (不消耗生图额度)
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 text-xs">
                                    <button
                                        type="button"
                                        disabled={pending || portrait.active || scale === 1}
                                        onClick={() => setScaleDraft(1)}
                                        className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-orange-600 disabled:opacity-40"
                                    >
                                        <RotateCcw className="h-3 w-3" />
                                        <span>复位 100%</span>
                                    </button>
                                    <span className="text-slate-300">|</span>
                                    <button
                                        type="button"
                                        disabled={pending || portrait.active || (offsetX === 0 && offsetY === 0)}
                                        onClick={() => setPositionDraft({x: 0, y: 0})}
                                        className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-orange-600 disabled:opacity-40"
                                    >
                                        <Move className="h-3 w-3" />
                                        <span>一键居中</span>
                                    </button>
                                </div>
                            </div>

                            <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                {/* 缩放调节 */}
                                <div>
                                    <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
                                        <span>大小缩放</span>
                                        <span className="font-mono font-semibold text-orange-600">
                                            {Math.round(scale * 100)}%
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            disabled={pending || portrait.active || scale <= 0.6}
                                            onClick={() => setScaleDraft(Math.max(0.6, scale - 0.05))}
                                            className="rounded-lg border border-slate-200 p-1 text-slate-500 hover:bg-slate-50 hover:text-orange-600 disabled:opacity-40"
                                            title="缩小 5%"
                                        >
                                            <Minus className="h-3 w-3" />
                                        </button>
                                        <input
                                            type="range"
                                            min={60}
                                            max={150}
                                            step={5}
                                            value={Math.round(scale * 100)}
                                            disabled={pending || portrait.active}
                                            onChange={e => setScaleDraft(Number(e.target.value) / 100)}
                                            className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-orange-500"
                                        />
                                        <button
                                            type="button"
                                            disabled={pending || portrait.active || scale >= 1.5}
                                            onClick={() => setScaleDraft(Math.min(1.5, scale + 0.05))}
                                            className="rounded-lg border border-slate-200 p-1 text-slate-500 hover:bg-slate-50 hover:text-orange-600 disabled:opacity-40"
                                            title="放大 5%"
                                        >
                                            <Plus className="h-3 w-3" />
                                        </button>
                                    </div>
                                </div>

                                {/* 水平与垂直微调 */}
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <div className="mb-1 flex items-center justify-between text-[11px] text-slate-600">
                                            <span>左右</span>
                                            <span className="font-mono text-orange-600">
                                                {offsetX > 0 ? `+${offsetX}%` : `${offsetX}%`}
                                            </span>
                                        </div>
                                        <input
                                            type="range"
                                            min={-20}
                                            max={20}
                                            step={1}
                                            value={offsetX}
                                            disabled={pending || portrait.active}
                                            onChange={e =>
                                                setPositionDraft({x: Number(e.target.value), y: offsetY})
                                            }
                                            className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-orange-500"
                                        />
                                    </div>
                                    <div>
                                        <div className="mb-1 flex items-center justify-between text-[11px] text-slate-600">
                                            <span>上下</span>
                                            <span className="font-mono text-orange-600">
                                                {offsetY > 0 ? `+${offsetY}%` : `${offsetY}%`}
                                            </span>
                                        </div>
                                        <input
                                            type="range"
                                            min={-20}
                                            max={20}
                                            step={1}
                                            value={offsetY}
                                            disabled={pending || portrait.active}
                                            onChange={e =>
                                                setPositionDraft({x: offsetX, y: Number(e.target.value)})
                                            }
                                            className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-orange-500"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* 右栏：立绘生成与上传工作区 */}
                <div className="flex min-w-0 flex-col gap-3.5">
                    {/* 顶部胶囊分段控制器：AI 绘制 vs 自定义上传 */}
                    <div className="grid grid-cols-2 rounded-2xl bg-slate-100 p-1 text-xs font-semibold">
                        <button
                            type="button"
                            onClick={() => setActiveTab('generate')}
                            className={`flex items-center justify-center gap-1.5 rounded-xl py-2 transition-all ${
                                activeTab === 'generate'
                                    ? 'bg-white text-orange-600 shadow-sm'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            <Sparkles className="h-3.5 w-3.5 shrink-0" />
                            <span>✨ AI 灵感绘制</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('upload')}
                            className={`flex items-center justify-center gap-1.5 rounded-xl py-2 transition-all ${
                                activeTab === 'upload'
                                    ? 'bg-white text-orange-600 shadow-sm'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            <Upload className="h-3.5 w-3.5 shrink-0" />
                            <span>📤 自定义上传</span>
                            {localPortrait.uploaded && (
                                <span className="h-1.5 w-1.5 rounded-full bg-lime-500" />
                            )}
                        </button>
                    </div>

                    {/* Tab 1: AI 灵感绘制 */}
                    {activeTab === 'generate' && (
                        <div className="flex flex-col gap-3">
                            {/* 灵感引导贴士 */}
                            <div className="flex items-start gap-2 rounded-xl border border-orange-100 bg-orange-50/60 p-2.5 text-xs leading-5 text-orange-950">
                                <Wand2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-600" />
                                <span>
                                    建议自然睁眼微笑与正面站姿。生成后将自动对齐并同步至装备栏。
                                </span>
                            </div>

                            {/* 生图模型选择 */}
                            <div>
                                <label className="mb-1 block text-xs font-semibold text-slate-700">
                                    生图模型
                                </label>
                                <Select
                                    value={modelId}
                                    onChange={val => {
                                        setOptionsLoading(true);
                                        setOptionsError('');
                                        setModelId(val);
                                    }}
                                    menuPortal={true}
                                    disabled={pending || portrait.active || optionsLoading}
                                    options={[{value: '', label: '使用默认生图模型'}, ...(options?.models || [])]}
                                />
                            </div>

                            {/* 双槽位参考图：角色外貌槽 + 画风风格槽 */}
                            <div className="grid grid-cols-2 gap-2.5">
                                {/* 角色外貌参考 */}
                                <div
                                    role="group"
                                    aria-label="角色外貌参考"
                                    onDragEnter={handleRefDragEnter}
                                    onDragLeave={handleRefDragLeave}
                                    onDrop={handleRefDrop}
                                    onDragOver={e => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        e.dataTransfer.dropEffect = uploadBlocked ? 'none' : 'copy';
                                    }}
                                    className={`relative flex flex-col justify-between rounded-xl border p-2 transition-colors ${
                                        refDragging && !uploadBlocked
                                            ? 'border-orange-500 bg-orange-50/80 ring-2 ring-orange-200'
                                            : 'border-slate-200 bg-white hover:border-slate-300'
                                    }`}
                                >
                                    <div className="mb-1 flex items-center justify-between text-xs">
                                        <span className="font-semibold text-slate-700">
                                            角色参考 <span className="font-normal text-slate-400">可选</span>
                                        </span>
                                        {reference.reference && (
                                            <button
                                                type="button"
                                                disabled={pending || portrait.active}
                                                onClick={reference.clear}
                                                className="rounded p-0.5 text-slate-400 hover:text-red-500"
                                            >
                                                <X className="h-3 w-3" />
                                            </button>
                                        )}
                                    </div>
                                    <input
                                        ref={refFileInput}
                                        type="file"
                                        aria-label="上传角色参考"
                                        accept="image/png,image/jpeg,image/webp"
                                        className="hidden"
                                        disabled={pending || portrait.active}
                                        onChange={e => {
                                            const file = e.target.files?.[0];
                                            e.target.value = '';
                                            if (file) void reference.upload(file);
                                        }}
                                    />
                                    <button
                                        type="button"
                                        disabled={pending || portrait.active}
                                        onClick={() => refFileInput.current?.click()}
                                        className="flex h-16 w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-orange-200/80 bg-orange-50/40 p-1 text-[11px] text-orange-700 hover:bg-orange-50 disabled:opacity-50"
                                    >
                                        {reference.reference ? (
                                            <img
                                                src={reference.reference.url}
                                                alt="角色参考"
                                                className="h-10 w-10 rounded object-cover shadow-sm"
                                            />
                                        ) : (
                                            <>
                                                <ImagePlus className="h-4 w-4 stroke-1.5" />
                                                <span className="text-[10px]">
                                                    {reference.busy ? '上传中…' : '点击或拖入'}
                                                </span>
                                            </>
                                        )}
                                    </button>
                                    <p className="mt-1 text-[10px] leading-tight text-slate-400">
                                        {reference.reference ? '已替换 Agent 头像' : '未传时沿用 Agent 外貌'}
                                    </p>
                                </div>

                                {/* 画风色彩参考 */}
                                <div
                                    role="group"
                                    aria-label="画风参考"
                                    onDragEnter={handleStyleDragEnter}
                                    onDragLeave={handleStyleDragLeave}
                                    onDrop={handleStyleDrop}
                                    onDragOver={e => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        e.dataTransfer.dropEffect = uploadBlocked ? 'none' : 'copy';
                                    }}
                                    className={`relative flex flex-col justify-between rounded-xl border p-2 transition-colors ${
                                        styleDragging && !uploadBlocked
                                            ? 'border-orange-500 bg-orange-50/80 ring-2 ring-orange-200'
                                            : 'border-slate-200 bg-white hover:border-slate-300'
                                    }`}
                                >
                                    <div className="mb-1 flex items-center justify-between text-xs">
                                        <span className="font-semibold text-slate-700">
                                            画风参考 <span className="font-normal text-slate-400">可选</span>
                                        </span>
                                        {styleReference.reference && (
                                            <button
                                                type="button"
                                                disabled={pending || portrait.active}
                                                onClick={styleReference.clear}
                                                className="rounded p-0.5 text-slate-400 hover:text-red-500"
                                            >
                                                <X className="h-3 w-3" />
                                            </button>
                                        )}
                                    </div>
                                    <input
                                        ref={styleFileInput}
                                        type="file"
                                        aria-label="上传画风参考"
                                        accept="image/png,image/jpeg,image/webp"
                                        className="hidden"
                                        disabled={pending || portrait.active}
                                        onChange={e => {
                                            const file = e.target.files?.[0];
                                            e.target.value = '';
                                            if (file) void styleReference.upload(file);
                                        }}
                                    />
                                    <button
                                        type="button"
                                        disabled={pending || portrait.active}
                                        onClick={() => styleFileInput.current?.click()}
                                        className="flex h-16 w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-orange-200/80 bg-orange-50/40 p-1 text-[11px] text-orange-700 hover:bg-orange-50 disabled:opacity-50"
                                    >
                                        {styleReference.reference ? (
                                            <img
                                                src={styleReference.reference.url}
                                                alt="画风参考"
                                                className="h-10 w-10 rounded object-cover shadow-sm"
                                            />
                                        ) : (
                                            <>
                                                <ImagePlus className="h-4 w-4 stroke-1.5" />
                                                <span className="text-[10px]">
                                                    {styleReference.busy ? '上传中…' : '点击或拖入'}
                                                </span>
                                            </>
                                        )}
                                    </button>
                                    <p className="mt-1 text-[10px] leading-tight text-slate-400">
                                        只参考色彩明暗与笔触
                                    </p>
                                </div>
                            </div>

                            {/* 模型能力提示 */}
                            {!optionsLoading && !capable && (
                                <div className="flex items-center gap-1.5 rounded-lg bg-amber-50 p-2 text-xs text-amber-700">
                                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                    <span>{options?.message || '请选择支持参考图的 Grsai 生图模型。'}</span>
                                </div>
                            )}

                            {/* 补充特征与细节描述 */}
                            <div>
                                <div className="mb-1 flex items-center justify-between text-xs">
                                    <label htmlFor="portrait-extra" className="font-semibold text-slate-700">
                                        外观与服装细节 <span className="font-normal text-slate-400">可选</span>
                                    </label>
                                    <span className="font-mono text-[10px] text-slate-400">
                                        {extra.length}/2000
                                    </span>
                                </div>
                                <textarea
                                    id="portrait-extra"
                                    value={extra}
                                    onChange={e => setExtra(e.target.value)}
                                    maxLength={2000}
                                    rows={2}
                                    disabled={pending || portrait.active}
                                    placeholder="例如：身着红白兜帽轻风衣，手持魔杖，神情自然自信…"
                                    className="w-full resize-none rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-800 outline-none transition-all focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                                />
                                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                                    {QUICK_TAGS.map(tag => (
                                        <button
                                            key={tag}
                                            type="button"
                                            disabled={pending || portrait.active}
                                            onClick={() => addQuickTag(tag)}
                                            className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-600 transition-colors hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700"
                                        >
                                            +{tag}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* 生图主按钮 */}
                            <button
                                type="button"
                                disabled={pending || portrait.active || optionsLoading || !capable || !hasReference}
                                onClick={generate}
                                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-2.5 text-xs font-semibold text-white shadow-md shadow-orange-500/20 transition-all hover:from-orange-600 hover:to-amber-600 active:scale-[0.99] disabled:opacity-40"
                            >
                                {pending || portrait.active ? (
                                    <LoaderCircle className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Sparkles className="h-4 w-4" />
                                )}
                                <span>{portrait.task ? '重新生成冒险立绘' : '✨ 开始绘制冒险立绘'}</span>
                            </button>
                        </div>
                    )}

                    {/* Tab 2: 自定义本地立绘上传 */}
                    {activeTab === 'upload' && (
                        <div className="flex flex-col gap-3">
                            <div
                                role="group"
                                aria-label="上传本地专属立绘"
                                onDragEnter={handleLocalDragEnter}
                                onDragLeave={handleLocalDragLeave}
                                onDrop={handleLocalDrop}
                                onDragOver={e => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    e.dataTransfer.dropEffect = uploadBlocked ? 'none' : 'copy';
                                }}
                                className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition-all ${
                                    localDragging && !uploadBlocked
                                        ? 'border-orange-500 bg-orange-50/80 ring-4 ring-orange-100'
                                        : 'border-slate-200 bg-slate-50/50 hover:border-orange-300 hover:bg-white'
                                }`}
                            >
                                <input
                                    ref={localFileInput}
                                    type="file"
                                    aria-label="选择自己的冒险立绘"
                                    accept="image/png,image/jpeg,image/webp"
                                    className="hidden"
                                    disabled={uploadBlocked}
                                    onChange={e => {
                                        const file = e.target.files?.[0];
                                        e.target.value = '';
                                        if (file) void uploadLocal(file);
                                    }}
                                />

                                <div className="mb-2.5 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-100/60 text-orange-600">
                                    {localPortrait.busy ? (
                                        <LoaderCircle className="h-6 w-6 animate-spin" />
                                    ) : (
                                        <Upload className="h-6 w-6 stroke-1.5" />
                                    )}
                                </div>

                                <h3 className="mb-1 text-xs font-semibold text-slate-800">
                                    {localPortrait.busy
                                        ? '正在上传立绘…'
                                        : localDragging
                                          ? '松开即可完成上传'
                                          : '拖拽图片至此处，或点击浏览'}
                                </h3>
                                <p className="text-[11px] text-slate-400">支持透明 PNG、JPEG、WebP（最大 20MB）</p>

                                <button
                                    type="button"
                                    disabled={uploadBlocked}
                                    onClick={() => localFileInput.current?.click()}
                                    className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-orange-500 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-orange-600 disabled:opacity-40"
                                >
                                    <Upload className="h-3 w-3" />
                                    <span>选择文件</span>
                                </button>
                            </div>

                            {localPortrait.uploaded && (
                                <div className="flex items-center justify-between rounded-xl border border-lime-200 bg-lime-50/60 p-2.5">
                                    <div className="flex min-w-0 items-center gap-2">
                                        <Check className="h-4 w-4 text-lime-700 shrink-0" />
                                        <p className="truncate text-xs font-semibold text-slate-800">
                                            {localPortrait.uploaded.name}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        disabled={uploadBlocked}
                                        onClick={() => localFileInput.current?.click()}
                                        className="shrink-0 text-xs font-medium text-orange-600 hover:underline"
                                    >
                                        换一张
                                    </button>
                                </div>
                            )}

                            <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 text-[11px] leading-5 text-slate-500">
                                <p className="font-medium text-slate-700">💡 推荐透明背景 PNG</p>
                                <p>
                                    透明底立绘能与装备界面的法阵和光影完美融合。本地上传完全不消耗生图额度。
                                </p>
                            </div>
                        </div>
                    )}

                    {/* 错误告警 */}
                    {error && (
                        <div
                            role="alert"
                            className="flex items-start gap-1.5 rounded-xl bg-red-50 p-2.5 text-xs text-red-700"
                        >
                            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <div className="flex-1">
                                <span>{error}</span>
                                {optionsError && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setOptionsLoading(true);
                                            setOptionsError('');
                                            setRetry(v => v + 1);
                                        }}
                                        className="ml-2 underline font-medium"
                                    >
                                        重试
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* 常驻底部应用与操作条 */}
                    <div className="mt-auto border-t border-slate-100 pt-3">
                        <div className="flex flex-col gap-2">
                            {preview.url && (
                                <button
                                    type="button"
                                    disabled={pending || !canSave || portrait.active}
                                    onClick={save}
                                    className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-all ${
                                        canSave
                                            ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20 hover:bg-orange-600 active:scale-[0.99]'
                                            : 'border border-slate-200 bg-slate-50 text-slate-400'
                                    }`}
                                >
                                    <Check className="h-3.5 w-3.5" />
                                    <span>
                                        {newImage
                                            ? '应用此立绘到装备页'
                                            : sizeChanged && positionChanged
                                              ? '保存大小和位置调整'
                                              : positionChanged
                                                ? '保存立绘位置'
                                                : sizeChanged
                                                  ? '保存立绘大小'
                                                  : '已应用到装备页'}
                                    </span>
                                </button>
                            )}

                            {portrait.active && (
                                <button
                                    type="button"
                                    disabled={pending}
                                    onClick={() => void portrait.cancel()}
                                    className="py-1 text-center text-xs text-slate-500 hover:text-red-500"
                                >
                                    停止等待
                                </button>
                            )}

                            {portrait.saved.assetId && (
                                <button
                                    type="button"
                                    disabled={pending || portrait.active}
                                    onClick={() => {
                                        void portrait.clear();
                                        setScaleDraft(null);
                                        setPositionDraft(null);
                                        setPreviewSource('current');
                                    }}
                                    className="py-1 text-center text-xs text-slate-400 hover:text-slate-600"
                                >
                                    恢复默认职业形象
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </WorldDialog>
    );
}
