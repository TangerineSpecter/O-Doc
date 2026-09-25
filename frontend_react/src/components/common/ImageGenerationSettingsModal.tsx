import {useEffect, useMemo, useState} from 'react';
import {ImagePlus, Loader2, Sparkles, X} from 'lucide-react';
import {useEscapeDismissal} from '../../hooks/useEscapeDismissal';
import {Select} from './Select';
import type {
    ImageGenerationRequestOptions,
    ImageGenerationSettings,
} from '../../types/api/prompt';

interface ImageGenerationSettingsModalProps {
    isOpen: boolean;
    isLoading: boolean;
    isGenerating: boolean;
    canStop?: boolean;
    settings: ImageGenerationSettings | null;
    title: string;
    purposeLabel: string;
    purposeBadge: string;
    purposeDescription: string;
    onClose: () => void;
    onStop?: () => void;
    onGenerate: (options: ImageGenerationRequestOptions) => void;
}

const DEFAULT_CUSTOM_WIDTH = '1536';
const DEFAULT_CUSTOM_HEIGHT = '1024';

export default function ImageGenerationSettingsModal({
    isOpen,
    isLoading,
    isGenerating,
    canStop = false,
    settings,
    title,
    purposeLabel,
    purposeBadge,
    purposeDescription,
    onClose,
    onStop,
    onGenerate,
}: ImageGenerationSettingsModalProps) {
    const [aspectRatio, setAspectRatio] = useState('');
    const [imageSize, setImageSize] = useState('');
    const [useCustomDimensions, setUseCustomDimensions] = useState(false);
    const [customWidth, setCustomWidth] = useState(DEFAULT_CUSTOM_WIDTH);
    const [customHeight, setCustomHeight] = useState(DEFAULT_CUSTOM_HEIGHT);

    useEffect(() => {
        if (!settings) return;
        setAspectRatio(settings.defaultAspectRatio);
        setImageSize(settings.defaultImageSize);
        setUseCustomDimensions(false);
    }, [settings]);

    const availableImageSizeOptions = settings?.imageSizeOptionsByAspectRatio[aspectRatio] || settings?.imageSizeOptions || [];

    useEffect(() => {
        if (availableImageSizeOptions.length === 0 || availableImageSizeOptions.some(option => option.value === imageSize)) return;
        setImageSize(availableImageSizeOptions[0].value);
    }, [availableImageSizeOptions, imageSize]);

    useEscapeDismissal(isOpen, () => {
        if (isGenerating) return false;
        onClose();
        return true;
    });

    const customValidationMessage = useMemo(() => {
        if (!settings?.customDimensions.enabled) return '';
        const width = Number(customWidth);
        const height = Number(customHeight);
        const {maxEdge, step, minPixels, maxPixels, maxAspectRatio} = settings.customDimensions;
        if (!Number.isInteger(width) || !Number.isInteger(height)) return '请输入整数像素尺寸。';
        if (width < step || height < step || width > maxEdge || height > maxEdge) return `宽和高需在 ${step} 到 ${maxEdge} 像素之间。`;
        if (width % step !== 0 || height % step !== 0) return `宽和高都必须是 ${step} 的倍数。`;
        const pixels = width * height;
        if (pixels < minPixels || pixels > maxPixels) return `总像素数需在 ${minPixels.toLocaleString()} 到 ${maxPixels.toLocaleString()} 之间。`;
        if (Math.max(width, height) / Math.min(width, height) > maxAspectRatio) return `长边与短边之比不能超过 ${maxAspectRatio}:1。`;
        return '';
    }, [customHeight, customWidth, settings]);

    if (!isOpen) return null;

    const canGenerate = Boolean(settings) && !isLoading && !isGenerating
        && (!useCustomDimensions || !customValidationMessage);
    const generationOptions = (): ImageGenerationRequestOptions => {
        if (!settings || settings.mode === 'automatic') return {};
        if (useCustomDimensions && settings.customDimensions.enabled) {
            return {customDimensions: {width: Number(customWidth), height: Number(customHeight)}};
        }
        return {aspectRatio, imageSize};
    };

    return (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 animate-in fade-in duration-200" role="dialog" aria-modal="true" aria-labelledby="image-generation-settings-title">
            <button type="button" aria-label="关闭设置" className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => !isGenerating && onClose()}/>
            <section className="relative w-full max-w-lg overflow-visible rounded-2xl border border-orange-100 bg-white shadow-2xl shadow-slate-900/20 animate-in zoom-in-95 slide-in-from-bottom-2 duration-200">
                <div className="rounded-t-2xl">
                    <div className="relative flex items-start gap-3 rounded-t-2xl border-b border-orange-100 bg-gradient-to-r from-orange-50 via-white to-white px-5 py-5 sm:px-6">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-600 ring-1 ring-orange-200/70">
                            <ImagePlus className="h-5 w-5"/>
                        </div>
                        <div className="min-w-0 flex-1 pr-8">
                            <div className="mb-1 flex items-center gap-2">
                                <h2 id="image-generation-settings-title" className="text-base font-bold text-slate-900">{title}</h2>
                                <span className="rounded-full border border-orange-200 bg-white px-2 py-0.5 text-[10px] font-semibold tracking-wide text-orange-700">{purposeBadge}</span>
                            </div>
                            <p className="text-xs leading-5 text-slate-500">{purposeDescription}</p>
                        </div>
                        <button type="button" onClick={onClose} disabled={isGenerating} aria-label="关闭" className="absolute right-4 top-4 rounded-full p-1.5 text-slate-400 transition-colors hover:bg-white hover:text-slate-700 disabled:opacity-50">
                            <X className="h-4 w-4"/>
                        </button>
                    </div>

                    {isLoading ? (
                        <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-slate-400">
                            <Loader2 className="h-5 w-5 animate-spin text-orange-500"/>
                            <span className="text-sm">正在读取当前生图模型支持的参数…</span>
                        </div>
                    ) : settings ? (
                        <div className="space-y-5 px-5 py-5 sm:px-6">
                            <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/70 px-3.5 py-3">
                                <div className="min-w-0">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">本次用途</p>
                                    <p className="mt-1 text-sm font-semibold text-slate-700">{purposeLabel} <span className="font-normal text-slate-400">· {settings.modelName}</span></p>
                                </div>
                                <Sparkles className="h-4 w-4 shrink-0 text-orange-400"/>
                            </div>

                            {settings.mode === 'automatic' ? (
                                <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm leading-6 text-amber-900">
                                    {settings.description}
                                </div>
                            ) : (
                                <div className="grid gap-4 sm:grid-cols-2">
                                    {!useCustomDimensions && (
                                        <div className="space-y-1.5">
                                            <label className="block text-xs font-semibold text-slate-600">画面比例</label>
                                            <Select
                                                value={aspectRatio}
                                                options={settings.aspectRatioOptions}
                                                onChange={setAspectRatio}
                                                showSelectedDescription={false}
                                                buttonClassName="min-h-11"
                                                menuPlacement="bottom"
                                                menuPortal
                                            />
                                        </div>
                                    )}
                                    {!useCustomDimensions && (
                                        <div className="space-y-1.5">
                                            <label className="block text-xs font-semibold text-slate-600">分辨率</label>
                                            {settings.mode === 'fixed' || settings.imageSizeOptions.length === 1 ? (
                                                <div className="flex min-h-11 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700">
                                                    {settings.defaultImageSize || '自动'}
                                                    <span className="ml-2 text-xs font-normal text-slate-400">当前模型固定</span>
                                                </div>
                                            ) : (
                                                <Select
                                                    value={imageSize}
                                                    options={availableImageSizeOptions}
                                                    onChange={setImageSize}
                                                    showSelectedDescription={false}
                                                    buttonClassName="min-h-11"
                                                    menuPlacement="bottom"
                                                    menuPortal
                                                />
                                            )}
                                        </div>
                                    )}
                                    {useCustomDimensions && (
                                        <div className="grid grid-cols-2 gap-3 sm:col-span-2">
                                            <label className="space-y-1.5">
                                                <span className="block text-xs font-semibold text-slate-600">宽度（像素）</span>
                                                <input type="number" min={16} max={settings.customDimensions.maxEdge} step={settings.customDimensions.step} value={customWidth} onChange={event => setCustomWidth(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-500/15"/>
                                            </label>
                                            <label className="space-y-1.5">
                                                <span className="block text-xs font-semibold text-slate-600">高度（像素）</span>
                                                <input type="number" min={16} max={settings.customDimensions.maxEdge} step={settings.customDimensions.step} value={customHeight} onChange={event => setCustomHeight(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-500/15"/>
                                            </label>
                                        </div>
                                    )}
                                </div>
                            )}

                            {settings.customDimensions.enabled && settings.mode === 'pixel_dimensions' && (
                                <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
                                    <div>
                                        <p className="text-xs font-semibold text-slate-700">画幅设置方式</p>
                                        <p className="mt-1 text-[11px] text-slate-400">手动尺寸需满足接口的像素限制</p>
                                    </div>
                                    <button type="button" onClick={() => setUseCustomDimensions(value => !value)} className="shrink-0 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-700 transition hover:bg-orange-100">
                                        {useCustomDimensions ? '选择预设比例' : '自定义像素'}
                                    </button>
                                </div>
                            )}

                            {useCustomDimensions && customValidationMessage && (
                                <p className="-mt-2 text-xs leading-5 text-rose-600">{customValidationMessage}</p>
                            )}
                            <p className="text-[11px] leading-5 text-slate-400">{settings.description}</p>
                        </div>
                    ) : (
                        <div className="px-6 py-10 text-center text-sm text-slate-500">暂时无法读取生图模型设置，请稍后重试。</div>
                    )}
                </div>

                <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4 sm:px-6">
                    {canStop && onStop && <button type="button" onClick={onStop} className="rounded-lg px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50">稍后在资源库继续</button>}
                    <button type="button" onClick={onClose} disabled={isGenerating} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50">取消</button>
                    <button type="button" onClick={() => onGenerate(generationOptions())} disabled={!canGenerate} className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-orange-500/20 transition hover:bg-orange-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50">
                        {isGenerating ? <Loader2 className="h-4 w-4 animate-spin"/> : <ImagePlus className="h-4 w-4"/>}
                        {isGenerating ? `正在${title}…` : title}
                    </button>
                </div>
            </section>
        </div>
    );
}
