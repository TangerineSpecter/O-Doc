import {useEffect, useRef, useState} from 'react';
import type {DragEvent} from 'react';
import {collectDroppedFiles} from '@/utils/imageUpload';
import {createRequestKey} from '@/utils/requestKey';
import {Check, ImagePlus, LoaderCircle, Sparkles, Upload, UserRound, X} from 'lucide-react';
import {getPortraitOptions} from '@/api/loadoutPortrait';
import type {PortraitOptions} from '@/api/loadoutPortrait';
import {Select} from '@/components/common/Select';
import WorldDialog from '@/components/AgentWorld/WorldDialog';
import {usePortraitImage} from './useLoadoutPortrait';
import type {useLoadoutPortrait} from './useLoadoutPortrait';
import {usePortraitReference} from './usePortraitReference';
import {usePortraitUpload} from './usePortraitUpload';

type Props = {agentId: string; portrait: ReturnType<typeof useLoadoutPortrait>; onClose: () => void};
const labels: Record<string, string> = {submitting: '正在提交', generating: '正在绘制人物', download_pending: '正在保存图片', succeeded: '立绘已生成，确认后应用', failed: '生成失败', submission_unknown: '提交结果暂不明确，请稍后重新打开查询', timed_out: '已达到等待上限，可重新生成', cancelled: '已停止等待'};

export default function LoadoutPortraitDialog({agentId, portrait, onClose}: Props) {
    const [options, setOptions] = useState<PortraitOptions | null>(null);
    const [modelId, setModelId] = useState('');
    const [extra, setExtra] = useState('');
    const [optionsError, setOptionsError] = useState('');
    const [optionsLoading, setOptionsLoading] = useState(true);
    const [retry, setRetry] = useState(0);
    const [scaleDraft, setScaleDraft] = useState<number | null>(null);
    const [positionDraft, setPositionDraft] = useState<{x: number; y: number} | null>(null);
    const [previewSource, setPreviewSource] = useState<'current' | 'generated' | 'uploaded'>('current');
    const [dragging, setDragging] = useState(false);
    const [styleDragging, setStyleDragging] = useState(false);
    const [portraitDragging, setPortraitDragging] = useState(false);
    const dragDepth = useRef(0);
    const styleDragDepth = useRef(0);
    const portraitDragDepth = useRef(0);
    const fileInput = useRef<HTMLInputElement>(null);
    const styleFileInput = useRef<HTMLInputElement>(null);
    const portraitFileInput = useRef<HTMLInputElement>(null);
    const reference = usePortraitReference();
    const styleReference = usePortraitReference();
    const localPortrait = usePortraitUpload();
    const generated = portrait.task?.status === 'succeeded' ? portrait.task : null;
    const hasGenerated = Boolean(generated && generated.assetId !== portrait.saved.assetId);
    const hasUploaded = Boolean(localPortrait.uploaded && localPortrait.uploaded.assetId !== portrait.saved.assetId);
    const resolvedPreviewSource = previewSource === 'uploaded' && hasUploaded ? 'uploaded'
        : previewSource === 'generated' && hasGenerated ? 'generated'
            : !portrait.saved.assetId && hasGenerated ? 'generated'
                : !portrait.saved.assetId && hasUploaded ? 'uploaded' : 'current';
    const selectedTask = resolvedPreviewSource === 'generated' ? generated : null;
    const selectedUploadedPortrait = resolvedPreviewSource === 'uploaded' ? localPortrait.uploaded : null;
    const selectedAssetId = selectedTask?.assetId || selectedUploadedPortrait?.assetId || portrait.saved.assetId;
    const previewId = selectedAssetId;
    const preview = usePortraitImage(previewId);
    const scale = scaleDraft ?? portrait.saved.scale ?? 1;
    const offsetX = positionDraft?.x ?? portrait.saved.offsetX ?? 0;
    const offsetY = positionDraft?.y ?? portrait.saved.offsetY ?? 0;
    useEffect(() => {
        let alive = true;
        void getPortraitOptions(agentId, modelId || undefined).then(value => {if (alive) setOptions(value);})
            .catch(err => {if (alive) {setOptions(null); setOptionsError(err instanceof Error ? err.message : '模型配置加载失败');}})
            .finally(() => {if (alive) setOptionsLoading(false);});
        return () => {alive = false;};
    }, [agentId, modelId, retry]);
    const capable = options?.configured && options.supportsReferenceImages;
    const hasReference = Boolean(reference.reference || options?.agentReferenceImages?.avatar || options?.agentReferenceImages?.fullBody);
    const pending = portrait.busy || portrait.loading || reference.busy || styleReference.busy || localPortrait.busy;
    const newImage = Boolean(selectedAssetId && selectedAssetId !== portrait.saved.assetId);
    const sizeChanged = Math.abs(scale - (portrait.saved.scale ?? 1)) > 0.001;
    const positionChanged = Math.abs(offsetX - (portrait.saved.offsetX ?? 0)) > 0.001 || Math.abs(offsetY - (portrait.saved.offsetY ?? 0)) > 0.001;
    const canSave = Boolean(preview.url) && (newImage || sizeChanged || positionChanged);
    const error = localPortrait.error || reference.error || styleReference.error || portrait.error || optionsError || preview.error;
    const previewChoices: Array<{source: 'current' | 'generated' | 'uploaded'; label: string}> = [
        ...(portrait.saved.assetId ? [{source: 'current' as const, label: '当前立绘'}] : []),
        ...(hasGenerated ? [{source: 'generated' as const, label: '生成结果'}] : []),
        ...(hasUploaded ? [{source: 'uploaded' as const, label: '本地上传'}] : []),
    ];

    const uploadBlocked = pending || portrait.active;
    const dragEnter = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault(); event.stopPropagation();
        if (uploadBlocked || !Array.from(event.dataTransfer.types).includes('Files')) return;
        dragDepth.current++;
        setDragging(true);
    };
    const dragLeave = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault(); event.stopPropagation();
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (!dragDepth.current) setDragging(false);
    };
    const dropReference = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault(); event.stopPropagation();
        dragDepth.current = 0; setDragging(false);
        if (uploadBlocked) return;
        const file = collectDroppedFiles(event.dataTransfer)[0];
        if (file) void reference.upload(file);
    };

    const styleDragEnter = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault(); event.stopPropagation();
        if (uploadBlocked || !Array.from(event.dataTransfer.types).includes('Files')) return;
        styleDragDepth.current++;
        setStyleDragging(true);
    };
    const styleDragLeave = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault(); event.stopPropagation();
        styleDragDepth.current = Math.max(0, styleDragDepth.current - 1);
        if (!styleDragDepth.current) setStyleDragging(false);
    };
    const dropStyleReference = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault(); event.stopPropagation();
        styleDragDepth.current = 0; setStyleDragging(false);
        if (uploadBlocked) return;
        const file = collectDroppedFiles(event.dataTransfer)[0];
        if (file) void styleReference.upload(file);
    };

    const uploadLocalPortrait = async (file: File) => {
        const result = await localPortrait.upload(file);
        if (result) setPreviewSource('uploaded');
    };
    const portraitDragEnter = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault(); event.stopPropagation();
        if (uploadBlocked || !Array.from(event.dataTransfer.types).includes('Files')) return;
        portraitDragDepth.current++;
        setPortraitDragging(true);
    };
    const portraitDragLeave = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault(); event.stopPropagation();
        portraitDragDepth.current = Math.max(0, portraitDragDepth.current - 1);
        if (!portraitDragDepth.current) setPortraitDragging(false);
    };
    const dropLocalPortrait = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault(); event.stopPropagation();
        portraitDragDepth.current = 0; setPortraitDragging(false);
        if (uploadBlocked) return;
        const file = collectDroppedFiles(event.dataTransfer)[0];
        if (file) void uploadLocalPortrait(file);
    };

    const generate = () => {
        setPreviewSource('generated');
        void portrait.generate({
            modelId: modelId || undefined, prompt: extra, requestId: createRequestKey(),
            referenceImageId: reference.reference?.id,
            styleReferenceImageId: styleReference.reference?.id,
            ...(options?.defaultAspectRatio ? {aspectRatio: options.defaultAspectRatio} : {}),
            ...(options?.defaultImageSize ? {imageSize: options.defaultImageSize} : {}),
        });
    };
    const save = () => {
        if (selectedTask) void portrait.apply({taskId: selectedTask.taskId}, scale, offsetX, offsetY);
        else if (selectedUploadedPortrait) void portrait.apply({assetId: selectedUploadedPortrait.assetId}, scale, offsetX, offsetY);
        else void portrait.saveAdjustments(scale, offsetX, offsetY);
    };

    return <WorldDialog title="专属冒险立绘" description="上传自己的立绘，或分别提供角色与画风参考图；调整后应用到装备页" onClose={onClose} size="wide" fixedHeight={false}>
        <div data-loadout-portrait-dialog className="grid gap-5 p-1 md:grid-cols-[minmax(0,1fr)_300px]">
            <div className="flex min-w-0 flex-col gap-3">
                {previewChoices.length > 1 && (
                    <div role="group" aria-label="预览图片" className="inline-flex self-center rounded-full bg-slate-100 p-1 text-xs">
                        {previewChoices.map(choice => <button key={choice.source} type="button" aria-pressed={resolvedPreviewSource === choice.source} onClick={() => setPreviewSource(choice.source)} className={`rounded-full px-4 py-1.5 ${resolvedPreviewSource === choice.source ? 'bg-white font-semibold text-orange-700 shadow-sm' : 'text-slate-500'}`}>{choice.label}</button>)}
                    </div>
                )}
                <div className="relative flex h-[330px] items-end justify-center overflow-hidden rounded-2xl border border-orange-100 bg-gradient-to-b from-slate-50 via-white to-orange-50/60 pb-5 md:h-[490px] md:pb-8">
                    <div className="absolute bottom-5 h-8 w-36 rounded-[100%] border border-orange-200 bg-orange-100/30 md:bottom-8 md:w-44"/>
                    {preview.url ? (
                        <img src={preview.url} alt="冒险立绘预览" style={{transform: `translate(${offsetX}%, ${offsetY}%) scale(${scale})`, transformOrigin: '50% 95.7%'}} className="relative h-[200px] w-[180px] max-w-full object-contain md:h-[300px] md:w-[270px]"/>
                    ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-400"><UserRound className="h-16 w-16 stroke-1"/><span className="text-sm">为这个角色绘制冒险形象</span></div>
                    )}
                    {portrait.active && <div role="status" className="absolute bottom-3 flex items-center gap-2 rounded-full bg-white/95 px-4 py-2 text-xs text-orange-700 shadow-sm"><LoaderCircle className="h-4 w-4 animate-spin"/>{labels[portrait.task?.status || '']}</div>}
                </div>
                {preview.url && <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                        <label htmlFor="portrait-scale" className="font-semibold text-slate-700">人物大小 <span className="ml-1 font-mono text-orange-600">{Math.round(scale * 100)}%</span></label>
                        <button type="button" onClick={() => setScaleDraft(1)} disabled={pending || portrait.active} className="text-slate-500 hover:text-orange-600">重置大小</button>
                    </div>
                    <input id="portrait-scale" type="range" min={60} max={150} step={5} value={Math.round(scale * 100)} disabled={pending || portrait.active} onChange={event => setScaleDraft(Number(event.target.value) / 100)} className="w-full accent-orange-500"/>
                    <p className="mt-1 text-[11px] text-slate-400">60%–150% · 预览后点击保存，不消耗生图额度</p>
                </div>}
                {preview.url && <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="mb-3 flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-slate-700">人物位置</span>
                        <button type="button" onClick={() => setPositionDraft({x: 0, y: 0})} disabled={pending || portrait.active || (offsetX === 0 && offsetY === 0)} className="text-slate-500 hover:text-orange-600 disabled:opacity-40">居中</button>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="portrait-offset-x" className="mb-1 flex items-center justify-between text-[11px] text-slate-600">
                                <span>左右</span><span className="font-mono text-orange-600">{offsetX > 0 ? '+' : ''}{offsetX}%</span>
                            </label>
                            <input id="portrait-offset-x" type="range" min={-20} max={20} step={1} value={offsetX} disabled={pending || portrait.active} onChange={event => setPositionDraft({x: Number(event.target.value), y: offsetY})} className="w-full accent-orange-500"/>
                            <div className="flex justify-between text-[10px] text-slate-400"><span>左</span><span>右</span></div>
                        </div>
                        <div>
                            <label htmlFor="portrait-offset-y" className="mb-1 flex items-center justify-between text-[11px] text-slate-600">
                                <span>上下</span><span className="font-mono text-orange-600">{offsetY > 0 ? '+' : ''}{offsetY}%</span>
                            </label>
                            <input id="portrait-offset-y" type="range" min={-20} max={20} step={1} value={offsetY} disabled={pending || portrait.active} onChange={event => setPositionDraft({x: offsetX, y: Number(event.target.value)})} className="w-full accent-orange-500"/>
                            <div className="flex justify-between text-[10px] text-slate-400"><span>上</span><span>下</span></div>
                        </div>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">最多移动立绘框的 20%；预览后保存位置，不消耗生图额度</p>
                </div>}
            </div>
            <div className="flex flex-col gap-4">
                <div className="rounded-xl border border-orange-100 bg-orange-50/60 p-3 text-xs leading-6 text-orange-900">默认自然睁眼、轻微闭嘴微笑，避免眯眼和张嘴大笑。确认后应用，立绘、大小和位置随 Agent 同步。</div>
                <div role="group" aria-label="本次参考图上传区域" onDragEnter={dragEnter} onDragLeave={dragLeave} onDrop={dropReference}
                    onDragOver={event => {event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = uploadBlocked ? 'none' : 'copy';}}
                    className={`rounded-xl border p-3 transition-colors ${dragging && !uploadBlocked ? 'border-orange-400 bg-orange-50 ring-2 ring-orange-100' : 'border-slate-200 bg-white'}`}>
                    <div className="mb-2 flex items-center justify-between text-xs"><span className="font-semibold text-slate-700">角色参考图 <span className="font-normal text-slate-400">可选</span></span>{reference.reference && <button type="button" aria-label="移除角色参考图" disabled={pending || portrait.active} onClick={reference.clear} className="shrink-0 whitespace-nowrap text-slate-400 hover:text-orange-600"><X className="h-3.5 w-3.5"/></button>}</div>
                    <input ref={fileInput} type="file" aria-label="上传角色参考图" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={pending || portrait.active} onChange={event => {const file = event.target.files?.[0]; event.target.value = ''; if (file) void reference.upload(file);}}/>
                    <button type="button" disabled={pending || portrait.active} onClick={() => fileInput.current?.click()} className="flex w-full items-center gap-3 rounded-lg border border-dashed border-orange-200 bg-orange-50/40 p-3 text-left text-xs text-orange-700 disabled:opacity-40">
                        {reference.reference ? <img src={reference.reference.url} alt="本次参考图" className="h-14 w-14 shrink-0 rounded-lg object-contain"/> : <ImagePlus className="h-7 w-7 shrink-0 stroke-1.5"/>}
                        <span className="min-w-0 break-all">{reference.busy ? '正在上传…' : dragging && !uploadBlocked ? '松开即可上传角色参考图' : reference.reference?.name || '拖入图片，或点击上传角色参考图'}</span>
                    </button>
                    <p className="mt-2 text-[11px] leading-5 text-slate-400">{reference.reference ? '作为角色身份与外貌参考，替代 Agent 头像／全身图。' : '未上传时使用 Agent 头像／全身图与外貌。'}</p>
                </div>
                <div role="group" aria-label="画风参考图上传区域" onDragEnter={styleDragEnter} onDragLeave={styleDragLeave} onDrop={dropStyleReference}
                    onDragOver={event => {event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = uploadBlocked ? 'none' : 'copy';}}
                    className={`rounded-xl border p-3 transition-colors ${styleDragging && !uploadBlocked ? 'border-orange-400 bg-orange-50 ring-2 ring-orange-100' : 'border-slate-200 bg-white'}`}>
                    <div className="mb-2 flex items-center justify-between text-xs"><span className="font-semibold text-slate-700">画风参考图 <span className="font-normal text-slate-400">可选</span></span>{styleReference.reference && <button type="button" aria-label="移除画风参考图" disabled={pending || portrait.active} onClick={styleReference.clear} className="shrink-0 whitespace-nowrap text-slate-400 hover:text-orange-600"><X className="h-3.5 w-3.5"/></button>}</div>
                    <input ref={styleFileInput} type="file" aria-label="上传画风参考图" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={pending || portrait.active} onChange={event => {const file = event.target.files?.[0]; event.target.value = ''; if (file) void styleReference.upload(file);}}/>
                    <button type="button" disabled={pending || portrait.active} onClick={() => styleFileInput.current?.click()} className="flex w-full items-center gap-3 rounded-lg border border-dashed border-orange-200 bg-orange-50/40 p-3 text-left text-xs text-orange-700 disabled:opacity-40">
                        {styleReference.reference ? <img src={styleReference.reference.url} alt="画风参考图" className="h-14 w-14 shrink-0 rounded-lg object-contain"/> : <ImagePlus className="h-7 w-7 shrink-0 stroke-1.5"/>}
                        <span className="min-w-0 break-all">{styleReference.busy ? '正在上传…' : styleDragging && !uploadBlocked ? '松开即可上传画风参考图' : styleReference.reference?.name || '拖入图片，或点击上传画风参考图'}</span>
                    </button>
                    <p className="mt-2 text-[11px] leading-5 text-slate-400">上传后只参考线条、配色、明暗和渲染方式；不会采用图片中的角色身份、服装、姿势或构图。</p>
                </div>
                <div role="group" aria-label="上传本地立绘区域" onDragEnter={portraitDragEnter} onDragLeave={portraitDragLeave} onDrop={dropLocalPortrait}
                    onDragOver={event => {event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = uploadBlocked ? 'none' : 'copy';}}
                    className={`rounded-xl border p-3 transition-colors ${portraitDragging && !uploadBlocked ? 'border-orange-400 bg-orange-50 ring-2 ring-orange-100' : 'border-slate-200 bg-white'}`}>
                    <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-slate-700">自己的立绘 <span className="font-normal text-slate-400">可选</span></span>
                        {localPortrait.uploaded && <span className="rounded-full bg-lime-50 px-2 py-0.5 text-[10px] font-medium text-lime-700">已上传</span>}
                    </div>
                    <input ref={portraitFileInput} type="file" aria-label="选择自己的冒险立绘" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={uploadBlocked} onChange={event => {const file = event.target.files?.[0]; event.target.value = ''; if (file) void uploadLocalPortrait(file);}}/>
                    <button type="button" disabled={uploadBlocked} onClick={() => portraitFileInput.current?.click()} className="flex w-full items-center gap-3 rounded-lg border border-dashed border-orange-200 bg-orange-50/40 p-3 text-left text-xs text-orange-700 disabled:opacity-40">
                        {localPortrait.busy ? <LoaderCircle className="h-7 w-7 shrink-0 animate-spin"/> : <Upload className="h-7 w-7 shrink-0"/>}
                        <span className="min-w-0 break-all">{localPortrait.busy ? '正在上传立绘…' : portraitDragging && !uploadBlocked ? '松开即可上传并预览' : localPortrait.uploaded?.name || '拖入图片，或点击上传自己的立绘'}</span>
                    </button>
                    <p className="mt-2 text-[11px] leading-5 text-slate-400">支持 PNG、JPEG、WebP。上传后可在左侧预览并调整；点击「应用这张立绘」后才替换当前立绘，不消耗生图额度。</p>
                </div>
                <div><label className="mb-1.5 block text-xs font-semibold text-slate-700">生图模型</label><Select value={modelId} onChange={value => {setOptionsLoading(true); setOptionsError(''); setModelId(value);}} menuPortal={true} disabled={pending || portrait.active || optionsLoading} options={[{value: '', label: '使用默认生图模型'}, ...(options?.models || [])]}/></div>
                {!optionsLoading && !capable && <p className="text-xs text-amber-700">{options?.message || '请选择支持参考图的 Grsai 生图模型。'}</p>}
                {!optionsLoading && capable && !hasReference && <p className="text-xs text-amber-700">请上传本次参考图，或先为 Agent 配置已上传的头像／全身图。</p>}
                <div><label htmlFor="portrait-extra" className="mb-1.5 block text-xs font-semibold text-slate-700">补充外观要求 <span className="font-normal text-slate-400">可选</span></label><textarea id="portrait-extra" value={extra} onChange={event => setExtra(event.target.value)} maxLength={2000} rows={3} disabled={pending || portrait.active} placeholder="例如：保留红色帽子和标志性发饰，穿冒险者服装。" className="w-full resize-none rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"/></div>
                <p className="text-xs leading-5 text-slate-400">生成会使用模型额度。换装备不会自动重画，职业变化后可重新生成。此立绘用于装备页展示。</p>
                {error && <div role="alert" className="rounded-xl bg-red-50 p-3 text-xs text-red-700">{error}{optionsError && <button type="button" onClick={() => {setOptionsLoading(true); setOptionsError(''); setRetry(value => value + 1);}} className="ml-2 underline">重试</button>}</div>}
                {portrait.task && !portrait.active && resolvedPreviewSource !== 'uploaded' && <p role="status" className="text-xs text-slate-600">{labels[portrait.task.status] || portrait.task.status}{portrait.task.message && `：${portrait.task.message}`}</p>}
                <div className="mt-auto flex flex-col gap-2">
                    <button type="button" disabled={pending || portrait.active || optionsLoading || !capable || !hasReference} onClick={generate} className="flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-40">{pending ? <LoaderCircle className="h-4 w-4 animate-spin"/> : <Sparkles className="h-4 w-4"/>}{portrait.task ? '重新生成' : '生成冒险立绘'}</button>
                    {preview.url && <button type="button" disabled={pending || !canSave || portrait.active} onClick={save} className="flex items-center justify-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-2.5 text-sm font-semibold text-orange-700 disabled:opacity-50"><Check className="h-4 w-4"/>{newImage ? '应用这张立绘' : sizeChanged && positionChanged ? '保存大小和位置' : positionChanged ? '保存人物位置' : sizeChanged ? '保存人物大小' : '已应用到装备页'}</button>}
                    {portrait.active && <button type="button" disabled={pending} onClick={() => void portrait.cancel()} className="py-2 text-xs text-slate-500">停止等待（服务商可能继续处理）</button>}
                    {portrait.saved.assetId && <button type="button" disabled={pending || portrait.active} onClick={() => {void portrait.clear(); setScaleDraft(null); setPositionDraft(null); setPreviewSource('current');}} className="py-2 text-xs text-slate-500">恢复默认职业立绘</button>}
                </div>
            </div>
        </div>
    </WorldDialog>;
}
