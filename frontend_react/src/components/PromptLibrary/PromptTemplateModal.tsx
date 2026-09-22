import {useMemo, useState} from 'react';
import {Braces, FolderTree, Plus, Trash2, X} from 'lucide-react';
import type {PromptField, PromptTaxonomies, PromptTemplate, PromptTemplateInput, PromptType} from '../../types/api/prompt';
import {promptToken} from '../../utils/promptRenderer';
import {Select, type SelectOption} from '../common/Select';

interface Props { open: boolean; template: PromptTemplate | null; taxonomies: PromptTaxonomies; onClose: () => void; onSave: (data: PromptTemplateInput) => Promise<void>; }

const blankField = (): PromptField => ({key: `field_${Date.now().toString(36)}`, label: '新字段', type: 'text', required: false, defaultValue: '', placeholder: ''});
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

export default function PromptTemplateModal({open, template, taxonomies, onClose, onSave}: Props) {
    const initial = useMemo<PromptTemplateInput>(() => template ? {
        title: template.title, description: template.description, promptType: template.promptType,
        positiveTemplate: template.positiveTemplate, negativeTemplate: template.negativeTemplate,
        fieldSchema: template.fieldSchema, categoryId: template.category?.id || null,
        themeIds: template.themes.map(item => item.id), tagIds: template.tags.map(item => item.id), isFavorite: template.isFavorite,
    } : blankTemplate, [template]);
    const [form, setForm] = useState(initial);
    const [saving, setSaving] = useState(false);

    const categoryOptions = useMemo<SelectOption<string>[]>(() => [
        {value: '', label: '未分类 (无分类)'},
        ...taxonomies.categories.map(item => ({value: item.id, label: item.name})),
    ], [taxonomies.categories]);

    if (!open) return null;

    const updateField = (index: number, patch: Partial<PromptField>) => setForm(current => ({...current, fieldSchema: current.fieldSchema.map((field, position) => position === index ? {...field, ...patch} : field)}));
    const renameField = (index: number, oldKey: string, key: string) => setForm(current => ({
        ...current,
        positiveTemplate: current.positiveTemplate.split(promptToken(oldKey)).join(promptToken(key)),
        negativeTemplate: current.negativeTemplate.split(promptToken(oldKey)).join(promptToken(key)),
        fieldSchema: current.fieldSchema.map((field, position) => position === index ? {...field, key} : field),
    }));
    const toggleMulti = (name: 'themeIds' | 'tagIds', id: string) => setForm(current => ({...current, [name]: current[name].includes(id) ? current[name].filter(value => value !== id) : [...current[name], id]}));
    const changeFieldType = (index: number, type: PromptField['type']) => updateField(index, {type, defaultValue: type === 'multiselect' ? [] : type === 'boolean' ? false : ''});
    const submit = async () => { setSaving(true); try { await onSave(form); } finally { setSaving(false); } };

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-2 sm:p-6">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose}/>
            <section className="relative flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl sm:rounded-2xl bg-white shadow-2xl animate-in zoom-in-95 duration-200">
                <header className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-3 sm:px-5 sm:py-4 shrink-0">
                    <div>
                        <h2 className="text-base sm:text-lg font-bold text-slate-900">{template ? '编辑提示词模板' : '新建提示词模板'}</h2>
                        <p className="mt-0.5 text-[11px] sm:text-xs text-slate-500">固定文字配合字段，填写后即可直接复制。</p>
                    </div>
                    <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700">
                        <X className="h-5 w-5"/>
                    </button>
                </header>

                <div className="grid min-h-0 flex-1 gap-4 sm:gap-5 overflow-y-auto p-3.5 sm:p-5 lg:grid-cols-[1.45fr_0.9fr]">
                    <div className="space-y-3.5 sm:space-y-4">
                        <div className="grid gap-2.5 sm:grid-cols-2">
                            <label className="text-xs sm:text-sm font-semibold text-slate-700">
                                标题
                                <input value={form.title} onChange={event => setForm({...form, title: event.target.value})} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 sm:py-2 text-xs sm:text-sm" placeholder="例如：小红书封面"/>
                            </label>
                            <div className="space-y-1">
                                <label className="text-xs sm:text-sm font-semibold text-slate-700">类型</label>
                                <Select
                                    value={form.promptType}
                                    options={PROMPT_TYPE_OPTIONS}
                                    onChange={value => setForm({...form, promptType: value})}
                                    buttonClassName="min-h-[38px] sm:min-h-[42px] py-1.5 sm:py-2 text-xs sm:text-sm bg-white"
                                />
                            </div>
                        </div>

                        <label className="block text-xs sm:text-sm font-semibold text-slate-700">
                            描述
                            <textarea value={form.description} onChange={event => setForm({...form, description: event.target.value})} className="mt-1 min-h-14 sm:min-h-16 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs sm:text-sm" placeholder="什么时候用它？"/>
                        </label>

                        <label className="block text-xs sm:text-sm font-semibold text-slate-700">
                            正向提示词
                            <textarea value={form.positiveTemplate} onChange={event => setForm({...form, positiveTemplate: event.target.value})} className="mt-1 min-h-32 sm:min-h-40 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs sm:text-sm leading-5 sm:leading-6" placeholder="输入固定文案，使用动态字段插入变量。"/>
                        </label>

                        <label className="block text-xs sm:text-sm font-semibold text-slate-700">
                            反向提示词 <span className="font-normal text-slate-400">可选</span>
                            <textarea value={form.negativeTemplate} onChange={event => setForm({...form, negativeTemplate: event.target.value})} className="mt-1 min-h-20 sm:min-h-24 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs sm:text-sm leading-5 sm:leading-6"/>
                        </label>

                        {/* 分类与归档属性卡片 */}
                        <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5 sm:p-4 space-y-3.5">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-slate-800">
                                    <FolderTree className="h-4 w-4 text-orange-500"/>
                                    <span>分类与归档属性</span>
                                </div>
                                <label className="inline-flex items-center gap-1.5 cursor-pointer select-none text-xs font-medium text-slate-600 hover:text-slate-900">
                                    <input
                                        type="checkbox"
                                        checked={form.isFavorite}
                                        onChange={event => setForm({...form, isFavorite: event.target.checked})}
                                        className="h-3.5 w-3.5 rounded border-slate-300 text-orange-500 focus:ring-orange-500/20"
                                    />
                                    <span>收藏此模板</span>
                                </label>
                            </div>

                            <div>
                                <label className="mb-1 block text-xs font-medium text-slate-600">所属分类</label>
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
                                        <span className="text-[10px] text-slate-400">可多选</span>
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
                                        <span className="text-[10px] text-slate-400">可多选</span>
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
                    </div>

                    {/* 动态字段区域 */}
                    <aside className="rounded-xl border border-orange-100 bg-orange-50/40 p-3.5 sm:p-4">
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
                                <div key={`${field.key}-${index}`} className="rounded-lg border border-slate-200 bg-white p-2.5 sm:p-3 shadow-sm">
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
                                    <label className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                                        <input type="checkbox" checked={field.required} onChange={event => updateField(index, {required: event.target.checked})}/>必填项
                                    </label>
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
