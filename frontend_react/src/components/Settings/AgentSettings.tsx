import {useEffect, useMemo, useRef, useState} from 'react';
import {Bot, BrainCircuit, Code2, Edit2, ImagePlus, Plus, Sparkles, Trash2, Upload, X} from 'lucide-react';
import type {AgentConfig, AIModel, MCPServerConfig, ModelType} from '@/api/setting';
import {uploadResource} from '@/api/resources';
import {useToast} from '../common/ToastProvider';
import {SettingsSelect, SettingsSelectOption} from './SettingsSelect';

interface AgentSettingsProps {
    agents: AgentConfig[];
    mcpServers: MCPServerConfig[];
    getModelsByType: (type: ModelType) => (AIModel & { providerName: string, uniqueId: string })[];
    onSave: (agent: Partial<AgentConfig>) => Promise<boolean>;
    onDelete: (target: { type: 'agent', agentId: string }) => void;
}

type AgentForm = {
    id?: string;
    name: string;
    avatar: string;
    model: string;
    prompt: string;
    mcpServers: string[];
};

const DEFAULT_PROMPT = '你是一个专注、可靠的文档协作 Agent。请根据用户目标主动拆解任务，保持回答清晰，并在需要时说明你的假设。';

const getAgentAvatar = (agent: Pick<AgentConfig, 'avatar' | 'name'>) => {
    const value = agent.avatar?.trim();
    if (value) return value;
    return agent.name?.trim().slice(0, 1).toUpperCase() || 'A';
};

const isImageAvatar = (avatar: string) => /^https?:\/\//.test(avatar) || avatar.startsWith('/');

const AgentAvatar = ({agent, size = 'md'}: { agent: Pick<AgentConfig, 'avatar' | 'name'>, size?: 'md' | 'lg' | 'xl' }) => {
    const avatar = getAgentAvatar(agent);
    const sizeClass = {
        md: 'w-11 h-11 text-base rounded-xl',
        lg: 'w-16 h-16 text-xl rounded-2xl',
        xl: 'w-24 h-24 text-3xl rounded-[1.35rem]',
    }[size];

    if (isImageAvatar(avatar)) {
        return (
            <img
                src={avatar}
                alt={agent.name}
                className={`${sizeClass} object-cover border border-slate-200 bg-white shadow-sm`}
            />
        );
    }

    return (
        <div className={`${sizeClass} flex items-center justify-center bg-orange-50 text-orange-600 border border-orange-100 font-bold shadow-sm`}>
            {avatar}
        </div>
    );
};

export const AgentSettings = ({agents, mcpServers, getModelsByType, onSave, onDelete}: AgentSettingsProps) => {
    const [modalOpen, setModalOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [avatarUploading, setAvatarUploading] = useState(false);
    const avatarInputRef = useRef<HTMLInputElement>(null);
    const toast = useToast();
    const [form, setForm] = useState<AgentForm>({
        name: '',
        avatar: '',
        model: '',
        prompt: DEFAULT_PROMPT,
        mcpServers: [],
    });

    const modelOptions = useMemo<SettingsSelectOption<string>[]>(() => {
        return getModelsByType('chat').map(model => ({
            value: model.id,
            label: `${model.providerName} / ${model.name}`,
            description: model.name,
        }));
    }, [getModelsByType]);

    const selectedModel = modelOptions.find(model => model.value === form.model);

    const openCreateModal = () => {
        setForm({
            name: '',
            avatar: '',
            model: modelOptions[0]?.value || '',
            prompt: DEFAULT_PROMPT,
            mcpServers: [],
        });
        setModalOpen(true);
    };

    const openEditModal = (agent: AgentConfig) => {
        setForm({
            id: agent.id,
            name: agent.name,
            avatar: agent.avatar || '',
            model: agent.model || '',
            prompt: agent.prompt || '',
            mcpServers: agent.mcpServers || [],
        });
        setModalOpen(true);
    };

    useEffect(() => {
        if (!modalOpen || form.model || modelOptions.length === 0) return;
        setForm(prev => ({...prev, model: modelOptions[0].value}));
    }, [modalOpen, form.model, modelOptions]);

    const handleSubmit = async () => {
        if (!form.name.trim()) return;

        setSaving(true);
        const success = await onSave({
            id: form.id,
            name: form.name.trim(),
            avatar: form.avatar.trim(),
            model: form.model || null,
            prompt: form.prompt.trim(),
            mcpServers: form.mcpServers,
        });
        setSaving(false);

        if (success) {
            setModalOpen(false);
        }
    };

    const toggleMcpServer = (serverId: string) => {
        setForm(prev => {
            const selected = new Set(prev.mcpServers);
            if (selected.has(serverId)) {
                selected.delete(serverId);
            } else {
                selected.add(serverId);
            }
            return {...prev, mcpServers: Array.from(selected)};
        });
    };

    const getMcpName = (serverId: string) => mcpServers.find(server => server.id === serverId)?.name || serverId;

    const handleAvatarUpload = async (file?: File) => {
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            toast.warning('请选择图片文件作为头像');
            return;
        }

        setAvatarUploading(true);
        try {
            const response = await uploadResource(file, 'image');
            setForm(prev => ({...prev, avatar: `/api/resource/view/${response.id}`}));
            toast.success('头像已上传');
        } catch (error) {
            toast.error('头像上传失败');
        } finally {
            setAvatarUploading(false);
            if (avatarInputRef.current) {
                avatarInputRef.current.value = '';
            }
        }
    };

    return (
        <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-orange-50 text-orange-600 rounded-lg">
                            <Bot className="w-5 h-5"/>
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-800">Agent 创建与管理</h3>
                            <p className="text-xs text-slate-500 mt-1">创建多个不同职责的 Agent，并分别绑定模型、头像、提示词和 MCP。</p>
                        </div>
                    </div>
                    <button
                        onClick={openCreateModal}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white rounded-lg text-xs font-medium transition-all shadow-sm shadow-orange-500/20"
                    >
                        <Plus className="w-3.5 h-3.5"/>
                        创建 Agent
                    </button>
                </div>
            </div>

            {agents.length === 0 ? (
                <div className="text-center py-14 bg-white rounded-2xl border border-dashed border-slate-200 text-slate-400">
                    <Bot className="w-8 h-8 mx-auto mb-3 text-slate-300"/>
                    <p className="text-sm">暂无 Agent，创建一个用于写作、检索或审校的专属助手。</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {agents.map(agent => {
                        const mcpNames = (agent.mcpServers || []).map(getMcpName);
                        const mcpSummary = mcpNames.length > 0 ? `${mcpNames.length} 个 MCP` : '未配置';

                        return (
                            <div
                                key={agent.id}
                                className="group flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-orange-200 hover:shadow-md sm:flex-row sm:items-center"
                            >
                                <div className="flex min-w-0 flex-1 items-center gap-4">
                                    <AgentAvatar agent={agent} size="lg"/>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                            <h4 className="truncate text-base font-bold text-slate-900">{agent.name}</h4>
                                            <span className="truncate text-xs text-slate-400">
                                                {agent.modelDetail?.name || '未绑定模型'}
                                            </span>
                                        </div>
                                        <div className="group/prompt relative mt-1.5">
                                            <p className="line-clamp-2 text-sm leading-6 text-slate-600">
                                                {agent.prompt || '未设置提示词'}
                                            </p>
                                            <div className="pointer-events-none absolute left-0 top-full z-30 mt-2 hidden w-80 max-w-[min(80vw,28rem)] rounded-xl border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-600 shadow-xl shadow-slate-900/10 group-hover/prompt:block">
                                                {agent.prompt || '未设置提示词'}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-2 sm:w-36">
                                    <div className="flex h-8 min-w-0 items-center gap-1.5 rounded-lg border border-blue-100 bg-blue-50 px-2.5 text-xs text-blue-700">
                                        <BrainCircuit className="h-3.5 w-3.5 shrink-0 text-blue-600"/>
                                        <span className="shrink-0 font-semibold">模型</span>
                                        <span className="truncate">
                                            {agent.modelDetail?.type === 'chat' ? 'Chat' : (agent.modelDetail?.type || '未配置')}
                                        </span>
                                    </div>
                                    <div className="group/mcp relative">
                                        <div className="flex h-8 min-w-0 items-center gap-1.5 rounded-lg border border-emerald-100 bg-emerald-50 px-2.5 text-xs text-emerald-700">
                                            <Code2 className="h-3.5 w-3.5 shrink-0 text-emerald-600"/>
                                            <span className="shrink-0 font-semibold">MCP</span>
                                            <span className="truncate">{mcpSummary}</span>
                                        </div>
                                        {mcpNames.length > 0 && (
                                            <div className="absolute right-0 top-full z-30 mt-2 hidden w-56 rounded-xl border border-emerald-100 bg-white p-2 text-xs text-slate-600 shadow-xl shadow-slate-900/10 group-hover/mcp:block">
                                                <div className="px-2 pb-1.5 font-semibold text-emerald-700">已绑定 MCP</div>
                                                <div className="max-h-48 space-y-1 overflow-auto">
                                                    {mcpNames.map(name => (
                                                        <div key={name} className="flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50/70 px-2.5 py-2 text-emerald-800 transition-colors hover:border-emerald-200 hover:bg-emerald-50">
                                                            <Code2 className="h-3.5 w-3.5 shrink-0 text-emerald-600"/>
                                                            <span className="truncate">{name}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center justify-end gap-1 sm:w-9 sm:flex-col sm:justify-center">
                                    <button
                                        onClick={() => openEditModal(agent)}
                                        className="p-2 text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600 rounded-lg"
                                        title="编辑 Agent"
                                    >
                                        <Edit2 className="w-4 h-4"/>
                                    </button>
                                    <button
                                        onClick={() => onDelete({type: 'agent', agentId: agent.id})}
                                        className="p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 rounded-lg"
                                        title="删除 Agent"
                                    >
                                        <Trash2 className="w-4 h-4"/>
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-150">
                    <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">{form.id ? '编辑 Agent' : '创建 Agent'}</h3>
                                <p className="text-xs text-slate-500 mt-1">配置它的身份、模型能力和 MCP 入口</p>
                            </div>
                            <button
                                onClick={() => setModalOpen(false)}
                                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                            >
                                <X className="w-5 h-5"/>
                            </button>
                        </div>

                        <div className="p-6 space-y-6 max-h-[72vh] overflow-y-auto">
                            <div className="flex flex-col items-center text-center">
                                <AgentAvatar agent={{name: form.name || 'Agent', avatar: form.avatar}} size="xl"/>
                                <input
                                    ref={avatarInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={event => handleAvatarUpload(event.target.files?.[0])}
                                />
                                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => avatarInputRef.current?.click()}
                                        disabled={avatarUploading}
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-xs font-medium text-white shadow-sm shadow-orange-500/20 transition-colors hover:bg-orange-600 disabled:opacity-60"
                                    >
                                        {avatarUploading ? (
                                            <div className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin"/>
                                        ) : (
                                            <Upload className="w-3.5 h-3.5"/>
                                        )}
                                        上传头像
                                    </button>
                                    {form.avatar && (
                                        <button
                                            type="button"
                                            onClick={() => setForm({...form, avatar: ''})}
                                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-500 transition-colors hover:bg-red-50 hover:border-red-100 hover:text-red-600"
                                        >
                                            <X className="w-3.5 h-3.5"/>
                                            移除
                                        </button>
                                    )}
                                </div>
                                <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-400">
                                    <ImagePlus className="w-3 h-3"/>
                                    不上传时使用名称首字母
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">名字</label>
                                <input
                                    value={form.name}
                                    onChange={event => setForm({...form, name: event.target.value})}
                                    placeholder="如：写作助手"
                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">大模型</label>
                                <SettingsSelect
                                    value={form.model}
                                    options={modelOptions}
                                    onChange={value => setForm({...form, model: value})}
                                    placeholder="请选择 Agent 使用的对话模型"
                                    emptyMessage="暂无对话模型，请先在 AI 模型接入中添加 chat 模型"
                                    accentClassName="bg-orange-50 text-orange-700"
                                    buttonClassName="bg-slate-50"
                                />
                                {selectedModel && (
                                    <p className="text-xs text-slate-400">当前选择：{selectedModel.label}</p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">提示词</label>
                                <textarea
                                    value={form.prompt}
                                    onChange={event => setForm({...form, prompt: event.target.value})}
                                    rows={7}
                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm leading-6 resize-y"
                                    placeholder="描述这个 Agent 的角色、工作方式、边界和输出风格"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">MCP</label>
                                {mcpServers.length === 0 ? (
                                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-center text-xs text-slate-400">
                                        暂无可选 MCP，请先到 MCP 设置中扫描或接入。
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {mcpServers.map(server => {
                                            const active = form.mcpServers.includes(server.id);
                                            return (
                                                <button
                                                    key={server.id}
                                                    type="button"
                                                    onClick={() => toggleMcpServer(server.id)}
                                                    className={`rounded-xl border px-3 py-3 text-left transition-all ${active ? 'border-orange-200 bg-orange-50 text-orange-700 ring-1 ring-orange-200' : 'border-slate-200 bg-white text-slate-600 hover:border-orange-200 hover:bg-orange-50/40'}`}
                                                >
                                                    <div className="flex items-center justify-between gap-3">
                                                        <span className="truncate text-sm font-semibold">{server.name}</span>
                                                        <span className="shrink-0 rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-mono uppercase text-slate-500">
                                                            {server.transport}
                                                        </span>
                                                    </div>
                                                    <p className="mt-1 truncate text-[11px] text-current opacity-70">
                                                        {server.source === 'system' ? '系统扫描' : '外部接入'}
                                                    </p>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100">
                            <button
                                onClick={() => setModalOpen(false)}
                                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={saving || !form.name.trim()}
                                className="px-4 py-2 text-sm font-medium text-white bg-orange-500 hover:bg-orange-600 active:bg-orange-700 rounded-lg transition-colors shadow-sm flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                {saving ? (
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
                                ) : (
                                    <Sparkles className="w-4 h-4"/>
                                )}
                                保存 Agent
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
