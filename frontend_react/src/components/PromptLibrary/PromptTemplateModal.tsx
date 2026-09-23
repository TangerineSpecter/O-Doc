import {useEffect, useMemo, useState} from 'react';
import {Braces, FolderTree, ImagePlus, Plus, Star, Trash2, X} from 'lucide-react';
import type {PromptField, PromptTaxonomies, PromptTaxonomy, PromptTemplate, PromptTemplateInput, PromptType} from '../../types/api/prompt';
import {promptToken} from '../../utils/promptRenderer';
import {Select, type SelectOption} from '../common/Select';
import PromptImageDropzone from './PromptImageDropzone';

type TaxonomyKind = keyof PromptTaxonomies;

export interface UsageMeta {
    modelName?: string;
    note?: string;
}

interface Props {
    open: boolean;
    template: PromptTemplate | null;
    taxonomies: PromptTaxonomies;
    onClose: () => void;
    onSave: (data: PromptTemplateInput, initialImages: File[], usageMeta?: UsageMeta) => Promise<void>;
    onCreateTaxonomy: (kind: TaxonomyKind, name: string) => Promise<PromptTaxonomy>;
}

interface FormPromptField extends PromptField {
    _clientId: string;
}

let fieldSeed = 0;
const generateFieldClientId = () => `f_${Date.now().toString(36)}_${(fieldSeed++).toString(36)}`;

const blankField = (): FormPromptField => ({
    _clientId: generateFieldClientId(),
    key: `field_${Date.now().toString(36)}`,
    label: '新字段',
    type: 'text',
    required: false,
    defaultValue: '',
    placeholder: '',
});
const blankTemplate: PromptTemplateInput = {title: '', description: '', promptType: 'image', positiveTemplate: '', negativeTemplate: '', fieldSchema: [], categoryId: null, themeIds: [], tagIds: [], isFavorite: false};

const PROMPT_TYPE_OPTIONS: SelectOption<PromptType>[] = [
    {value: 'image', label: '生图', description: '文生图 / 图生图场景'},
    {value: 'html_report', label: 'HTML 报告', description: '交互式报告 / 可视化页面'},
    {value: 'general', label: '通用提示词', description: '日常写作 / 对话与逻辑处理'},
];

const FIELD_TYPE_OPTIONS: SelectOption<PromptField['type']>[] = [
    {value: 'text', label: '单行文本'},
    {value: 'textarea', label: '多行文本'},
    {value: 'select', label: '单选下拉'},
    {value: 'multiselect', label: '多选标签'},
    {value: 'number', label: '数字'},
    {value: 'boolean', label: '开关'},
];

interface InlineTaxonomyCreatorProps {
    label: string;
    onCreate: (name: string) => Promise<void>;
}

function InlineTaxonomyCreator({label, onCreate}: InlineTaxonomyCreatorProps) {
    const [open, setOpen] = useState(false);
    const [name, setName] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const submit = async () => {
        const value = name.trim();
        if (!value) return;
        setSaving(true);
        setError('');
        try {
            await onCreate(value);
            setName('');
            setOpen(false);
        } catch (caught) {
            setError((caught as Error).message || `新增${label}失败`);
        } finally {
            setSaving(false);
        }
    };

    if (!open) {
        return (
            <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-0.5 text-[10px] font-medium text-orange-600 hover:text-orange-700">
                <Plus className="h-3 w-3"/>新增
            </button>
        );
    }

    return (
        <div className="mt-1.5">
            <div className="flex gap-1.5">
                <input
                    value={name}
                    onChange={event => setName(event.target.value)}
                    onKeyDown={event => {
                        if (event.key === 'Escape' || event.key === 'Esc') {
                            event.stopPropagation();
                            setOpen(false);
                            setError('');
                        } else if (event.key === 'Enter') {
                            event.preventDefault();
                            void submit();
                        }
                    }}
                    autoFocus
                    maxLength={50}
                    placeholder={`${label}名称`}
                    className="min-w-0 flex-1 rounded-md border border-orange-200 bg-white px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-orange-500/20"
                />
                <button type="button" disabled={saving || !name.trim()} onClick={() => void submit()} className="rounded-md bg-orange-500 px-2 text-[10px] font-semibold text-white disabled:opacity-50">确定</button>
                <button type="button" onClick={() => { setOpen(false); setError(''); }} className="rounded-md px-1.5 text-[10px] text-slate-400 hover:bg-slate-100">取消</button>
            </div>
            {error && <p className="mt-1 text-[10px] text-red-500">{error}</p>}
        </div>
    );
}

interface FormState extends Omit<PromptTemplateInput, 'fieldSchema'> {
    fieldSchema: FormPromptField[];
}

export default function PromptTemplateModal({open, template, taxonomies, onClose, onSave, onCreateTaxonomy}: Props) {
    const initial = useMemo<FormState>(() => template ? {
        title: template.title, description: template.description, promptType: template.promptType,
        positiveTemplate: template.positiveTemplate, negativeTemplate: template.negativeTemplate,
        fieldSchema: (template.fieldSchema || []).map(f => ({...f, _clientId: generateFieldClientId()})),
        categoryId: template.category?.id || null,
        themeIds: template.themes.map(item => item.id), tagIds: template.tags.map(item => item.id), isFavorite: template.isFavorite,
    } : {
        ...blankTemplate,
        fieldSchema: [],
    }, [template]);
    const [form, setForm] = useState(initial);
    const [saving, setSaving] = useState(false);
    const [initialImages, setInitialImages] = useState<File[]>([]);
    const [modelName, setModelName] = useState('');
    const [note, setNote] = useState('');
    const [imageError, setImageError] = useState('');

    const categoryOptions = useMemo<SelectOption<string>[]>(() => [
        {value: '', label: '未分类 (无分类)'},
        ...taxonomies.categories.map(item => ({value: item.id, label: item.name})),
    ], [taxonomies.categories]);

    useEffect(() => {
        if (!open) return;
        const closeOnEscape = (event: KeyboardEvent) => {
            if ((event.key === 'Escape' || event.key === 'Esc') && !saving) {
                event.stopPropagation();
                onClose();
            }
        };
        window.addEventListener('keydown', closeOnEscape);
        return () => window.removeEventListener('keydown', closeOnEscape);
    }, [open, onClose, saving]);

    if (!open) return null;

    const updateField = (index: number, patch: Partial<FormPromptField>) => setForm(current => ({...current, fieldSchema: current.fieldSchema.map((field, position) => position === index ? {...field, ...patch} : field)}));
    const renameField = (index: number, oldKey: string, key: string) => setForm(current => {
        let positive = current.positiveTemplate;
        let negative = current.negativeTemplate;
        if (oldKey && oldKey !== key) {
            positive = positive.split(promptToken(oldKey)).join(promptToken(key));
            negative = negative.split(promptToken(oldKey)).join(promptToken(key));
        }
        return {
            ...current,
            positiveTemplate: positive,
            negativeTemplate: negative,
            fieldSchema: current.fieldSchema.map((field, position) => position === index ? {...field, key} : field),
        };
    });
    const toggleMulti = (name: 'themeIds' | 'tagIds', id: string) => setForm(current => ({...current, [name]: current[name].includes(id) ? current[name].filter(value => value !== id) : [...current[name], id]}));
    const changeFieldType = (index: number, type: PromptField['type']) => updateField(index, {type, defaultValue: type === 'multiselect' ? [] : type === 'boolean' ? false : ''});
    const submit = async () => {
        if (initialImages.length) {
            const missingDefaults = form.fieldSchema.filter(field => {
                if (!field.required) return false;
                if (field.type === 'boolean') return !field.defaultValue && !field.falseValue;
                if (Array.isArray(field.defaultValue)) return field.defaultValue.length === 0;
                return !String(field.defaultValue ?? '').trim();
            });
            if (missingDefaults.length) {
                setImageError(`要同时保存效果记录，请先为必填字段设置默认值：${missingDefaults.map(field => field.label).join('、')}`);
                return;
            }
        }
        setImageError('');
        setSaving(true);
        const cleanPayload: PromptTemplateInput = {
            ...form,
            fieldSchema: form.fieldSchema.map(({_clientId, ...rest}) => rest),
        };
        try {
            await onSave(cleanPayload, initialImages, {modelName: modelName.trim(), note: note.trim()});
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-2 sm:p-6">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose}/>
            <section className="relative flex h-[92vh] max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl sm:rounded-2xl bg-white shadow-2xl animate-in zoom-in-95 duration-200">
                <header className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-3 sm:px-5 sm:py-4 shrink-0">
                    <div>
                        <h2 className="text-base sm:text-lg font-bold text-slate-900">{template ? '编辑提示词模板' : '新建提示词模板'}</h2>
                        <p className="mt-0.5 text-[11px] sm:text-xs text-slate-500">固定文字配合字段，填写后即可直接复制。</p>
                    </div>
                    <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700 transition-colors" title="关闭 (Esc)">
                        <X className="h-5 w-5"/>
                    </button>
                </header>

                <div className="grid min-h-0 flex-1 items-start gap-4 sm:gap-5 overflow-y-auto scrollbar-hide no-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden p-3.5 sm:p-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.75fr)]">
                    <div className="space-y-3.5 sm:space-y-4">
                        <div className="grid gap-2.5 sm:grid-cols-2">
                            <div className="space-y-1">
                                <label className="block text-xs sm:text-sm font-semibold text-slate-700">标题</label>
                                <input
                                    value={form.title}
                                    onChange={event => setForm({...form, title: event.target.value})}
                                    className="min-h-[42px] w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 sm:py-2 text-xs sm:text-sm shadow-sm transition-all hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                                    placeholder="例如：小红书封面"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="block text-xs sm:text-sm font-semibold text-slate-700">类型</label>
                                <Select
                                    value={form.promptType}
                                    options={PROMPT_TYPE_OPTIONS}
                                    onChange={value => setForm({...form, promptType: value})}
                                    buttonClassName="min-h-[42px] py-1.5 sm:py-2 text-xs sm:text-sm bg-white"
                                    showSelectedDescription={false}
                                />
                            </div>
                        </div>

                        <label className="block text-xs sm:text-sm font-semibold text-slate-700">
                            描述
                            <textarea value={form.description} onChange={event => setForm({...form, description: event.target.value})} className="mt-1 min-h-20 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-xs sm:text-sm" placeholder="什么时候用它？"/>
                        </label>

                        <label className="block text-xs sm:text-sm font-semibold text-slate-700">
                            正向提示词
                            <textarea value={form.positiveTemplate} onChange={event => setForm({...form, positiveTemplate: event.target.value})} className="mt-1 min-h-44 sm:min-h-52 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs sm:text-sm leading-5 sm:leading-6" placeholder="输入固定文案，使用动态字段插入变量。"/>
                        </label>

                        <label className="block text-xs sm:text-sm font-semibold text-slate-700">
                            反向提示词 <span className="font-normal text-slate-400">可选</span>
                            <textarea value={form.negativeTemplate} onChange={event => setForm({...form, negativeTemplate: event.target.value})} className="mt-1 min-h-32 sm:min-h-40 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs sm:text-sm leading-5 sm:leading-6"/>
                        </label>

                        {/* 分类与归档属性卡片 */}
                        <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5 sm:p-4 space-y-3.5">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-slate-800">
                                    <FolderTree className="h-4 w-4 text-orange-500"/>
                                    <span>分类与归档属性</span>
                                </div>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={form.isFavorite}
                                    onClick={() => setForm(current => ({...current, isFavorite: !current.isFavorite}))}
                                    className={`inline-flex items-center gap-2 rounded-lg px-2.5 py-1 text-xs font-medium transition-all select-none border ${
                                        form.isFavorite
                                            ? 'bg-orange-50 text-orange-700 border-orange-200/90 shadow-sm shadow-orange-500/10'
                                            : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700'
                                    }`}
                                >
                                    <Star className={`h-3.5 w-3.5 transition-colors ${form.isFavorite ? 'fill-orange-400 text-orange-400' : 'text-slate-300'}`}/>
                                    <span>收藏此模板</span>
                                    <span
                                        className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors duration-200 ease-in-out ${
                                            form.isFavorite ? 'bg-orange-500' : 'bg-slate-300'
                                        }`}
                                    >
                                        <span
                                            className={`inline-block h-3 w-3 transform rounded-full bg-white shadow-sm transition-transform duration-200 ease-in-out ${
                                                form.isFavorite ? 'translate-x-3.5' : 'translate-x-0.5'
                                            }`}
                                        />
                                    </span>
                                </button>
                            </div>

                            <div>
                                <div className="mb-1 flex items-center justify-between">
                                    <label className="text-xs font-medium text-slate-600">所属分类</label>
                                    <InlineTaxonomyCreator label="分类" onCreate={async name => {
                                        const item = await onCreateTaxonomy('categories', name);
                                        setForm(current => ({...current, categoryId: item.id}));
                                    }}/>
                                </div>
                                <Select
                                    value={form.categoryId || ''}
                                    options={categoryOptions}
                                    onChange={value => setForm({...form, categoryId: value || null})}
                                    placeholder="请选择所属分类"
                                    buttonClassName="min-h-[38px] py-1.5 text-xs sm:text-sm bg-white"
                                />
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2 pt-1 border-t border-slate-200/60">
                                <div>
                                    <div className="mb-1.5 flex items-center justify-between">
                                        <span className="text-xs font-medium text-slate-600">关联主题</span>
                                        <div className="flex items-center gap-2"><span className="text-[10px] text-slate-400">可多选</span><InlineTaxonomyCreator label="主题" onCreate={async name => {
                                            const item = await onCreateTaxonomy('themes', name);
                                            setForm(current => ({...current, themeIds: [...current.themeIds, item.id]}));
                                        }}/></div>
                                    </div>
                                    {taxonomies.themes.length > 0 ? (
                                        <div className="flex flex-wrap gap-1.5 rounded-lg border border-slate-200/80 bg-white p-2 min-h-10 max-h-28 overflow-y-auto">
                                            {taxonomies.themes.map(item => {
                                                const active = form.themeIds.includes(item.id);
                                                return (
                                                    <button
                                                        type="button"
                                                        key={item.id}
                                                        onClick={() => toggleMulti('themeIds', item.id)}
                                                        className={`rounded-md px-2 py-0.5 text-xs transition-colors ${
                                                            active
                                                                ? 'bg-orange-100 text-orange-700 font-semibold ring-1 ring-orange-300/40'
                                                                : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-100'
                                                        }`}
                                                    >
                                                        {item.name}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="rounded-lg border border-dashed border-slate-200 bg-white/60 p-2.5 text-center text-xs text-slate-400">
                                            暂无可选主题
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <div className="mb-1.5 flex items-center justify-between">
                                        <span className="text-xs font-medium text-slate-600">关联标签</span>
                                        <div className="flex items-center gap-2"><span className="text-[10px] text-slate-400">可多选</span><InlineTaxonomyCreator label="标签" onCreate={async name => {
                                            const item = await onCreateTaxonomy('tags', name);
                                            setForm(current => ({...current, tagIds: [...current.tagIds, item.id]}));
                                        }}/></div>
                                    </div>
                                    {taxonomies.tags.length > 0 ? (
                                        <div className="flex flex-wrap gap-1.5 rounded-lg border border-slate-200/80 bg-white p-2 min-h-10 max-h-28 overflow-y-auto">
                                            {taxonomies.tags.map(item => {
                                                const active = form.tagIds.includes(item.id);
                                                return (
                                                    <button
                                                        type="button"
                                                        key={item.id}
                                                        onClick={() => toggleMulti('tagIds', item.id)}
                                                        className={`rounded-md px-2 py-0.5 text-xs transition-colors ${
                                                            active
                                                                ? 'bg-orange-100 text-orange-700 font-semibold ring-1 ring-orange-300/40'
                                                                : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-slate-100'
                                                        }`}
                                                    >
                                                        {item.name}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="rounded-lg border border-dashed border-slate-200 bg-white/60 p-2.5 text-center text-xs text-slate-400">
                                            暂无可选标签
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 sm:p-4 shadow-sm space-y-3">
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex items-start gap-2">
                                    <ImagePlus className="mt-0.5 h-4 w-4 shrink-0 text-orange-500"/>
                                    <div>
                                        <h3 className="text-xs sm:text-sm font-semibold text-slate-800">
                                            {template ? '效果记录与效果图' : '初始效果图'} <span className="font-normal text-slate-400">可选</span>
                                        </h3>
                                        <p className="mt-0.5 text-[10px] sm:text-[11px] text-slate-500">
                                            {template
                                                ? '上传效果图片，保存后生成新的一条效果记录，并自动作为封面。'
                                                : '图片会随模板保存为第一条效果记录，并作为卡片封面展示。'}
                                        </p>
                                    </div>
                                </div>
                            </div>
                            <PromptImageDropzone files={initialImages} onChange={files => { setInitialImages(files); setImageError(''); }} compact/>
                            {imageError && <p className="text-xs text-red-600">{imageError}</p>}

                            {initialImages.length > 0 && (
                                <div className="space-y-2 pt-2 border-t border-slate-100">
                                    <input
                                        value={modelName}
                                        onChange={event => setModelName(event.target.value)}
                                        placeholder="模型名称（可选，如 Midjourney v6、Flux、SDXL）"
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs shadow-xs transition-all hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                                    />
                                    <input
                                        value={note}
                                        onChange={event => setNote(event.target.value)}
                                        placeholder="效果备注（可选，如 Seed、参数或心得）"
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs shadow-xs transition-all hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                                    />
                                </div>
                            )}

                            {template && (template.usages?.length || (template.coverImage ? 1 : 0)) > 0 && (
                                <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-400 flex items-center justify-between">
                                    <span>已有 {template.usages?.length || 1} 条历史效果记录（可在详情中查看完整历史并设为封面）</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 动态字段区域 */}
                    <aside className="self-start rounded-xl border border-orange-100 bg-orange-50/40 p-3.5 sm:p-4 lg:sticky lg:top-0">
                        <div className="flex items-center justify-between">
                            <h3 className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-slate-800">
                                <Braces className="h-4 w-4 text-orange-500"/>动态字段
                            </h3>
                            <button type="button" onClick={() => setForm({...form, fieldSchema: [...form.fieldSchema, blankField()]})} className="inline-flex items-center gap-1 rounded-md bg-orange-500 px-2.5 py-1 text-xs font-semibold text-white shadow-sm shadow-orange-500/20 hover:bg-orange-600">
                                <Plus className="h-3.5 w-3.5"/>添加字段
                            </button>
                        </div>
                        <p className="mt-1 text-[11px] leading-4 text-slate-500">修改字段标识会同步更新提示词中的变量。</p>
                        <div className="mt-2.5 space-y-2.5">
                            {form.fieldSchema.map((field, index) => (
                                <div key={field._clientId} className="rounded-lg border border-slate-200 bg-white p-2.5 sm:p-3 shadow-sm">
                                    <div className="flex gap-1.5">
                                        <input value={field.label} onChange={event => updateField(index, {label: event.target.value})} className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1 text-xs" placeholder="显示名称"/>
                                        <button type="button" onClick={() => setForm(current => ({...current, positiveTemplate: `${current.positiveTemplate}${current.positiveTemplate ? '\n' : ''}${promptToken(field.key)}`}))} className="rounded border border-orange-200 px-2 text-[10px] text-orange-700 bg-orange-50">
                                            插入
                                        </button>
                                        <button type="button" onClick={() => setForm(current => ({...current, fieldSchema: current.fieldSchema.filter((_, position) => position !== index)}))} className="p-1 text-slate-400 hover:text-red-600">
                                            <Trash2 className="h-3.5 w-3.5"/>
                                        </button>
                                    </div>
                                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                                        <input value={field.key} onChange={event => renameField(index, field.key, event.target.value)} className="rounded border border-slate-200 px-2 py-1 font-mono text-[11px]" placeholder="字段标识"/>
                                        <Select
                                            value={field.type}
                                            options={FIELD_TYPE_OPTIONS}
                                            onChange={value => changeFieldType(index, value)}
                                            buttonClassName="min-h-[29px] py-0.5 px-2 text-xs bg-white"
                                            showSelectedDescription={false}
                                        />
                                    </div>
                                    <div
                                        onClick={() => updateField(index, {required: !field.required})}
                                        className="mt-2 inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none"
                                    >
                                        <span
                                            className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors duration-150 ${
                                                field.required ? 'bg-orange-500' : 'bg-slate-300'
                                            }`}
                                        >
                                            <span
                                                className={`inline-block h-3 w-3 transform rounded-full bg-white shadow-sm transition-transform duration-150 ${
                                                    field.required ? 'translate-x-3.5' : 'translate-x-0.5'
                                                }`}
                                            />
                                        </span>
                                        <span className={field.required ? 'text-orange-600 font-medium' : 'text-slate-500'}>必填项</span>
                                    </div>
                                    {field.type === 'boolean' ? (
                                        <div className="mt-2 grid grid-cols-2 gap-1.5">
                                            <input value={field.trueValue || ''} onChange={event => updateField(index, {trueValue: event.target.value})} placeholder="开启时文字" className="rounded border border-slate-200 px-2 py-1 text-xs"/>
                                            <input value={field.falseValue || ''} onChange={event => updateField(index, {falseValue: event.target.value})} placeholder="关闭时文字" className="rounded border border-slate-200 px-2 py-1 text-xs"/>
                                        </div>
                                    ) : (
                                        <input value={Array.isArray(field.defaultValue) ? field.defaultValue.join(',') : String(field.defaultValue || '')} onChange={event => updateField(index, {defaultValue: field.type === 'multiselect' ? event.target.value.split(',').map(value => value.trim()).filter(Boolean) : event.target.value})} className="mt-2 w-full rounded border border-slate-200 px-2 py-1 text-xs" placeholder="默认值（可选）"/>
                                    )}
                                    {['select', 'multiselect'].includes(field.type) && (
                                        <input value={(field.options || []).map(option => option.value).join(',')} onChange={event => updateField(index, {options: event.target.value.split(',').map(value => value.trim()).filter(Boolean).map(value => ({label: value, value}))})} className="mt-2 w-full rounded border border-slate-200 px-2 py-1 text-xs" placeholder="选项用逗号隔开，如 3:4,16:9"/>
                                    )}
                                    <input value={field.placeholder || ''} onChange={event => updateField(index, {placeholder: event.target.value})} className="mt-1.5 w-full rounded border border-slate-200 px-2 py-1 text-xs" placeholder="填写提示说明（可选）"/>
                                </div>
                            ))}
                            {!form.fieldSchema.length && (
                                <p className="rounded-lg border border-dashed border-orange-200 bg-white/70 p-3.5 text-center text-xs text-slate-400">
                                    暂未添加动态字段，当前是一条固定提示词。
                                </p>
                            )}
                        </div>
                    </aside>
                </div>

                <footer className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3 sm:px-5 shrink-0">
                    <button onClick={onClose} className="rounded-lg px-3.5 py-1.5 text-xs sm:text-sm text-slate-600 hover:bg-slate-200">取消</button>
                    <button disabled={saving} onClick={() => void submit()} className="rounded-lg bg-orange-500 px-4 py-1.5 text-xs sm:text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60 shadow-sm shadow-orange-500/20">
                        {saving ? '保存中…' : '保存模板'}
                    </button>
                </footer>
            </section>
        </div>
    );
}
