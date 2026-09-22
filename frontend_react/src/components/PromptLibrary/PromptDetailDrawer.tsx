import {useEffect, useMemo, useState} from 'react';
import {Copy, ImagePlus, Star, Trash2, X} from 'lucide-react';
import type {PromptTemplate} from '../../api/prompt';
import {createPromptUsage, deletePromptTemplate, deletePromptUsage, setPromptCover} from '../../api/prompt';
import {uploadResource} from '../../api/resources';
import {defaultPromptValues, renderPromptTemplate, type PromptValues} from '../../utils/promptRenderer';
import {useToast} from '../common/ToastProvider';
import {Select} from '../common/Select';

interface Props { template: PromptTemplate | null; onClose: () => void; onChanged: () => void; }

export default function PromptDetailDrawer({template, onClose, onChanged}: Props) {
    const toast = useToast();
    const [values, setValues] = useState<PromptValues>({});
    const [files, setFiles] = useState<File[]>([]);
    const [modelName, setModelName] = useState('');
    const [note, setNote] = useState('');
    const [saving, setSaving] = useState(false);
    useEffect(() => {
        if (!template) return;
        setValues(defaultPromptValues(template.fieldSchema));
        setFiles([]); setNote(''); setModelName('');
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
    const saveUsage = async () => {
        if (!files.length) return toast.error('请选择至少一张效果图');
        if (missing.length) return toast.error(`请先填写：${missing.join('、')}`);
        setSaving(true);
        try {
            const uploads = await Promise.all(files.map(file => uploadResource(file, 'prompt')));
            await createPromptUsage(template.id, {inputValues: values, assetIds: uploads.map(item => item.id), modelName, note});
            toast.success('效果记录已保存'); onChanged(); setFiles([]); setNote(''); setModelName('');
        } catch (error) { toast.error((error as Error).message || '保存效果失败'); } finally { setSaving(false); }
    };
    const moveTemplateToTrash = async () => {
        if (!window.confirm('将此提示词移入回收站？历史效果会保留，可随时恢复。')) return;
        try { await deletePromptTemplate(template.id); toast.success('已移入回收站'); onClose(); onChanged(); } catch (error) { toast.error((error as Error).message || '移入回收站失败'); }
    };
    const moveUsageToTrash = async (usageId: string) => {
        if (!window.confirm('将整次效果记录及其全部图片移入回收站？')) return;
        try { await deletePromptUsage(usageId); toast.success('效果记录已移入回收站'); onChanged(); } catch (error) { toast.error((error as Error).message || '移入回收站失败'); }
    };
    const renderFieldInput = (field: PromptTemplate['fieldSchema'][number]) => {
        if (field.type === 'textarea') return <textarea value={String(values[field.key] ?? '')} onChange={event => setValue(field.key, event.target.value)} placeholder={field.placeholder} className="mt-1.5 min-h-20 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal"/>;
        if (field.type === 'select') {
            const options = (field.options || []).map(option => ({value: option.value, label: option.label}));
            return (
                <div className="mt-1.5">
                    <Select
                        value={String(values[field.key] ?? '')}
                        options={options}
                        onChange={value => setValue(field.key, value)}
                        placeholder={field.placeholder || '请选择'}
                        buttonClassName="min-h-[38px] py-1.5 text-sm bg-white"
                        showSelectedDescription={false}
                    />
                </div>
            );
        }
        if (field.type === 'multiselect') {
            const selectedValues = Array.isArray(values[field.key]) ? values[field.key] as string[] : [];
            return <div className="mt-1.5 flex flex-wrap gap-1.5 rounded-lg border border-slate-200 bg-white p-2">{(field.options || []).map(option => {
                const selected = selectedValues.includes(option.value);
                return <button type="button" key={option.value} onClick={() => setValue(field.key, selected ? selectedValues.filter(item => item !== option.value) : [...selectedValues, option.value])} className={`rounded-md px-2 py-1 text-xs ${selected ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500'}`}>{option.label}</button>;
            })}</div>;
        }
        if (field.type === 'boolean') return <button type="button" onClick={() => setValue(field.key, !values[field.key])} className={`mt-1.5 flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm font-normal ${values[field.key] ? 'border-orange-200 bg-orange-50 text-orange-700' : 'border-slate-200 bg-white text-slate-500'}`}><span>{values[field.key] ? field.trueValue || '开启' : field.falseValue || '关闭'}</span><span className={`h-4 w-7 rounded-full p-0.5 ${values[field.key] ? 'bg-orange-500' : 'bg-slate-300'}`}><i className={`block h-3 w-3 rounded-full bg-white transition-transform ${values[field.key] ? 'translate-x-3' : ''}`}/></span></button>;
        return <input type={field.type === 'number' ? 'number' : 'text'} value={String(values[field.key] ?? '')} onChange={event => setValue(field.key, event.target.value)} placeholder={field.placeholder} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal"/>;
    };

    return (
        <div className="fixed inset-0 z-[115] flex justify-end">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]" onClick={onClose}/>
            <aside className="relative flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl animate-in slide-in-from-right duration-200">
                <header className="flex items-start justify-between border-b border-slate-100 bg-orange-50/50 px-4 py-3.5 sm:px-5 sm:py-4">
                    <div className="min-w-0 pr-2">
                        <div className="flex items-center gap-1.5 sm:gap-2">
                            <h2 className="truncate text-base sm:text-lg font-bold text-slate-900">{template.title}</h2>
                            {template.isFavorite && <Star className="h-4 w-4 fill-orange-400 text-orange-400 shrink-0"/>}
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500 line-clamp-1">{template.description || '填写字段后复制，再把满意的效果收进来。'}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => void moveTemplateToTrash()} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-500" title="移入回收站">
                            <Trash2 className="h-4 w-4"/>
                        </button>
                        <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-white hover:text-slate-700">
                            <X className="h-5 w-5"/>
                        </button>
                    </div>
                </header>

                <div className="min-h-0 flex-1 space-y-4 sm:space-y-5 overflow-y-auto p-3.5 sm:p-5">
                    {/* 填写本次内容 */}
                    <section className="rounded-xl border border-orange-100 bg-orange-50/40 p-3.5 sm:p-4">
                        <h3 className="text-sm font-bold text-slate-800">填写本次内容</h3>
                        <div className="mt-2.5 grid gap-3 sm:grid-cols-2">
                            {template.fieldSchema.map(field => (
                                <label key={field.key} className={`text-xs font-semibold text-slate-600 ${field.type === 'textarea' ? 'sm:col-span-2' : ''}`}>
                                    {field.label}{field.required && <span className="ml-1 text-red-500">*</span>}
                                    {renderFieldInput(field)}
                                </label>
                            ))}
                        </div>
                        {missing.length > 0 && <p className="mt-2.5 text-xs text-red-600">还需要填写：{missing.join('、')}</p>}
                    </section>

                    {/* 最终提示词 */}
                    <section className="rounded-xl border border-slate-100 bg-white p-3.5 sm:p-4 shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <h3 className="text-sm font-bold text-slate-800">最终提示词</h3>
                            <div className="flex items-center gap-1.5">
                                <button onClick={() => void copy(rendered.text, '正向提示词')} className="rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50">
                                    <Copy className="mr-1 inline h-3 w-3"/>正向
                                </button>
                                {negative.text && (
                                    <button onClick={() => void copy(negative.text, '反向提示词')} className="rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50">
                                        反向
                                    </button>
                                )}
                                <button onClick={() => void copy(negative.text ? `正向提示词：\n${rendered.text}\n\n反向提示词：\n${negative.text}` : rendered.text, '完整提示词')} className="rounded-md bg-orange-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-orange-600 shadow-sm shadow-orange-500/20">
                                    完整复制
                                </button>
                            </div>
                        </div>
                        <pre className="mt-2 max-h-40 sm:max-h-48 overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-5 text-slate-700">
                            {rendered.text || '填写内容后将在这里预览'}
                        </pre>
                        {negative.text && (
                            <pre className="mt-2 whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-5 text-slate-500">
                                反向：{negative.text}
                            </pre>
                        )}
                    </section>

                    {/* 添加本次效果 */}
                    <section className="rounded-xl border border-slate-200 p-3.5 sm:p-4 bg-white shadow-sm">
                        <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
                            <ImagePlus className="h-4 w-4 text-orange-500"/>添加本次效果
                        </h3>
                        <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple onChange={event => setFiles(Array.from(event.target.files || []).slice(0, 12))} className="text-xs text-slate-500 file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-xs file:bg-orange-50 file:text-orange-700"/>
                            <input value={modelName} onChange={event => setModelName(event.target.value)} placeholder="模型名称（可选）" className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs"/>
                        </div>
                        <input value={note} onChange={event => setNote(event.target.value)} placeholder="效果备注（可选）" className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs"/>
                        <div className="mt-3 flex items-center justify-between">
                            <span className="text-xs text-slate-500">{files.length ? `已选择 ${files.length} 张图片` : '保存后锁定本次字段与值。'}</span>
                            <button disabled={saving} onClick={() => void saveUsage()} className="rounded-lg bg-orange-500 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-60 shadow-sm shadow-orange-500/20">
                                {saving ? '上传中…' : '保存效果'}
                            </button>
                        </div>
                    </section>

                    {/* 历史效果 */}
                    <section className="rounded-xl border border-slate-200 p-3.5 sm:p-4 bg-white shadow-sm">
                        <h3 className="text-sm font-bold text-slate-800">历史效果</h3>
                        <div className="mt-3 space-y-3">
                            {usages.map(usage => (
                                <div key={usage.id} className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                                    <div className="mb-2.5 flex items-center justify-between gap-2">
                                        <p className="text-xs text-slate-500 truncate">{usage.modelName || '效果记录'} · {usage.createdAt} · {usage.resultImages.length} 张图片</p>
                                        <button onClick={() => void moveUsageToTrash(usage.id)} className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-red-50 hover:text-red-500">
                                            <Trash2 className="h-3.5 w-3.5"/>删除本次
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
                                        {usage.resultImages.map(image => (
                                            <figure key={image.id} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                                                <img src={image.imageUrl} alt={image.caption || '提示词效果'} className="aspect-[4/3] w-full object-cover"/>
                                                <figcaption className="flex items-center justify-end p-1">
                                                    <button onClick={() => void setPromptCover(template.id, image.id).then(onChanged)} className={`rounded p-1 ${template.coverImage?.id === image.id ? 'text-orange-500' : 'text-slate-300 hover:text-orange-500'}`} title="设为封面">
                                                        <Star className={`h-3.5 w-3.5 ${template.coverImage?.id === image.id ? 'fill-current' : ''}`}/>
                                                    </button>
                                                </figcaption>
                                            </figure>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                        {!usages.some(usage => usage.resultImages.length) && (
                            <p className="mt-2.5 rounded-xl border border-dashed border-slate-200 py-6 text-center text-xs text-slate-400">
                                还没有效果图，下一次使用后把满意的结果收进来。
                            </p>
                        )}
                    </section>
                </div>
            </aside>
        </div>
    );
}
