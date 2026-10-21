import {useEffect, useRef, useState} from 'react';
import type {DragEvent} from 'react';
import {collectDroppedFiles} from '@/utils/imageUpload';
import {createRequestKey} from '@/utils/requestKey';
import {Check, ImagePlus, LoaderCircle, Sparkles, UserRound, X} from 'lucide-react';
import {getPortraitOptions} from '@/api/loadoutPortrait';
import type {PortraitOptions} from '@/api/loadoutPortrait';
import {Select} from '@/components/common/Select';
import WorldDialog from '@/components/AgentWorld/WorldDialog';
import {usePortraitImage} from './useLoadoutPortrait';
import type {useLoadoutPortrait} from './useLoadoutPortrait';
import {usePortraitReference} from './usePortraitReference';

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
    const [showCurrent, setShowCurrent] = useState(true);
    const [dragging, setDragging] = useState(false);
    const dragDepth = useRef(0);
    const fileInput = useRef<HTMLInputElement>(null);
    const reference = usePortraitReference();
    const generated = portrait.task?.status === 'succeeded' ? portrait.task : null;
    const selectedTask = !showCurrent || !portrait.saved.assetId ? generated : null;
    const previewId = selectedTask?.assetId || portrait.saved.assetId;
    const preview = usePortraitImage(previewId);
    const scale = scaleDraft ?? portrait.saved.scale ?? 1;
    useEffect(() => {
        let alive = true;
        void getPortraitOptions(agentId, modelId || undefined).then(value => {if (alive) setOptions(value);})
            .catch(err => {if (alive) {setOptions(null); setOptionsError(err instanceof Error ? err.message : '模型配置加载失败');}})
            .finally(() => {if (alive) setOptionsLoading(false);});
        return () => {alive = false;};
    }, [agentId, modelId, retry]);
    const capable = options?.configured && options.supportsReferenceImages;
    const hasReference = Boolean(reference.reference || options?.agentReferenceImages?.avatar || options?.agentReferenceImages?.fullBody);
    const pending = portrait.busy || portrait.loading || reference.busy;
    const newImage = Boolean(selectedTask && selectedTask.assetId !== portrait.saved.assetId);
    const sizeChanged = Math.abs(scale - (portrait.saved.scale ?? 1)) > 0.001;
    const canSave = Boolean(preview.url) && (newImage || sizeChanged);
    const error = portrait.error || optionsError || preview.error || reference.error;

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

    const generate = () => {
        setShowCurrent(false);
        void portrait.generate({
            modelId: modelId || undefined, prompt: extra, requestId: createRequestKey(),
            referenceImageId: reference.reference?.id,
            ...(options?.defaultAspectRatio ? {aspectRatio: options.defaultAspectRatio} : {}),
            ...(options?.defaultImageSize ? {imageSize: options.defaultImageSize} : {}),
        });
    };
    const save = () => {
        if (selectedTask) void portrait.apply(scale);
        else void portrait.saveScale(scale);
    };

    return <WorldDialog title="专属冒险立绘" description="上传参考图，绘制角色形象；调整大小后应用到装备页" onClose={onClose} size="wide" fixedHeight={false}>
        <div data-loadout-portrait-dialog className="grid gap-5 p-1 md:grid-cols-[minmax(0,1fr)_300px]">
            <div className="flex min-w-0 flex-col gap-3">
                {generated && portrait.saved.assetId && generated.assetId !== portrait.saved.assetId && (
                    <div role="group" aria-label="预览图片" className="inline-flex self-center rounded-full bg-slate-100 p-1 text-xs">
                        <button type="button" onClick={() => setShowCurrent(true)} className={`rounded-full px-4 py-1.5 ${showCurrent ? 'bg-white font-semibold text-orange-700 shadow-sm' : 'text-slate-500'}`}>当前立绘</button>
                        <button type="button" onClick={() => setShowCurrent(false)} className={`rounded-full px-4 py-1.5 ${!showCurrent ? 'bg-white font-semibold text-orange-700 shadow-sm' : 'text-slate-500'}`}>生成结果</button>
                    </div>
                )}
                <div className="relative flex h-[330px] items-end justify-center overflow-hidden rounded-2xl border border-orange-100 bg-gradient-to-b from-slate-50 via-white to-orange-50/60 pb-5 md:h-[490px] md:pb-8">
                    <div className="absolute bottom-5 h-8 w-36 rounded-[100%] border border-orange-200 bg-orange-100/30 md:bottom-8 md:w-44"/>
                    {preview.url ? (
                        <img src={preview.url} alt="冒险立绘预览" style={{transform: `scale(${scale})`, transformOrigin: '50% 95.7%'}} className="relative h-[200px] max-w-full object-contain md:h-[300px]"/>
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
            </div>
            <div className="flex flex-col gap-4">
                <div className="rounded-xl border border-orange-100 bg-orange-50/60 p-3 text-xs leading-6 text-orange-900">默认自然睁眼、轻微闭嘴微笑，避免眯眼和张嘴大笑。确认后应用，立绘和显示大小随 Agent 同步。</div>
                <div role="group" aria-label="本次参考图上传区域" onDragEnter={dragEnter} onDragLeave={dragLeave} onDrop={dropReference}
                    onDragOver={event => {event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = uploadBlocked ? 'none' : 'copy';}}
                    className={`rounded-xl border p-3 transition-colors ${dragging && !uploadBlocked ? 'border-orange-400 bg-orange-50 ring-2 ring-orange-100' : 'border-slate-200 bg-white'}`}>
                    <div className="mb-2 flex items-center justify-between text-xs"><span className="font-semibold text-slate-700">本次参考图 <span className="font-normal text-slate-400">可选</span></span>{reference.reference && <button type="button" aria-label="移除本次参考图" disabled={pending || portrait.active} onClick={reference.clear} className="text-slate-400 hover:text-orange-600"><X className="h-3.5 w-3.5"/></button>}</div>
                    <input ref={fileInput} type="file" aria-label="上传本次参考图" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={pending || portrait.active} onChange={event => {const file = event.target.files?.[0]; event.target.value = ''; if (file) void reference.upload(file);}}/>
                    <button type="button" disabled={pending || portrait.active} onClick={() => fileInput.current?.click()} className="flex w-full items-center gap-3 rounded-lg border border-dashed border-orange-200 bg-orange-50/40 p-3 text-left text-xs text-orange-700 disabled:opacity-40">
                        {reference.reference ? <img src={reference.reference.url} alt="本次参考图" className="h-14 w-14 shrink-0 rounded-lg object-contain"/> : <ImagePlus className="h-7 w-7 shrink-0 stroke-1.5"/>}
                        <span className="min-w-0 break-all">{reference.busy ? '正在上传…' : dragging && !uploadBlocked ? '松开即可上传参考图' : reference.reference?.name || '拖入图片，或点击上传参考图'}</span>
                    </button>
                    <p className="mt-2 text-[11px] leading-5 text-slate-400">{reference.reference ? '本次仅使用这张图，不附带头像或 Agent 外貌文字。' : '未上传时使用 Agent 头像／全身参考图与外貌；上传后优先使用本次图片。'}</p>
                </div>
                <div><label className="mb-1.5 block text-xs font-semibold text-slate-700">生图模型</label><Select value={modelId} onChange={value => {setOptionsLoading(true); setOptionsError(''); setModelId(value);}} menuPortal={true} disabled={pending || portrait.active || optionsLoading} options={[{value: '', label: '使用默认生图模型'}, ...(options?.models || [])]}/></div>
                {!optionsLoading && !capable && <p className="text-xs text-amber-700">{options?.message || '请选择支持参考图的 Grsai 生图模型。'}</p>}
                {!optionsLoading && capable && !hasReference && <p className="text-xs text-amber-700">请上传本次参考图，或先为 Agent 配置已上传的头像／全身图。</p>}
                <div><label htmlFor="portrait-extra" className="mb-1.5 block text-xs font-semibold text-slate-700">补充外观要求 <span className="font-normal text-slate-400">可选</span></label><textarea id="portrait-extra" value={extra} onChange={event => setExtra(event.target.value)} maxLength={2000} rows={3} disabled={pending || portrait.active} placeholder="例如：保留红色帽子和标志性发饰，穿冒险者服装。" className="w-full resize-none rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"/></div>
                <p className="text-xs leading-5 text-slate-400">生成会使用模型额度。换装备不会自动重画，职业变化后可重新生成。此立绘用于装备页展示。</p>
                {error && <div role="alert" className="rounded-xl bg-red-50 p-3 text-xs text-red-700">{error}{optionsError && <button type="button" onClick={() => {setOptionsLoading(true); setOptionsError(''); setRetry(value => value + 1);}} className="ml-2 underline">重试</button>}</div>}
                {portrait.task && !portrait.active && <p role="status" className="text-xs text-slate-600">{labels[portrait.task.status] || portrait.task.status}{portrait.task.message && `：${portrait.task.message}`}</p>}
                <div className="mt-auto flex flex-col gap-2">
                    <button type="button" disabled={pending || portrait.active || optionsLoading || !capable || !hasReference} onClick={generate} className="flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-40">{pending ? <LoaderCircle className="h-4 w-4 animate-spin"/> : <Sparkles className="h-4 w-4"/>}{portrait.task ? '重新生成' : '生成冒险立绘'}</button>
                    {preview.url && <button type="button" disabled={pending || !canSave || portrait.active} onClick={save} className="flex items-center justify-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-2.5 text-sm font-semibold text-orange-700 disabled:opacity-50"><Check className="h-4 w-4"/>{newImage ? '应用这张立绘' : sizeChanged ? '保存人物大小' : '已应用到装备页'}</button>}
                    {portrait.active && <button type="button" disabled={pending} onClick={() => void portrait.cancel()} className="py-2 text-xs text-slate-500">停止等待（服务商可能继续处理）</button>}
                    {portrait.saved.assetId && <button type="button" disabled={pending || portrait.active} onClick={() => {void portrait.clear(); setScaleDraft(null); setShowCurrent(true);}} className="py-2 text-xs text-slate-500">恢复默认职业立绘</button>}
                </div>
            </div>
        </div>
    </WorldDialog>;
}
