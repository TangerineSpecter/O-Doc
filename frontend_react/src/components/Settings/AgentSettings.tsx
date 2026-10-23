import {AgentTaskEditor} from './agent/AgentTaskEditor';
import {isSystemTaskKind} from './agent/agentTaskDraft';
import {createPortal} from 'react-dom';
import {AgentArchiveDialog} from './agent/AgentArchiveDialog';
import ConfirmationModal from '../common/ConfirmationModal';
import {ModelThinkingBadge} from './ModelThinkingBadge';
import AgentSettingsToolbar from './AgentSettingsToolbar';
import LifeManualRunDialog from '../AgentLife/LifeManualRunDialog';
import { ProfessionSelect } from "../AgentWorld/ProfessionSelect";
import { ProfessionBadge } from "../AgentWorld/ProfessionBadge";
import { StaminaBar } from "../AgentWorld/StaminaBar";
import {useEffect, useMemo, useState} from 'react';
import {
    BellRing,
    Bot,
    BrainCircuit,
    CalendarClock,
    Code2,
    Database,
    Edit2,
    MessageCircle,
    Play,
    Repeat2,
    Sparkles,
    Trash2,
    Archive,
    Users,
    WandSparkles,
    X,
} from 'lucide-react';
import type {
    AgentConfig,
    AgentMemoryType,
    AgentTaskConfig,
    AIModel,
    MCPServerConfig,
    ModelType,
    SkillConfig,
} from '@/api/setting';
import {useToast} from '../common/ToastProvider';
import {useEscapeDismissal} from '../../hooks/useEscapeDismissal';
import {SettingsSelect, SettingsSelectOption} from './SettingsSelect';
import {RandomTaskProgress} from './agent/RandomTaskProgress';
import {useRandomTaskProgress} from './agent/useRandomTaskProgress';
import {useAgentMemories} from './agent/useAgentMemories';
import {AgentMemoryModal} from './agent/AgentMemoryModal';
import {useAgentAvatarUpload} from './agent/useAgentAvatarUpload';
import {AgentAvatarField} from './agent/AgentAvatarField';
import {AgentFullBodyImageField} from './agent/AgentFullBodyImageField';
import {isImageAvatarValue} from '@/utils/avatar';
import {AgentRoleEditor} from './agent/AgentRoleEditor';
import {fullRoleText} from '@/utils/agentRole';
import {PostInteractionScopeFields} from './agent/PostInteractionScopeFields';
import {BattleAppearanceEntry} from './agent/battle-appearance/BattleAppearanceEntry';
import {BattleAppearanceEditor} from './agent/battle-appearance/BattleAppearanceEditor';
import type {AgentBattleAppearance} from '@/types/api/setting';

import {WorldRunnerSwitch} from './agent/WorldRunnerSwitch';
import {SystemTaskProgress} from './agent/SystemTaskProgress';
import {MemoCaptureSettings} from './agent/MemoCaptureSettings';
import {TaskActivityGroups} from './agent/TaskActivityGroups';
import {defaultPostInteractionTask, defaultPostPublishTask, defaultTravelTask, defaultFarmTask, defaultMarketTask, defaultInvestmentTask, defaultCookingTask, defaultAlchemyTask, defaultBlacksmithTask, defaultExplorationTask} from './agent/builtinTasks';
import {PostPublishPreviewModal} from './agent/PostPublishPreviewModal';
import {downloadAgentCsv} from '@/utils/agentCsvExport';

interface AgentSettingsProps {
    initialView?: AgentView;
    agents: AgentConfig[];
    tasks: AgentTaskConfig[];
    mcpServers: MCPServerConfig[];
    skills: SkillConfig[];
    getModelsByType: (type: ModelType) => (AIModel & { providerName: string, uniqueId: string })[];
    onSave: (agent: Partial<AgentConfig>) => Promise<boolean>;
    onSaveTask: (task: Partial<AgentTaskConfig>) => Promise<boolean>;
    onRunTaskNow: (taskId: string) => Promise<boolean>;
    onDeleteTask: (taskId: string) => void;
    archivedAgents: AgentConfig[];
    archiveConflictId?: string | null;
    onArchive: (id: string) => Promise<boolean>;
    onRestore: (id: string) => Promise<boolean>;
}

type AgentForm = {
    postCollectionIds?: string[];
    postCategoryIds?: string[];
    profession?: string | null;
    id?: string;
    name: string;
    avatar: string;
    fullBodyImage: string;
    model: string;
    roleProfile?: Partial<import('@/types/api/agentPrompt').RoleProfile>;
    prompt: string;
    mcpServers: string[];
    skills: string[];
    feishuImEnabled: boolean;
    feishuAppId: string;
    feishuAppSecret: string;
    feishuVerificationToken: string;
    feishuEncryptKey: string;
};

type AgentView = 'list' | 'tasks';

const getAgentAvatar = (agent: Pick<AgentConfig, 'avatar' | 'name'>) => {
    const value = agent.avatar?.trim();
    if (value) return value;
    return agent.name?.trim().slice(0, 1).toUpperCase() || 'A';
};

const AgentAvatar = ({agent, size = 'md'}: { agent: Pick<AgentConfig, 'avatar' | 'name'>, size?: 'sm' | 'md' | 'lg' | 'xl' }) => {
    const avatar = getAgentAvatar(agent);
    const sizeClass = {
        sm: 'w-9 h-9 text-sm rounded-lg',
        md: 'w-11 h-11 text-base rounded-xl',
        lg: 'w-16 h-16 text-xl rounded-2xl',
        xl: 'w-24 h-24 text-3xl rounded-[1.35rem]',
    }[size];

    if (isImageAvatarValue(avatar)) {
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

export const AgentSettings = ({
                                  initialView = 'list',
                                  agents,
                                  tasks,
                                  mcpServers,
                                  skills,
                                  getModelsByType,
                                  onSave,
                                  onSaveTask,
                                  onRunTaskNow,
                                  onDeleteTask,
                                  archivedAgents, archiveConflictId, onArchive, onRestore,
                              }: AgentSettingsProps) => {
    const [archiveOpen, setArchiveOpen] = useState(false);
    const [archiveTarget, setArchiveTarget] = useState<AgentConfig | null>(null);
    const [battleAppearanceTarget,setBattleAppearanceTarget]=useState<AgentConfig|null>(null);
    const [battleAppearanceOverrides,setBattleAppearanceOverrides]=useState<Record<string,AgentBattleAppearance|null>>({});
    const [archiving, setArchiving] = useState(false);
    const allResidents = [...agents, ...archivedAgents];
    const [activeView, setActiveView] = useState<AgentView>(initialView);
    const {progressByTask, worldProgressByTask, refreshFailed} = useRandomTaskProgress(tasks, activeView === 'tasks');
    const [modalOpen, setModalOpen] = useState(false);
    const [taskEditor, setTaskEditor] = useState<{task?: AgentTaskConfig} | null>(null);
    const [previewTask, setPreviewTask] = useState<AgentTaskConfig | null>(null);
    const [saving, setSaving] = useState(false);
    const [fullBodyUploading, setFullBodyUploading] = useState(false);
    const [runningTaskId, setRunningTaskId] = useState<string | null>(null);
    const toast = useToast();
    const [form, setForm] = useState<AgentForm>({
        name: '',
        avatar: '',
        fullBodyImage: '',
        model: '',
        prompt: '',
        roleProfile: {},
        mcpServers: [],
        skills: [],
        feishuImEnabled: false,
        feishuAppId: '',
        feishuAppSecret: '',
        feishuVerificationToken: '',
        feishuEncryptKey: '',
    });
    const {
        avatarInputRef,
        avatarPreviewUrl,
        avatarUploading,
        clearAvatarPreview,
        handleAvatarUpload,
    } = useAgentAvatarUpload(avatar => {
        setForm(prev => ({...prev, avatar}));
    });
    const {
        memoryModalAgent,
        memories,
        memoryLoading,
        memorySaving,
        memoryError,
        memoryStatusFilter,
        memoryForm,
        setMemoryStatusFilter,
        setMemoryForm,
        resetMemoryForm,
        loadAgentMemories,
        openMemoryModal,
        closeMemoryModal,
        editMemory,
        handleMemorySubmit,
        archiveMemory,
        memorySummary, memorySourceFilter, setMemorySourceFilter,
    } = useAgentMemories();
    useEscapeDismissal(Boolean(memoryModalAgent), closeMemoryModal);
    useEscapeDismissal(modalOpen, () => {
        clearAvatarPreview();
        setModalOpen(false);
    });

    const modelOptions = useMemo<SettingsSelectOption<string>[]>(() => {
        return getModelsByType('chat').map(model => ({
            value: model.id,
            textLabel: `${model.providerName} / ${model.name}`,
            label: <span className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 flex-1 truncate" title={`${model.providerName} / ${model.name}`}>{model.providerName} / {model.name}</span>
                <ModelThinkingBadge model={model}/>
            </span>,
        }));
    }, [getModelsByType]);

    const selectedModel = modelOptions.find(model => model.value === form.model);
    const memoryTypeOptions: SettingsSelectOption<AgentMemoryType>[] = [
        {value: 'preference', label: '偏好'},
        {value: 'fact', label: '事实'},
        {value: 'project', label: '项目'},
        {value: 'instruction', label: '指令'},
        {value: 'other', label: '其他'},
    ];
    const builtinInvestmentTask = tasks.find(task => task.taskKind === 'investment') || defaultInvestmentTask;
    const builtinMarketTask = tasks.find(task => task.taskKind === 'market') || defaultMarketTask;
    const builtinExplorationTask = tasks.find(task => task.taskKind === 'exploration') || defaultExplorationTask;
    const builtinCookingTask = tasks.find(task => task.taskKind === 'cooking') || defaultCookingTask;
    const builtinBlacksmithTask = tasks.find(task => task.taskKind === 'blacksmith') || defaultBlacksmithTask;
    const builtinAlchemyTask = tasks.find(task => task.taskKind === 'alchemy') || defaultAlchemyTask;
    const builtinFarmTask = tasks.find(task => task.taskKind === 'farm') || defaultFarmTask;
    const builtinTravelTask = tasks.find(task => task.taskKind === 'travel') || defaultTravelTask;
    const builtinPublishTask = tasks.find(task => task.taskKind === 'post_publish') || defaultPostPublishTask;
    const builtinPostTask = tasks.find(task => task.taskKind === 'post_interaction') || defaultPostInteractionTask;
    const customTasks = tasks.filter(task => !isSystemTaskKind(task.taskKind) && !['memo_capture', 'lottery', 'fishing'].includes(task.taskKind || 'custom'));

    const openCreateModal = () => {
        clearAvatarPreview();
        setForm({
            name: '',
            avatar: '',
            fullBodyImage: '',
            model: modelOptions[0]?.value || '',
            prompt: '',
        roleProfile: {},
            mcpServers: [],
            skills: [],
            feishuImEnabled: false,
            feishuAppId: '',
            feishuAppSecret: '',
            feishuVerificationToken: '',
            feishuEncryptKey: '',
        });
        setModalOpen(true);
    };

    const openCreateTaskModal = () => setTaskEditor({});
    const openEditTaskModal = (task: AgentTaskConfig) => setTaskEditor({task});

    const handleExportAgents = () => {
        if (!agents || agents.length === 0) {
            toast.warning('暂无活跃 Agent 可导出');
            return;
        }
        try {
            const success = downloadAgentCsv(agents);
            if (success) {
                toast.success(`已成功导出 ${agents.length} 位 Agent 设定`);
            } else {
                toast.warning('暂无活跃 Agent 可导出');
            }
        } catch {
            toast.error('导出失败，请重试');
        }
    };

    const openEditModal = (agent: AgentConfig) => {
        clearAvatarPreview();
        setForm({
            id: agent.id,
            postCollectionIds: agent.postCollectionIds || [],
            postCategoryIds: agent.postCategoryIds || [],
            profession: agent.profession,
            name: agent.name,
            avatar: agent.avatar || '',
            fullBodyImage: agent.fullBodyImage || '',
            model: agent.model || '',
            prompt: agent.prompt || '',
            roleProfile: agent.roleProfile || {},
            mcpServers: agent.mcpServers || [],
            skills: agent.skills || [],
            feishuImEnabled: agent.feishuImEnabled ?? false,
            feishuAppId: agent.feishuAppId || '',
            feishuAppSecret: agent.feishuAppSecret || '',
            feishuVerificationToken: agent.feishuVerificationToken || '',
            feishuEncryptKey: agent.feishuEncryptKey || '',
        });
        setModalOpen(true);
    };

    useEffect(() => {
        if (!modalOpen || form.model || modelOptions.length === 0) return;
        setForm(prev => ({...prev, model: modelOptions[0].value}));
    }, [modalOpen, form.model, modelOptions]);

    const handleSubmit = async () => {
        if (avatarUploading || fullBodyUploading || saving) return;
        if (!form.name.trim()) return;
        if (form.feishuImEnabled && (!form.feishuAppId.trim() || !form.feishuAppSecret.trim())) {
            toast.warning('请填写飞书 App ID 和 App Secret');
            return;
        }

        setSaving(true);
        const success = await onSave({
            id: form.id,
            postCollectionIds: form.postCollectionIds || [],
            postCategoryIds: form.postCategoryIds || [],
            profession: form.profession || null,
            name: form.name.trim(),
            avatar: form.avatar.trim(),
            fullBodyImage: form.fullBodyImage.trim(),
            model: form.model || null,
            prompt: form.prompt.trim(),
            roleProfile: form.roleProfile || {},
            mcpServers: form.mcpServers,
            skills: form.skills,
            feishuImEnabled: form.feishuImEnabled,
            feishuAppId: form.feishuAppId.trim(),
            feishuAppSecret: form.feishuAppSecret.trim(),
            feishuVerificationToken: form.feishuVerificationToken.trim(),
            feishuEncryptKey: form.feishuEncryptKey.trim(),
        });
        setSaving(false);

        if (success) {
            clearAvatarPreview();
            setModalOpen(false);
        }
    };

    const toggleTaskEnabled = (taskId: string) => {
        const task = tasks.find(item => item.id === taskId);
        if (!task) return;
        onSaveTask({...task, enabled: !task.enabled});
    };

    const deleteTask = (taskId: string) => {
        onDeleteTask(taskId);
    };

    const [manualLifeTask, setManualLifeTask] = useState<{taskId: string; publishCategoryIds?: string[]} | null>(null);
    const runTaskNow = async (taskId: string) => {
        const lifeTask = [builtinPostTask, builtinPublishTask, builtinTravelTask, builtinInvestmentTask, builtinMarketTask, builtinFarmTask, builtinCookingTask, builtinAlchemyTask, builtinBlacksmithTask, builtinExplorationTask].find(task => task.id === taskId);
        if (lifeTask) {
            setManualLifeTask({
                taskId,
                ...(lifeTask.taskKind === 'post_publish'
                    ? {publishCategoryIds: lifeTask.publishConfig?.rules.map(rule => rule.categoryId) || []}
                    : {}),
            });
            return;
        }
        setRunningTaskId(taskId);
        try {
            await onRunTaskNow(taskId);
        } finally {
            setRunningTaskId(null);
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

    const toggleSkill = (skillId: string) => {
        setForm(prev => {
            const selected = new Set(prev.skills);
            if (selected.has(skillId)) {
                selected.delete(skillId);
            } else {
                selected.add(skillId);
            }
            return {...prev, skills: Array.from(selected)};
        });
    };

    const getMcpName = (serverId: string) => mcpServers.find(server => server.id === serverId)?.name || serverId;
    const enabledSkills = skills.filter(skill => skill.enabled);
    const getSkillName = (skillId: string) => skills.find(skill => skill.id === skillId)?.name || skillId;
    const getTaskAgentIds = (task: AgentTaskConfig) => task.agents?.length ? task.agents : (task.agent ? [task.agent] : []);
    const getTaskAgentNames = (task: AgentTaskConfig) => {
        return getTaskAgentIds(task).map((id, index) => {
            const agent = allResidents.find(row => row.id === id);
            return agent ? agent.name + (agent.archived ? '（已归档）' : '') : task.agentNames?.[index] || id;
        });
    };
    const formatAgentSummary = (names: string[]) => {
        if (names.length <= 1) return names[0] || '-';
        return `Agent x ${names.length}`;
    };
    const renderAgentSummary = (names: string[], className = '') => {
        const isSingle = names.length <= 1;

        return (
            <span
                className={`inline-flex w-fit max-w-full items-center gap-1.5 whitespace-nowrap rounded-md bg-orange-600 px-2 py-1 text-xs font-bold text-white shadow-sm shadow-orange-200/70 ${className}`}
                title={names.join('、')}
            >
                <Bot className="h-3.5 w-3.5"/>
                <span className={isSingle ? 'truncate' : 'font-mono text-[11px] leading-none text-orange-100'}>
                    {isSingle ? formatAgentSummary(names) : `x ${names.length}`}
                </span>
            </span>
        );
    };
    return (
        <div className="space-y-6 pb-6 sm:pb-8">
            <div className="bg-white rounded-2xl border border-slate-200 px-5 py-3.5 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                            <Bot className="w-5 h-5"/>
                        </div>
                        <div className="min-w-0">
                            <h3 className="font-bold text-slate-800 text-sm">Agent 管理</h3>
                            <p className="text-xs text-slate-500 mt-0.5 truncate max-w-md lg:max-w-lg xl:max-w-xl">
                                创建多个不同职责的 Agent，并分别绑定模型、提示词、MCP、技能和 IM 通道。
                            </p>
                        </div>
                    </div>
                    <AgentSettingsToolbar
                        activeView={activeView}
                        onViewChange={setActiveView}
                        onCreateAgent={openCreateModal}
                        onCreateTask={openCreateTaskModal}
                        onOpenArchive={() => setArchiveOpen(true)}
                        archivedCount={archivedAgents.length}
                        onExportCsv={handleExportAgents}
                        canExport={agents.length > 0}
                    />
                </div>
            </div>

            {activeView === 'tasks' ? (
                <div className="space-y-4">
                    <WorldRunnerSwitch agents={agents}/>

                    <TaskActivityGroups
                        tasks={[builtinTravelTask, builtinFarmTask, builtinInvestmentTask, builtinPublishTask, builtinPostTask,
                            builtinCookingTask, builtinAlchemyTask, builtinBlacksmithTask, builtinExplorationTask, builtinMarketTask]}
                        runningTaskId={runningTaskId}
                        onConfigure={openEditTaskModal} onToggle={toggleTaskEnabled} onRun={runTaskNow} onPreview={setPreviewTask}
                        memo={<MemoCaptureSettings models={modelOptions} task={tasks.find(task => task.taskKind === 'memo_capture')} agents={agents} progress={progressByTask[tasks.find(task => task.taskKind === 'memo_capture')?.id || '']} running={runningTaskId === tasks.find(task => task.taskKind === 'memo_capture')?.id} onSave={onSaveTask} onRun={runTaskNow}/>}
                    />

                    {/* 自定义计划任务分组 */}
                    <div className="space-y-2.5 pt-1">
                        <div className="flex items-center gap-2 px-1">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                自定义计划任务
                            </h3>
                            {customTasks.length > 0 && (
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                                    {customTasks.length} 项
                                </span>
                            )}
                        </div>
                        {customTasks.length === 0 ? (
                            <div className="text-center py-14 bg-white rounded-2xl border border-dashed border-slate-200 text-slate-400">
                                <CalendarClock className="w-8 h-8 mx-auto mb-3 text-slate-300"/>
                                <p className="text-sm">暂无自定义任务，可按需添加定时或手动触发的任务。</p>
                            </div>
                        ) : customTasks.map(task => {
                        const taskAgentNames = getTaskAgentNames(task);
                        const executionModeLabel = task.executionMode === 'serial' ? '串行' : '并行';
                        return (
                        <div key={task.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-orange-200 hover:shadow-md">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h4 className="text-base font-bold text-slate-900">{task.name}</h4>
                                        <button
                                            onClick={() => toggleTaskEnabled(task.id)}
                                            className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-[11px] font-medium transition-colors ${task.enabled ? 'border-emerald-100 bg-emerald-50 text-emerald-700 hover:border-emerald-200 hover:bg-emerald-100/60' : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-orange-100 hover:bg-orange-50 hover:text-orange-600'}`}
                                            title={task.enabled ? '点击停用任务' : '点击启用任务'}
	                                        >
	                                            {task.enabled ? '启用中' : '已停用'}
	                                        </button>
                                        {task.notifyEnabled && (
                                            <span className="inline-flex items-center gap-1 rounded-lg border border-violet-100 bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700">
                                                <BellRing className="h-3 w-3"/>
                                                飞书通知
                                            </span>
                                        )}
                                        {task.followupEnabled && (
                                            <span className="inline-flex items-center gap-1 rounded-lg border border-orange-100 bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-700">
                                                <Repeat2 className="h-3 w-3"/>
                                                {task.followupAction === 'continue_research' ? '自动续查' : '自动互评'}
                                            </span>
                                        )}
	                                    </div>
	                                </div>

		                                <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 sm:grid-cols-3 lg:w-[24rem]">
                                    <div className="rounded-lg border border-orange-100 bg-orange-50 px-3 py-2">
                                        <div className="mb-1 flex items-center gap-1.5 font-semibold text-orange-700">
                                            <Users className="h-3.5 w-3.5"/>
                                            Agent · {executionModeLabel}
                                        </div>
                                        {renderAgentSummary(taskAgentNames, 'mt-1')}
                                    </div>
                                    <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
                                        <div className="mb-1 flex items-center gap-1.5 font-semibold text-blue-700">
                                            <CalendarClock className="h-3.5 w-3.5"/>
                                            触发
                                        </div>
                                        <p className="truncate">{task.trigger}</p>
                                    </div>
	                                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
	                                        <div className="mb-1 flex items-center gap-1.5 font-semibold text-slate-700">
	                                            <Repeat2 className="h-3.5 w-3.5"/>
	                                            周期
	                                        </div>
	                                        <p className="truncate">{task.trigger === '手动执行' ? '手动执行' : task.schedule}</p>
                                            <RandomTaskProgress progress={progressByTask[task.id]} enabled={task.enabled}/>
                                            {task.taskKind === 'post_interaction' && <SystemTaskProgress progress={worldProgressByTask[task.id]}/>}
                                            {refreshFailed && task.scheduleMode === 'random' && <p className="mt-1 text-xs text-red-600">进度刷新失败，稍后自动重试</p>}
	                                    </div>
                                </div>

	                                <div className="flex items-center justify-end gap-1 lg:w-9 lg:flex-col lg:justify-center">
                                        <button
                                            onClick={() => runTaskNow(task.id)}
                                            disabled={runningTaskId === task.id}
                                            className="p-2 text-slate-400 transition-colors hover:bg-orange-50 hover:text-orange-600 rounded-lg disabled:cursor-wait disabled:opacity-50"
                                            title="立即执行"
                                        >
                                            {runningTaskId === task.id ? (
                                                <span className="block h-4 w-4 rounded-full border-2 border-orange-200 border-t-orange-500 animate-spin"/>
                                            ) : (
                                                <Play className="w-4 h-4"/>
                                            )}
                                        </button>
	                                    <button
	                                        onClick={() => openEditTaskModal(task)}
                                        className="p-2 text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600 rounded-lg"
                                        title="编辑任务"
                                    >
                                        <Edit2 className="w-4 h-4"/>
                                    </button>
                                    <button
                                        onClick={() => deleteTask(task.id)}
                                        className="p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 rounded-lg"
                                        title="删除任务"
                                    >
                                        <Trash2 className="w-4 h-4"/>
                                    </button>
                                </div>
                            </div>
                        </div>
                        );
                    })}
                    </div>
                </div>
            ) : agents.length === 0 ? (
                <div className="text-center py-14 bg-white rounded-2xl border border-dashed border-slate-200 text-slate-400">
                    <Bot className="w-8 h-8 mx-auto mb-3 text-slate-300"/>
                    <p className="text-sm">暂无 Agent，创建一个用于写作、检索或审校的专属助手。</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {agents.map(agent => {
                        const mcpNames = (agent.mcpServers || []).map(getMcpName);
                        const mcpSummary = mcpNames.length > 0 ? `${mcpNames.length} 个 MCP` : '未配置';
                        const skillNames = (agent.skills || []).map(getSkillName);
                        const skillSummary = skillNames.length > 0 ? `${skillNames.length} 个技能` : '未配置';
                        const battleAppearance=Object.prototype.hasOwnProperty.call(battleAppearanceOverrides,agent.id)
                            ?battleAppearanceOverrides[agent.id]:agent.battleAppearance;

                        return (
                            <div
                                key={agent.id}
                                className="group relative flex flex-col gap-3.5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-orange-200 hover:shadow-md sm:flex-row sm:items-center sm:justify-between"
                            >
                                <div className="flex min-w-0 flex-1 items-start sm:items-center gap-3.5">
                                    <div className="shrink-0 pt-0.5 sm:pt-0">
                                        <AgentAvatar agent={agent} size="lg"/>
                                    </div>

                                    <div className="min-w-0 flex-1 space-y-1.5">
                                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                                            <h4 className="truncate text-base font-bold text-slate-900">
                                                {agent.name}
                                            </h4>
                                            {agent.professionName && (
                                                <ProfessionBadge professionName={agent.professionName} size="md"/>
                                            )}
                                            {agent.stamina != null && agent.stamina !== '' && (
                                                <StaminaBar stamina={agent.stamina} />
                                            )}
                                            <span className="truncate text-xs font-mono text-slate-400">
                                                {agent.modelDetail?.name || '未绑定模型'}
                                            </span>
                                        </div>

                                        <div className="group/prompt relative">
                                            <p className="line-clamp-1 sm:line-clamp-2 text-xs leading-5 text-slate-600">
                                                {fullRoleText(agent.name, agent.roleProfile || {}, agent.prompt)}
                                            </p>
                                            <div className="pointer-events-none absolute left-0 top-full z-30 mt-1.5 hidden w-80 max-w-[min(80vw,28rem)] rounded-xl border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-600 shadow-xl shadow-slate-900/10 group-hover/prompt:block">
                                                {fullRoleText(agent.name, agent.roleProfile || {}, agent.prompt)}
                                            </div>
                                        </div>

                                        {/* 横向流式能力徽标 */}
                                        <div className="flex flex-wrap items-center gap-2 pt-0.5">
                                            <div className="inline-flex h-6 min-w-0 items-center gap-1 rounded-md border border-blue-100 bg-blue-50/70 px-2 text-[11px] text-blue-700">
                                                <BrainCircuit className="h-3 w-3 shrink-0 text-blue-600"/>
                                                <span className="font-semibold shrink-0">模型</span>
                                                <span className="truncate max-w-[100px]">
                                                    {agent.modelDetail?.type === 'chat' ? 'Chat' : (agent.modelDetail?.type || '未配置')}
                                                </span>
                                            </div>

                                            <div className="group/mcp relative">
                                                <div className="inline-flex h-6 min-w-0 cursor-default items-center gap-1 rounded-md border border-emerald-100 bg-emerald-50/70 px-2 text-[11px] text-emerald-700 transition-colors group-hover/mcp:bg-emerald-100/70">
                                                    <Code2 className="h-3 w-3 shrink-0 text-emerald-600"/>
                                                    <span className="font-semibold shrink-0">MCP</span>
                                                    <span className="truncate">{mcpSummary}</span>
                                                </div>
                                                {mcpNames.length > 0 && (
                                                    <div className="absolute left-0 top-full z-30 mt-1.5 hidden w-56 rounded-xl border border-emerald-100 bg-white p-2 text-xs text-slate-600 shadow-xl shadow-slate-900/10 group-hover/mcp:block">
                                                        <div className="px-2 pb-1.5 font-semibold text-emerald-700">已绑定 MCP ({mcpNames.length})</div>
                                                        <div className="max-h-48 space-y-1 overflow-auto">
                                                            {mcpNames.map(name => (
                                                                <div key={name} className="flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50/70 px-2.5 py-1.5 text-xs text-emerald-800 transition-colors hover:border-emerald-200 hover:bg-emerald-50">
                                                                    <Code2 className="h-3.5 w-3.5 shrink-0 text-emerald-600"/>
                                                                    <span className="truncate">{name}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="group/skill relative">
                                                <div className="inline-flex h-6 min-w-0 cursor-default items-center gap-1 rounded-md border border-orange-100 bg-orange-50/70 px-2 text-[11px] text-orange-700 transition-colors group-hover/skill:bg-orange-100/70">
                                                    <WandSparkles className="h-3 w-3 shrink-0 text-orange-600"/>
                                                    <span className="font-semibold shrink-0">技能</span>
                                                    <span className="truncate">{skillSummary}</span>
                                                </div>
                                                {skillNames.length > 0 && (
                                                    <div className="absolute left-0 top-full z-30 mt-1.5 hidden w-56 rounded-xl border border-orange-100 bg-white p-2 text-xs text-slate-600 shadow-xl shadow-slate-900/10 group-hover/skill:block">
                                                        <div className="px-2 pb-1.5 font-semibold text-orange-700">已绑定技能 ({skillNames.length})</div>
                                                        <div className="max-h-48 space-y-1 overflow-auto">
                                                            {skillNames.map(name => (
                                                                <div key={name} className="flex items-center gap-2 rounded-lg border border-orange-100 bg-orange-50/70 px-2.5 py-1.5 text-xs text-orange-800 transition-colors hover:border-orange-200 hover:bg-orange-50">
                                                                    <WandSparkles className="h-3.5 w-3.5 shrink-0 text-orange-600"/>
                                                                    <span className="truncate">{name}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            <div className={`inline-flex h-6 min-w-0 items-center gap-1 rounded-md border px-2 text-[11px] ${
                                                agent.feishuImEnabled
                                                    ? 'border-sky-100 bg-sky-50/70 text-sky-700'
                                                    : 'border-slate-200 bg-slate-50/60 text-slate-400'
                                            }`}>
                                                <MessageCircle className={`h-3 w-3 shrink-0 ${agent.feishuImEnabled ? 'text-sky-600' : 'text-slate-400'}`}/>
                                                <span className="font-semibold shrink-0">飞书</span>
                                                <span className="truncate">{agent.feishuImEnabled ? '已开启' : '未开启'}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex shrink-0 items-center justify-end gap-1 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100">
                                    <BattleAppearanceEntry agentId={agent.id} appearance={battleAppearance} onClick={()=>setBattleAppearanceTarget(agent)}/>
                                    <button
                                        type="button"
                                        onClick={() => openMemoryModal(agent)}
                                        className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-emerald-50 hover:text-emerald-600"
                                        title="管理记忆"
                                    >
                                        <Database className="h-4 w-4"/>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => openEditModal(agent)}
                                        className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
                                        title="编辑 Agent"
                                    >
                                        <Edit2 className="h-4 w-4"/>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setArchiveTarget(agent)}
                                        className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                                        title="归档 Agent"
                                    >
                                        <Archive className="h-4 w-4"/>
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {archiveOpen && <AgentArchiveDialog agents={archivedAgents} focusId={archiveConflictId} onRestore={onRestore} onClose={() => setArchiveOpen(false)}/>}
            {battleAppearanceTarget&&<BattleAppearanceEditor key={battleAppearanceTarget.id} agent={battleAppearanceTarget} imageModels={getModelsByType('image_generation')} onClose={()=>setBattleAppearanceTarget(null)} onSaved={appearance=>setBattleAppearanceOverrides(current=>({...current,[battleAppearanceTarget.id]:appearance}))}/>}
            {archiveTarget && createPortal(<ConfirmationModal isOpen title={`归档 ${archiveTarget.name}`} description="居民资料、任务绑定和资产保留，可随时恢复。归档后不执行任务，所有在售商品下架并退回背包。" confirmText="归档居民" type="warning" isLoading={archiving} onClose={() => setArchiveTarget(null)} onConfirm={async () => {
                setArchiving(true);
                try {if (await onArchive(archiveTarget.id)) setArchiveTarget(null);} finally {setArchiving(false);}
            }}/>, document.body)}
            {previewTask && <PostPublishPreviewModal key={previewTask.id} task={previewTask} agents={agents} onClose={() => setPreviewTask(null)}/>}
            {taskEditor && <AgentTaskEditor
                key={taskEditor.task?.id || 'new'}
                task={taskEditor.task}
                agents={agents}
                archivedAgents={archivedAgents}
                mcpServers={mcpServers}
                modelOptions={modelOptions}
                imageModels={getModelsByType('image_generation')}
                onSave={onSaveTask}
                onClose={() => setTaskEditor(current => current === taskEditor ? null : current)}
            />}

            {manualLifeTask && <LifeManualRunDialog taskId={manualLifeTask.taskId} agents={agents}
                publishCategoryIds={manualLifeTask.publishCategoryIds} onClose={() => setManualLifeTask(null)}/>}
            {memoryModalAgent && (
                <AgentMemoryModal
                    agent={memoryModalAgent}
                    memorySummary={memorySummary}
                    memorySourceFilter={memorySourceFilter}
                    setMemorySourceFilter={setMemorySourceFilter}
                    onClose={closeMemoryModal}
                    memories={memories}
                    memoryLoading={memoryLoading}
                    memorySaving={memorySaving}
                    memoryError={memoryError}
                    memoryStatusFilter={memoryStatusFilter}
                    setMemoryStatusFilter={setMemoryStatusFilter}
                    memoryForm={memoryForm}
                    setMemoryForm={setMemoryForm}
                    resetMemoryForm={resetMemoryForm}
                    loadAgentMemories={loadAgentMemories}
                    editMemory={editMemory}
                    handleMemorySubmit={handleMemorySubmit}
                    archiveMemory={archiveMemory}
                    memoryTypeOptions={memoryTypeOptions}
                />
            )}

            {modalOpen && createPortal(
                <div data-modal-scroll-lock className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-150">
                    <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">{form.id ? '编辑 Agent' : '创建 Agent'}</h3>
                                <p className="text-xs text-slate-500 mt-1">配置它的身份、模型能力、MCP 和默认技能</p>
                            </div>
                            <button
                                onClick={() => {
                                    clearAvatarPreview();
                                    setModalOpen(false);
                                }}
                                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                            >
                                <X className="w-5 h-5"/>
                            </button>
                        </div>

                        <div className="p-6 space-y-6 max-h-[72vh] overflow-y-auto scrollbar-hide">
                            {archiveConflictId && archivedAgents.find(agent => agent.id === archiveConflictId)?.name === form.name.trim() && <div className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-xs text-orange-700"><p>归档中已存在同名 Agent，可恢复原居民。</p><button type="button" className="mt-2 font-semibold underline" onClick={() => {setModalOpen(false); setArchiveOpen(true);}}>查看归档居民</button></div>}
                            <AgentAvatarField
                                name={form.name || 'Agent'}
                                avatar={form.avatar}
                                previewUrl={avatarPreviewUrl}
                                uploading={avatarUploading}
                                inputRef={avatarInputRef}
                                onUpload={handleAvatarUpload}
                                onRemove={() => {
                                    clearAvatarPreview();
                                    setForm({...form, avatar: ''});
                                }}
                            />

                            <AgentFullBodyImageField
                                value={form.fullBodyImage}
                                onChange={fullBodyImage => setForm(prev => ({...prev, fullBodyImage}))}
                                onUploadingChange={setFullBodyUploading}
                            />
                            <ProfessionSelect value={form.profession} onChange={profession => setForm({...form, profession})}/>
                            <PostInteractionScopeFields supplemental collectionIds={form.postCollectionIds || []} categoryIds={form.postCategoryIds || []}
                                onCollectionsChange={postCollectionIds => setForm({...form, postCollectionIds})} onCategoriesChange={postCategoryIds => setForm({...form, postCategoryIds})}/>

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
                                <SettingsSelect menuPortal={true}
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
                                <AgentRoleEditor key={form.id || 'new-agent'} name={form.name} avatar={form.avatar} modelId={form.model} prompt={form.prompt} roleProfile={form.roleProfile || {}} avatarUploading={avatarUploading} onChange={(roleProfile, prompt) => setForm(prev => ({...prev, roleProfile, prompt}))}/>
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <label className="flex cursor-pointer items-center justify-between gap-4">
                                    <div className="flex min-w-0 items-start gap-3">
                                        <div className="rounded-lg bg-orange-50 p-2 text-orange-600">
                                            <MessageCircle className="h-4 w-4"/>
                                        </div>
                                        <div>
                                            <div className="text-sm font-semibold text-slate-800">飞书 IM 长连接</div>
                                            <div className="mt-1 text-xs leading-5 text-slate-500">一个 Agent 绑定一个飞书应用，通过官方 SDK 长连接接收机器人消息。</div>
                                        </div>
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={form.feishuImEnabled}
                                        onChange={event => setForm({...form, feishuImEnabled: event.target.checked})}
                                        className="peer sr-only"
                                    />
                                    <span className="relative h-6 w-11 shrink-0 rounded-full bg-slate-200 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-orange-500 peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-orange-500/20"></span>
                                </label>

                                {form.feishuImEnabled && (
                                    <div className="mt-4 space-y-4">
                                        <div className="rounded-xl border border-orange-100 bg-white px-3 py-3">
                                            <div className="text-xs font-semibold text-slate-700">订阅方式</div>
                                            <div className="mt-1 text-xs leading-5 text-slate-500">
                                                在飞书开放平台的事件配置中选择“使用长连接接收事件”，并订阅“接收消息”事件。
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                            <div className="space-y-2">
                                                <label className="text-sm font-semibold text-slate-700">App ID</label>
                                                <input
                                                    value={form.feishuAppId}
                                                    onChange={event => setForm({...form, feishuAppId: event.target.value})}
                                                    placeholder="cli_xxxxxxxxx"
                                                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition-all focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm font-semibold text-slate-700">App Secret</label>
                                                <input
                                                    type="password"
                                                    value={form.feishuAppSecret}
                                                    onChange={event => setForm({...form, feishuAppSecret: event.target.value})}
                                                    placeholder="飞书应用凭证"
                                                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition-all focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm font-semibold text-slate-700">Verification Token</label>
                                                <input
                                                    value={form.feishuVerificationToken}
                                                    onChange={event => setForm({...form, feishuVerificationToken: event.target.value})}
                                                    placeholder="可选，兼容回调配置"
                                                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition-all focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm font-semibold text-slate-700">Encrypt Key</label>
                                                <input
                                                    type="password"
                                                    value={form.feishuEncryptKey}
                                                    onChange={event => setForm({...form, feishuEncryptKey: event.target.value})}
                                                    placeholder="可选，不启用加密可留空"
                                                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition-all focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}
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

                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">技能</label>
                                {enabledSkills.length === 0 ? (
                                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-center text-xs text-slate-400">
                                        暂无可选技能，请先到技能设置中导入。
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {enabledSkills.map(skill => {
                                            const active = form.skills.includes(skill.id);
                                            return (
                                                <button
                                                    key={skill.id}
                                                    type="button"
                                                    onClick={() => toggleSkill(skill.id)}
                                                    className={`rounded-xl border px-3 py-3 text-left transition-all ${active ? 'border-orange-200 bg-orange-50 text-orange-700 ring-1 ring-orange-200' : 'border-slate-200 bg-white text-slate-600 hover:border-orange-200 hover:bg-orange-50/40'}`}
                                                >
                                                    <div className="flex items-center justify-between gap-3">
                                                        <span className="truncate text-sm font-semibold">{skill.name}</span>
                                                        {skill.version && (
                                                            <span className="shrink-0 rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-mono text-slate-500">
                                                                v{skill.version}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="mt-1 truncate text-[11px] text-current opacity-70">
                                                        {skill.description || skill.entry || '未填写说明'}
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
                                onClick={() => {
                                    clearAvatarPreview();
                                    setModalOpen(false);
                                }}
                                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={saving || avatarUploading || fullBodyUploading || !form.name.trim()}
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
                </div>,
                document.body,
            )}
        </div>
    );
};
