import {useEffect, useMemo, useRef, useState} from 'react';
import {Copy, ImagePlus, Loader2, Maximize2, Pencil, Sparkles, Star, Trash2, X} from 'lucide-react';
import type {PromptTemplate} from '../../api/prompt';
import {deletePromptTemplate, deletePromptUsage, setPromptCover} from '../../api/prompt';
import {defaultPromptValues, renderPromptTemplate, type PromptValues} from '../../utils/promptRenderer';
import {useToast} from '../common/ToastProvider';
import {Select} from '../common/Select';
import AuthenticatedResourceImage from '../common/AuthenticatedResourceImage';
import {useEscapeDismissal} from '../../hooks/useEscapeDismissal';
import {usePromptImageGeneration} from '../../hooks/usePromptImageGeneration';

interface Props {
    template: PromptTemplate | null;
    onClose: () => void;
    onChanged: () => void;
    onEdit: (template: PromptTemplate) => void;
    onPreviewImage?: (assetId: string, title?: string) => void;
    isLightboxOpen?: boolean;
}

export default function PromptDetailDrawer({template, onClose, onChanged, onEdit, onPreviewImage, isLightboxOpen}: Props) {
    const toast = useToast();
    const [values, setValues] = useState<PromptValues>({});
    const lastTemplateId = useRef<string | null>(null);
    const generation = usePromptImageGeneration(template?.id || null, onChanged);
    useEscapeDismissal(Boolean(template && !isLightboxOpen), onClose);

    useEffect(() => {
        if (!template) {
            lastTemplateId.current = null;
            return;
        }
        if (lastTemplateId.current === template.id) return;
        lastTemplateId.current = template.id;
        setValues(defaultPromptValues(template.fieldSchema));
    }, [template]);

    const rendered = useMemo(() => template ? renderPromptTemplate(template.positiveTemplate, template.fieldSchema, values) : {text: '', missing: []}, [template, values]);
    const negative = useMemo(() => template ? renderPromptTemplate(template.negativeTemplate, template.fieldSchema, values) : {text: '', missing: []}, [template, values]);

    if (!template) return null;

    const missing = [...new Set([...rendered.missing, ...negative.missing])];
    const usages = template.usages || (template.latestUsage ? [template.latestUsage] : []);

    const setValue = (key: string, value: PromptValues[string]) => setValues(current => ({...current, [key]: value}));

    const copy = async (text: string, label: string) => {
        if (missing.length) return toast.error(`请先填写：${missing.join('、')}`);
        await navigator.clipboard.writeText(text);
        toast.success(`${label}已复制`);
    };

    const moveTemplateToTrash = async () => {
        if (!window.confirm('将此提示词移入回收站？历史效果会保留，可随时恢复。')) return;
        try {
            await deletePromptTemplate(template.id);
            toast.success('已移入回收站');
            onClose();
            onChanged();
        } catch (error) {
            toast.error((error as Error).message || '移入回收站失败');
        }
    };

    const moveUsageToTrash = async (usageId: string) => {
        if (!window.confirm('将整次效果记录及其全部图片移入回收站？')) return;
        try {
            await deletePromptUsage(usageId);
            toast.success('效果记录已移入回收站');
            onChanged();
        } catch (error) {
            toast.error((error as Error).message || '移入回收站失败');
        }
    };

    const renderFieldInput = (field: PromptTemplate['fieldSchema'][number]) => {
        if (field.type === 'textarea') return (
            <textarea
                value={String(values[field.key] ?? '')}
                onChange={event => setValue(field.key, event.target.value)}
                placeholder={field.placeholder}
                className="mt-1 min-h-[64px] sm:min-h-[76px] w-full resize-none rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs sm:text-sm font-normal focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-colors"
            />
        );
        if (field.type === 'select') {
            const options = (field.options || []).map(option => ({value: option.value, label: option.label}));
            return (
                <div className="mt-1">
                    <Select
                        value={String(values[field.key] ?? '')}
                        options={options}
                        onChange={value => setValue(field.key, value)}
                        placeholder={field.placeholder || '请选择'}
                        buttonClassName="min-h-[34px] sm:min-h-[38px] py-1 px-2.5 text-xs sm:text-sm bg-white"
                        showSelectedDescription={false}
                    />
                </div>
            );
        }
        if (field.type === 'multiselect') {
            const selectedValues = Array.isArray(values[field.key]) ? values[field.key] as string[] : [];
            return (
                <div className="mt-1 flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1.5">
                    {(field.options || []).map(option => {
                        const selected = selectedValues.includes(option.value);
                        return (
                            <button
                                type="button"
                                key={option.value}
                                onClick={() => setValue(field.key, selected ? selectedValues.filter(item => item !== option.value) : [...selectedValues, option.value])}
                                className={`rounded-md px-2 py-0.5 text-xs transition-colors ${selected ? 'bg-orange-100 text-orange-700 font-semibold' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                            >
                                {option.label}
                            </button>
                        );
                    })}
                </div>
            );
        }
        if (field.type === 'boolean') {
            return (
                <button
                    type="button"
                    onClick={() => setValue(field.key, !values[field.key])}
                    className={`mt-1 flex w-full items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs sm:text-sm font-normal transition-colors ${
                        values[field.key] ? 'border-orange-200 bg-orange-50 text-orange-700' : 'border-slate-200 bg-white text-slate-500'
                    }`}
                >
                    <span>{values[field.key] ? field.trueValue || '开启' : field.falseValue || '关闭'}</span>
                    <span className={`h-4 w-7 rounded-full p-0.5 transition-colors ${values[field.key] ? 'bg-orange-500' : 'bg-slate-300'}`}>
                        <i className={`block h-3 w-3 rounded-full bg-white transition-transform ${values[field.key] ? 'translate-x-3' : ''}`}/>
                    </span>
                </button>
            );
        }
        return (
            <input
                type={field.type === 'number' ? 'number' : 'text'}
                value={String(values[field.key] ?? '')}
                onChange={event => setValue(field.key, event.target.value)}
                placeholder={field.placeholder}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs sm:text-sm font-normal focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-colors"
            />
        );
    };

    return (
        <div className="fixed inset-0 z-[115] flex items-center justify-center p-2 sm:p-6">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose}/>
            <section className="relative flex h-[92vh] max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl sm:rounded-2xl bg-white shadow-2xl animate-in zoom-in-95 duration-200">
                <header className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-3 sm:px-5 sm:py-4 shrink-0">
                    <div className="min-w-0 pr-2">
                        <div className="flex items-center gap-2">
                            <h2 className="truncate text-base sm:text-lg font-bold text-slate-900">{template.title}</h2>
                            {template.isFavorite && <Star className="h-4 w-4 fill-orange-400 text-orange-400 shrink-0"/>}
                            {template.category && (
                                <span className="rounded-md bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-600 border border-orange-100/80">
                                    {template.category.name}
                                </span>
                            )}
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500 line-clamp-1">{template.description || '填写字段后即可直接复制完整提示词。'}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                        <button onClick={() => onEdit(template)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-orange-600 transition-colors shadow-sm" title="编辑模板">
                            <Pencil className="h-3.5 w-3.5"/><span className="hidden sm:inline">编辑</span>
                        </button>
                        <button onClick={() => void moveTemplateToTrash()} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors" title="移入回收站">
                            <Trash2 className="h-4 w-4"/>
                        </button>
                        <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors" title="关闭 (Esc)">
                            <X className="h-5 w-5"/>
                        </button>
                    </div>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto scrollbar-hide no-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden p-3.5 sm:p-6 space-y-4 sm:space-y-5">
                    {/* 上半部分：提示词填写与最终提示词展示 */}
                    {template.fieldSchema.length > 0 ? (
                        <div className="grid gap-3.5 sm:gap-5 lg:grid-cols-2 items-start">
                            {/* 左栏：填写本次内容 */}
                            <section className="rounded-xl border border-orange-100 bg-orange-50/40 p-3 sm:p-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5">
                                        <h3 className="text-xs sm:text-sm font-bold text-slate-800">填写本次内容</h3>
                                        <span className="rounded-full bg-orange-100/80 px-1.5 py-0.2 text-[10px] font-semibold text-orange-700">
                                            {template.fieldSchema.length}
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setValues(defaultPromptValues(template.fieldSchema))}
                                        className="text-[10px] sm:text-xs text-slate-400 hover:text-orange-600 transition-colors"
                                    >
                                        重置默认
                                    </button>
                                </div>
                                <div className="mt-2 sm:mt-2.5 max-h-[280px] sm:max-h-[360px] lg:max-h-[500px] overflow-y-auto pr-0.5 scrollbar-hide">
                                    <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
                                        {template.fieldSchema.map(field => (
                                            <div
                                                key={field.key}
                                                className={field.type === 'textarea' || field.type === 'multiselect' ? 'col-span-2' : 'col-span-1'}
                                            >
                                                <label className="block text-[11px] sm:text-xs font-semibold text-slate-700 truncate" title={field.label}>
                                                    {field.label}{field.required && <span className="ml-0.5 text-red-500">*</span>}
                                                </label>
                                                {renderFieldInput(field)}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                {missing.length > 0 && <p className="mt-2 text-[11px] text-red-600 font-medium">还需要填写：{missing.join('、')}</p>}
                            </section>

                            {/* 右栏：最终提示词 */}
                            <section className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm flex flex-col">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <h3 className="text-xs sm:text-sm font-bold text-slate-800">最终提示词</h3>
                                    <div className="flex items-center gap-1.5">
                                        <button onClick={() => void copy(rendered.text, '正向提示词')} className="rounded-md border border-slate-200 bg-white px-2 sm:px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 transition-colors">
                                            <Copy className="mr-1 inline h-3 w-3"/>正向
                                        </button>
                                        {negative.text && (
                                            <button onClick={() => void copy(negative.text, '反向提示词')} className="rounded-md border border-slate-200 bg-white px-2 sm:px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 transition-colors">
                                                反向
                                            </button>
                                        )}
                                        <button onClick={() => void copy(negative.text ? `正向提示词：\n${rendered.text}\n\n反向提示词：\n${negative.text}` : rendered.text, '完整提示词')} className="rounded-md bg-orange-500 px-2.5 sm:px-3 py-1 text-xs font-semibold text-white hover:bg-orange-600 shadow-sm shadow-orange-500/20 transition-colors">
                                            完整复制
                                        </button>
                                    </div>
                                </div>
                                <pre className="mt-2 sm:mt-2.5 max-h-44 sm:max-h-56 overflow-auto scrollbar-hide no-scrollbar whitespace-pre-wrap rounded-lg border border-slate-200/80 bg-slate-50/80 p-2.5 sm:p-3 font-mono text-xs leading-5 text-slate-700">
                                    {rendered.text || '填写内容后将在这里预览'}
                                </pre>
                                {negative.text && (
                                    <pre className="mt-2 max-h-28 overflow-auto scrollbar-hide no-scrollbar whitespace-pre-wrap rounded-lg border border-slate-200/80 bg-slate-50/80 p-2 sm:p-2.5 font-mono text-xs leading-5 text-slate-500">
                                        反向：{negative.text}
                                    </pre>
                                )}
                            </section>
                        </div>
                    ) : (
                        /* 无动态字段时：最终提示词横向铺开 */
                        <section className="rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4 shadow-sm">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <h3 className="text-sm font-bold text-slate-800">最终提示词</h3>
                                <div className="flex items-center gap-1.5">
                                    <button onClick={() => void copy(rendered.text, '正向提示词')} className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 transition-colors">
                                        <Copy className="mr-1 inline h-3 w-3"/>正向
                                    </button>
                                    {negative.text && (
                                        <button onClick={() => void copy(negative.text, '反向提示词')} className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 transition-colors">
                                            反向
                                        </button>
                                    )}
                                    <button onClick={() => void copy(negative.text ? `正向提示词：\n${rendered.text}\n\n反向提示词：\n${negative.text}` : rendered.text, '完整提示词')} className="rounded-md bg-orange-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-orange-600 shadow-sm shadow-orange-500/20 transition-colors">
                                        完整复制
                                    </button>
                                </div>
                            </div>
                            <pre className="mt-2.5 max-h-56 overflow-auto scrollbar-hide no-scrollbar whitespace-pre-wrap rounded-lg border border-slate-200/80 bg-slate-50/80 p-3 font-mono text-xs leading-5 text-slate-700">
                                {rendered.text || '没有设置正向提示词'}
                            </pre>
                            {negative.text && (
                                <pre className="mt-2 max-h-32 overflow-auto scrollbar-hide no-scrollbar whitespace-pre-wrap rounded-lg border border-slate-200/80 bg-slate-50/80 p-3 font-mono text-xs leading-5 text-slate-500">
                                    反向：{negative.text}
                                </pre>
                            )}
                        </section>
                    )}

                    {/* 历史效果 - 横向滚动展示 */}
                    <section className="rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4 shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <h3 className="text-sm font-bold text-slate-800">历史效果</h3>
                                {usages.length > 0 && (
                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                                        共 {usages.length} 条记录
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                {usages.length > 0 && (
                                    <span className="text-[11px] text-slate-400">可左右滑动查看</span>
                                )}
                                {template.promptType === 'image' && (
                                    <button
                                        type="button"
                                        disabled={generation.status !== 'idle'}
                                        onClick={() => {
                                            if (missing.length) return toast.error(`请先填写：${missing.join('、')}`);
                                            void generation.start(values);
                                        }}
                                        className="inline-flex items-center gap-1 rounded-lg bg-orange-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-orange-600 disabled:cursor-wait disabled:opacity-70"
                                    >
                                        {generation.status === 'idle' ? <Sparkles className="h-3.5 w-3.5"/> : <Loader2 className="h-3.5 w-3.5 animate-spin"/>}
                                        {generation.status === 'starting' ? '提交中' : generation.status === 'polling' ? '生成中' : '用默认模型生图'}
                                    </button>
                                )}
                                <button
                                    onClick={() => onEdit(template)}
                                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-orange-200 hover:text-orange-600 transition-colors shadow-xs"
                                    title="前往编辑上传新的效果图"
                                >
                                    <ImagePlus className="h-3.5 w-3.5 text-orange-500" />
                                    <span>添加效果图</span>
                                </button>
                            </div>
                        </div>

                        {usages.length > 0 ? (
                            <div className="mt-3 flex gap-3.5 overflow-x-auto scrollbar-hide no-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden pb-1 pt-1 touch-pan-x">
                                {usages.map(usage => (
                                    <div
                                        key={usage.id}
                                        className="w-64 sm:w-72 shrink-0 rounded-xl border border-slate-200/90 bg-slate-50/70 p-3 hover:border-orange-200 hover:shadow-md transition-all flex flex-col justify-between"
                                    >
                                        <div>
                                            <div className="mb-2 flex items-center justify-between gap-1.5">
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-xs font-semibold text-slate-800 truncate" title={usage.modelName || '效果记录'}>
                                                        {usage.modelName || '效果记录'}
                                                    </p>
                                                    <p className="text-[10px] text-slate-400 truncate">
                                                        {usage.createdAt} · {usage.resultImages.length} 张图片
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={() => void moveUsageToTrash(usage.id)}
                                                    className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors shrink-0"
                                                    title="删除本次记录"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5"/>
                                                </button>
                                            </div>

                                            {/* 图片展示 */}
                                            {usage.resultImages.length === 1 ? (
                                                <div
                                                    className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-900/5 group cursor-pointer"
                                                    onClick={() => onPreviewImage?.(usage.resultImages[0].assetId, usage.resultImages[0].caption || template.title)}
                                                    title="点击查看高清大图"
                                                >
                                                    <AuthenticatedResourceImage
                                                        resourceId={usage.resultImages[0].assetId}
                                                        alt={usage.resultImages[0].caption || '提示词效果'}
                                                        fitMode="contain-blur"
                                                        className="h-full w-full"
                                                        imageClassName="transition duration-300 group-hover:scale-[1.02]"
                                                    />
                                                    {onPreviewImage && (
                                                        <button
                                                            type="button"
                                                            onClick={e => {
                                                                e.stopPropagation();
                                                                onPreviewImage(usage.resultImages[0].assetId, usage.resultImages[0].caption || template.title);
                                                            }}
                                                            className="absolute left-1.5 top-1.5 rounded-md p-1.5 bg-slate-900/40 hover:bg-slate-900/70 text-white/90 hover:text-white shadow-sm backdrop-blur transition-all opacity-0 group-hover:opacity-100"
                                                            title="查看高清原图"
                                                        >
                                                            <Maximize2 className="h-3.5 w-3.5"/>
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={e => {
                                                            e.stopPropagation();
                                                            void setPromptCover(template.id, usage.resultImages[0].id).then(onChanged);
                                                        }}
                                                        className={`absolute bottom-1.5 right-1.5 rounded-md p-1.5 shadow-sm transition-all z-20 ${
                                                            template.coverImage?.id === usage.resultImages[0].id
                                                                ? 'bg-orange-500 text-white shadow-orange-500/30'
                                                                : 'bg-white/80 backdrop-blur-sm text-slate-400 hover:text-orange-500 hover:bg-white'
                                                        }`}
                                                        title={template.coverImage?.id === usage.resultImages[0].id ? '当前封面' : '设为封面'}
                                                    >
                                                        <Star className={`h-3.5 w-3.5 ${template.coverImage?.id === usage.resultImages[0].id ? 'fill-current' : ''}`}/>
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-2 gap-1.5">
                                                    {usage.resultImages.map(image => (
                                                        <div
                                                            key={image.id}
                                                            className="relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-900/5 group cursor-pointer"
                                                            onClick={() => onPreviewImage?.(image.assetId, image.caption || template.title)}
                                                            title="点击查看高清大图"
                                                        >
                                                            <AuthenticatedResourceImage
                                                                resourceId={image.assetId}
                                                                alt={image.caption || '提示词效果'}
                                                                fitMode="contain-blur"
                                                                className="h-full w-full"
                                                                imageClassName="transition duration-300 group-hover:scale-[1.02]"
                                                            />
                                                            {onPreviewImage && (
                                                                <button
                                                                    type="button"
                                                                    onClick={e => {
                                                                        e.stopPropagation();
                                                                        onPreviewImage(image.assetId, image.caption || template.title);
                                                                    }}
                                                                    className="absolute left-1 top-1 rounded p-1 bg-slate-900/40 hover:bg-slate-900/70 text-white/90 hover:text-white shadow-sm backdrop-blur transition-all opacity-0 group-hover:opacity-100"
                                                                    title="查看高清原图"
                                                                >
                                                                    <Maximize2 className="h-3 w-3"/>
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={e => {
                                                                    e.stopPropagation();
                                                                    void setPromptCover(template.id, image.id).then(onChanged);
                                                                }}
                                                                className={`absolute bottom-1 right-1 rounded p-1 shadow-sm transition-all z-20 ${
                                                                    template.coverImage?.id === image.id
                                                                        ? 'bg-orange-500 text-white shadow-orange-500/30'
                                                                        : 'bg-white/80 backdrop-blur-sm text-slate-400 hover:text-orange-500 hover:bg-white'
                                                                }`}
                                                                title={template.coverImage?.id === image.id ? '当前封面' : '设为封面'}
                                                            >
                                                                <Star className={`h-3 w-3 ${template.coverImage?.id === image.id ? 'fill-current' : ''}`}/>
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {usage.note && (
                                            <p className="mt-2 text-[11px] text-slate-500 bg-white/80 rounded px-2 py-1 border border-slate-100 line-clamp-2" title={usage.note}>
                                                {usage.note}
                                            </p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="mt-3 rounded-xl border border-dashed border-slate-200 py-8 text-center text-xs text-slate-400 bg-slate-50/40">
                                <span>还没有效果图记录。</span>
                                <button
                                    onClick={() => onEdit(template)}
                                    className="ml-2 text-orange-600 hover:underline font-medium inline-flex items-center gap-1"
                                >
                                    去编辑添加
                                </button>
                            </div>
                        )}
                    </section>
                </div>
            </section>
        </div>
    );
}
