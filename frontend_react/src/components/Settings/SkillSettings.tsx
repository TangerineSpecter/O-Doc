import {useState} from 'react';
import {BookOpenCheck, Edit2, Plus, ShieldCheck, Sparkles, Trash2, X} from 'lucide-react';
import type {SkillConfig} from '@/api/setting';

interface SkillSettingsProps {
    skills: SkillConfig[];
    onSave: (skill: Partial<SkillConfig>) => Promise<boolean>;
    onDelete: (target: { type: 'skill', skillId: string }) => void;
}

type SkillForm = {
    id?: string;
    name: string;
    description: string;
    version: string;
    prompt: string;
    enabled: boolean;
    availableInChat: boolean;
    isSystem: boolean;
};

const defaultForm: SkillForm = {
    name: '',
    description: '',
    version: '',
    prompt: '',
    enabled: true,
    availableInChat: false,
    isSystem: false,
};

export const SkillSettings = ({skills, onSave, onDelete}: SkillSettingsProps) => {
    const [modalOpen, setModalOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState<SkillForm>(defaultForm);

    const openCreateModal = () => {
        setForm(defaultForm);
        setModalOpen(true);
    };

    const openEditModal = (skill: SkillConfig) => {
        setForm({
            id: skill.id,
            name: skill.name,
            description: skill.description || '',
            version: skill.version || '',
            prompt: skill.prompt || '',
            enabled: skill.enabled,
            availableInChat: skill.availableInChat,
            isSystem: skill.isSystem,
        });
        setModalOpen(true);
    };

    const handleSubmit = async () => {
        if (!form.name.trim()) return;

        setSaving(true);
        const payload = form.isSystem
            ? {
                id: form.id,
                enabled: form.enabled,
                availableInChat: form.availableInChat,
            }
            : {
                id: form.id,
                name: form.name.trim(),
                description: form.description.trim(),
                version: form.version.trim(),
                source: 'built_in' as const,
                skillKey: form.id ? undefined : '',
                entry: '',
                prompt: form.prompt.trim(),
                enabled: form.enabled,
                availableInChat: form.availableInChat,
                manifest: {},
            };
        const success = await onSave(payload);
        setSaving(false);

        if (success) {
            setModalOpen(false);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <div className="flex items-center gap-2">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                            <BookOpenCheck className="h-4 w-4"/>
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-800">技能设置</h3>
                            <p className="mt-1 text-xs text-slate-500">维护系统内置技能，再分配给 Agent 作为默认能力。</p>
                        </div>
                    </div>
                </div>
                <button
                    onClick={openCreateModal}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-orange-500 px-3 py-2 text-xs font-medium text-white shadow-sm shadow-orange-500/20 transition-colors hover:bg-orange-600 active:bg-orange-700"
                >
                    <Plus className="h-4 w-4"/>
                    创建技能
                </button>
            </div>

            {skills.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-14 text-center text-slate-400">
                    <BookOpenCheck className="mx-auto mb-3 h-8 w-8 text-slate-300"/>
                    <p className="text-sm">暂无系统技能。可以先创建一个技能，再到 Agent 中绑定。</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {skills.map(skill => (
                        <div
                            key={skill.id}
                            className={`group rounded-2xl border bg-white p-4 shadow-sm transition-all hover:border-orange-200 hover:shadow-md ${skill.enabled ? 'border-slate-200' : 'border-slate-100 opacity-70'}`}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h4 className="truncate text-base font-bold text-slate-900">{skill.name}</h4>
                                        {skill.version && (
                                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-mono text-slate-500">
                                                v{skill.version}
                                            </span>
                                        )}
                                        {skill.isSystem && (
                                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-600">
                                                <ShieldCheck className="h-3 w-3"/>
                                                系统技能
                                            </span>
                                        )}
                                        {skill.availableInChat && (
                                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">
                                                AI 对话
                                            </span>
                                        )}
                                    </div>
                                    <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-600">
                                        {skill.description || '未填写技能说明'}
                                    </p>
                                </div>
                                <div className="flex shrink-0 items-center gap-1">
                                    <button
                                        onClick={() => openEditModal(skill)}
                                        className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
                                        title="编辑技能"
                                    >
                                        <Edit2 className="h-4 w-4"/>
                                    </button>
                                    {!skill.isSystem && (
                                        <button
                                            onClick={() => onDelete({type: 'skill', skillId: skill.id})}
                                            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                                            title="删除技能"
                                        >
                                            <Trash2 className="h-4 w-4"/>
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm animate-in fade-in duration-150">
                    <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl animate-in zoom-in-95 duration-150">
                        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">{form.id ? '编辑技能' : '创建技能'}</h3>
                                <p className="mt-1 text-xs text-slate-500">
                                    {form.isSystem ? '系统技能由项目内置提供，只能调整启用状态。' : '技能以提示词和使用边界为核心，由 Agent 绑定后生效。'}
                                </p>
                            </div>
                            <button
                                onClick={() => setModalOpen(false)}
                                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                            >
                                <X className="h-5 w-5"/>
                            </button>
                        </div>

                        <div className="max-h-[72vh] space-y-5 overflow-y-auto p-6">
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">技能名称</label>
                                    <input
                                        value={form.name}
                                        onChange={event => setForm({...form, name: event.target.value})}
                                        disabled={form.isSystem}
                                        placeholder="如：文档润色助手"
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm transition-all disabled:bg-slate-50 disabled:text-slate-500 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">版本</label>
                                    <input
                                        value={form.version}
                                        onChange={event => setForm({...form, version: event.target.value})}
                                        disabled={form.isSystem}
                                        placeholder="如：1.0.0"
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm transition-all disabled:bg-slate-50 disabled:text-slate-500 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">说明</label>
                                <textarea
                                    value={form.description}
                                    onChange={event => setForm({...form, description: event.target.value})}
                                    disabled={form.isSystem}
                                    rows={3}
                                    placeholder="这个技能适合处理什么任务"
                                    className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-6 transition-all disabled:bg-slate-50 disabled:text-slate-500 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">技能提示词</label>
                                <textarea
                                    value={form.prompt}
                                    onChange={event => setForm({...form, prompt: event.target.value})}
                                    disabled={form.isSystem}
                                    rows={6}
                                    placeholder="写清楚技能目标、输入要求、输出格式和边界"
                                    className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-6 transition-all disabled:bg-slate-50 disabled:text-slate-500 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                                />
                            </div>

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <label className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                                    <div>
                                        <div className="text-sm font-semibold text-slate-700">启用技能</div>
                                        <div className="mt-0.5 text-xs text-slate-500">关闭后不会出现在 Agent 可选技能中</div>
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={form.enabled}
                                        onChange={event => setForm({...form, enabled: event.target.checked})}
                                        className="peer sr-only"
                                    />
                                    <span className="relative h-6 w-11 rounded-full bg-slate-200 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-orange-500 peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-orange-500/20"/>
                                </label>

                                <label className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                                    <div>
                                        <div className="text-sm font-semibold text-slate-700">提供给 AI 对话</div>
                                        <div className="mt-0.5 text-xs text-slate-500">开启后可在 AI Chat 中装载</div>
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={form.availableInChat}
                                        onChange={event => setForm({...form, availableInChat: event.target.checked})}
                                        className="peer sr-only"
                                    />
                                    <span className="relative h-6 w-11 rounded-full bg-slate-200 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-orange-500 peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-orange-500/20"/>
                                </label>
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
                            <button
                                onClick={() => setModalOpen(false)}
                                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={saving || !form.name.trim()}
                                className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-orange-600 active:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {saving ? (
                                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"/>
                                ) : (
                                    <Sparkles className="h-4 w-4"/>
                                )}
                                保存技能
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
