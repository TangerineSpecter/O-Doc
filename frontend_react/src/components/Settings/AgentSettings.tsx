import {useEffect, useMemo, useRef, useState} from 'react';
import {
    Activity,
    BellRing,
    Bot,
    BrainCircuit,
    CalendarClock,
    ChevronDown,
    CheckCircle2,
    Clock3,
    Code2,
    Database,
    Edit2,
    ImagePlus,
    MessageCircle,
    Play,
    Plus,
    Repeat2,
    Sparkles,
    Trash2,
    Upload,
    Users,
    WandSparkles,
    X,
    XCircle,
} from 'lucide-react';
import {archiveAgentMemory, getAgentMemories, saveAgentMemory} from '@/api/setting';
import type {
    AgentConfig,
    AgentLongTermMemoryConfig,
    AgentMemoryStatus,
    AgentMemoryType,
    AgentRunRecordConfig,
    AgentTaskExecutionMode,
    AgentTaskConfig,
    AgentTaskNotifyPlatform,
    AgentTaskScheduleType,
    AIModel,
    MCPServerConfig,
    ModelType,
    SkillConfig,
} from '@/api/setting';
import {uploadResource} from '@/api/resources';
import {useToast} from '../common/ToastProvider';
import {SettingsSelect, SettingsSelectOption} from './SettingsSelect';

interface AgentSettingsProps {
    agents: AgentConfig[];
    tasks: AgentTaskConfig[];
    runRecords: AgentRunRecordConfig[];
    mcpServers: MCPServerConfig[];
    skills: SkillConfig[];
    getModelsByType: (type: ModelType) => (AIModel & { providerName: string, uniqueId: string })[];
    onSave: (agent: Partial<AgentConfig>) => Promise<boolean>;
    onSaveTask: (task: Partial<AgentTaskConfig>) => Promise<boolean>;
    onRunTaskNow: (taskId: string) => Promise<boolean>;
    onDeleteTask: (taskId: string) => void;
    onDelete: (target: { type: 'agent', agentId: string }) => void;
}

type AgentForm = {
    id?: string;
    name: string;
    avatar: string;
    model: string;
    prompt: string;
    mcpServers: string[];
    skills: string[];
    feishuImEnabled: boolean;
    feishuAppId: string;
    feishuAppSecret: string;
    feishuVerificationToken: string;
    feishuEncryptKey: string;
};

type AgentView = 'list' | 'tasks' | 'records';

type AgentMemoryForm = {
    id?: string;
    memoryType: AgentMemoryType;
    title: string;
    content: string;
    status: AgentMemoryStatus;
    confidence: string;
};

type AgentTaskForm = {
    id?: string;
    name: string;
    agents: string[];
    executionMode: AgentTaskExecutionMode;
    trigger: string;
    schedule: string;
    scheduleType: AgentTaskScheduleType;
    scheduleTime: string;
    scheduleWeekday: string;
    scheduleMonthDay: string;
    intervalMinutes: string;
    enabled: boolean;
    prompt: string;
    notifyEnabled: boolean;
    notifyPlatform: AgentTaskNotifyPlatform;
    notifyWebhookUrl: string;
};

const DEFAULT_PROMPT = '你是一个专注、可靠的文档协作 Agent。请根据用户目标主动拆解任务，保持回答清晰，并在需要时说明你的假设。';

const getAgentAvatar = (agent: Pick<AgentConfig, 'avatar' | 'name'>) => {
    const value = agent.avatar?.trim();
    if (value) return value;
    return agent.name?.trim().slice(0, 1).toUpperCase() || 'A';
};

const isImageAvatar = (avatar: string) => /^https?:\/\//.test(avatar) || avatar.startsWith('/') || avatar.startsWith('blob:') || avatar.startsWith('data:image/');

const AgentAvatar = ({agent, size = 'md'}: { agent: Pick<AgentConfig, 'avatar' | 'name'>, size?: 'sm' | 'md' | 'lg' | 'xl' }) => {
    const avatar = getAgentAvatar(agent);
    const sizeClass = {
        sm: 'w-9 h-9 text-sm rounded-lg',
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

export const AgentSettings = ({
                                  agents,
                                  tasks,
                                  runRecords,
                                  mcpServers,
                                  skills,
                                  getModelsByType,
                                  onSave,
                                  onSaveTask,
                                  onRunTaskNow,
                                  onDeleteTask,
                                  onDelete,
                              }: AgentSettingsProps) => {
    const [activeView, setActiveView] = useState<AgentView>('list');
    const [modalOpen, setModalOpen] = useState(false);
    const [taskModalOpen, setTaskModalOpen] = useState(false);
    const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
    const [expandedAgentRuns, setExpandedAgentRuns] = useState<Record<string, boolean>>({});
    const [, setElapsedTick] = useState(0);
    const [saving, setSaving] = useState(false);
    const [runningTaskId, setRunningTaskId] = useState<string | null>(null);
    const [avatarUploading, setAvatarUploading] = useState(false);
    const [avatarPreviewUrl, setAvatarPreviewUrl] = useState('');
    const [memoryModalAgent, setMemoryModalAgent] = useState<AgentConfig | null>(null);
    const [memories, setMemories] = useState<AgentLongTermMemoryConfig[]>([]);
    const [memoryLoading, setMemoryLoading] = useState(false);
    const [memorySaving, setMemorySaving] = useState(false);
    const [memoryError, setMemoryError] = useState('');
    const [memoryStatusFilter, setMemoryStatusFilter] = useState<'all' | AgentMemoryStatus>('active');
    const avatarInputRef = useRef<HTMLInputElement>(null);
    const avatarPreviewObjectUrlRef = useRef<string | null>(null);
    const toast = useToast();
    const [form, setForm] = useState<AgentForm>({
        name: '',
        avatar: '',
        model: '',
        prompt: DEFAULT_PROMPT,
        mcpServers: [],
        skills: [],
        feishuImEnabled: false,
        feishuAppId: '',
        feishuAppSecret: '',
        feishuVerificationToken: '',
        feishuEncryptKey: '',
    });
    const getDefaultAgentId = () => agents[0]?.id || '';
    const [taskForm, setTaskForm] = useState<AgentTaskForm>({
        name: '',
        agents: getDefaultAgentId() ? [getDefaultAgentId()] : [],
        executionMode: 'parallel',
        trigger: '定时任务',
        schedule: '每天 09:00',
        scheduleType: 'daily',
        scheduleTime: '09:00',
        scheduleWeekday: '1',
        scheduleMonthDay: '1',
        intervalMinutes: '60',
        enabled: true,
        prompt: '',
        notifyEnabled: false,
        notifyPlatform: 'feishu',
        notifyWebhookUrl: '',
    });
    const [memoryForm, setMemoryForm] = useState<AgentMemoryForm>({
        memoryType: 'preference',
        title: '',
        content: '',
        status: 'active',
        confidence: '0.8',
    });

    const modelOptions = useMemo<SettingsSelectOption<string>[]>(() => {
        return getModelsByType('chat').map(model => ({
            value: model.id,
            label: `${model.providerName} / ${model.name}`,
            description: model.name,
        }));
    }, [getModelsByType]);

    const selectedModel = modelOptions.find(model => model.value === form.model);
    const taskAgentOptions = useMemo<SettingsSelectOption<string>[]>(() => {
        return agents.map(agent => ({value: agent.id, label: agent.name}));
    }, [agents]);
    const executionModeOptions: SettingsSelectOption<AgentTaskExecutionMode>[] = [
        {value: 'parallel', label: '并行执行', description: '多个 Agent 同时执行，适合独立产出和快速对比'},
        {value: 'serial', label: '串行执行', description: '按选择顺序执行，后一个 Agent 会参考前一个结果'},
    ];
    const taskTriggerOptions: SettingsSelectOption<string>[] = [
        {value: '定时任务', label: '定时任务'},
        {value: '手动执行', label: '手动执行'},
        {value: '编辑器触发', label: '编辑器触发'},
        {value: 'Memos 触发', label: 'Memos 触发'},
    ];
    const notifyPlatformOptions: SettingsSelectOption<AgentTaskNotifyPlatform>[] = [
        {value: 'feishu', label: '飞书机器人', description: '通过飞书自定义机器人 Webhook 发送文本消息'},
    ];
    const memoryTypeOptions: SettingsSelectOption<AgentMemoryType>[] = [
        {value: 'preference', label: '偏好'},
        {value: 'fact', label: '事实'},
        {value: 'project', label: '项目'},
        {value: 'instruction', label: '指令'},
        {value: 'other', label: '其他'},
    ];
    const scheduleTypeOptions: SettingsSelectOption<AgentTaskScheduleType>[] = [
        {value: 'daily', label: '每天'},
        {value: 'weekly', label: '每周'},
        {value: 'monthly', label: '每月'},
        {value: 'interval', label: '间隔'},
    ];
    const weekdayOptions: SettingsSelectOption<string>[] = [
        {value: '1', label: '周一'},
        {value: '2', label: '周二'},
        {value: '3', label: '周三'},
        {value: '4', label: '周四'},
        {value: '5', label: '周五'},
        {value: '6', label: '周六'},
        {value: '0', label: '周日'},
    ];
    const monthDayOptions: SettingsSelectOption<string>[] = Array.from({length: 31}, (_, index) => {
        const value = String(index + 1);
        return {value, label: `${value} 日`};
    });
    const clearAvatarPreview = () => {
        if (avatarPreviewObjectUrlRef.current) {
            URL.revokeObjectURL(avatarPreviewObjectUrlRef.current);
            avatarPreviewObjectUrlRef.current = null;
        }
        setAvatarPreviewUrl('');
    };

    const setLocalAvatarPreview = (url: string) => {
        clearAvatarPreview();
        avatarPreviewObjectUrlRef.current = url;
        setAvatarPreviewUrl(url);
    };

    useEffect(() => {
        return () => {
            if (avatarPreviewObjectUrlRef.current) {
                URL.revokeObjectURL(avatarPreviewObjectUrlRef.current);
            }
        };
    }, []);

    const buildTaskSchedule = (task: Pick<AgentTaskForm, 'scheduleType' | 'scheduleTime' | 'scheduleWeekday' | 'scheduleMonthDay' | 'intervalMinutes'>) => {
        if (task.scheduleType === 'daily') {
            return `每天 ${task.scheduleTime}`;
        }
        if (task.scheduleType === 'weekly') {
            const weekday = weekdayOptions.find(option => option.value === task.scheduleWeekday)?.label || '周一';
            return `每${weekday} ${task.scheduleTime}`;
        }
        if (task.scheduleType === 'monthly') {
            return `每月 ${task.scheduleMonthDay} 日 ${task.scheduleTime}`;
        }
        return `每 ${task.intervalMinutes || '1'} 分钟`;
    };

    const isManualTask = taskForm.trigger === '手动执行';

    const openCreateModal = () => {
        clearAvatarPreview();
        setForm({
            name: '',
            avatar: '',
            model: modelOptions[0]?.value || '',
            prompt: DEFAULT_PROMPT,
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

    const openCreateTaskModal = () => {
        const defaultAgentId = taskAgentOptions[0]?.value || getDefaultAgentId();
        setTaskForm({
            name: '',
            agents: defaultAgentId ? [defaultAgentId] : [],
            executionMode: 'parallel',
            trigger: '定时任务',
            schedule: '每天 09:00',
            scheduleType: 'daily',
            scheduleTime: '09:00',
            scheduleWeekday: '1',
            scheduleMonthDay: '1',
            intervalMinutes: '60',
            enabled: true,
            prompt: '',
            notifyEnabled: false,
            notifyPlatform: 'feishu',
            notifyWebhookUrl: '',
        });
        setTaskModalOpen(true);
    };

    const openEditTaskModal = (task: AgentTaskConfig) => {
        const taskAgentIds = task.agents?.length ? task.agents : (task.agent ? [task.agent] : []);
        setTaskForm({
            id: task.id,
            name: task.name,
            agents: taskAgentIds,
            executionMode: task.executionMode || 'parallel',
            trigger: task.trigger,
            schedule: task.schedule,
            enabled: task.enabled,
            prompt: task.prompt || '',
            scheduleType: task.scheduleType || 'daily',
            scheduleTime: task.scheduleTime || '09:00',
            scheduleWeekday: task.scheduleWeekday || '1',
            scheduleMonthDay: task.scheduleMonthDay || '1',
            intervalMinutes: String(task.intervalMinutes || 60),
            notifyEnabled: task.notifyEnabled ?? false,
            notifyPlatform: task.notifyPlatform || 'feishu',
            notifyWebhookUrl: task.notifyWebhookUrl || '',
        });
        setTaskModalOpen(true);
    };

    const openEditModal = (agent: AgentConfig) => {
        clearAvatarPreview();
        setForm({
            id: agent.id,
            name: agent.name,
            avatar: agent.avatar || '',
            model: agent.model || '',
            prompt: agent.prompt || '',
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

    const resetMemoryForm = () => {
        setMemoryForm({
            memoryType: 'preference',
            title: '',
            content: '',
            status: 'active',
            confidence: '0.8',
        });
    };

    const loadAgentMemories = async (agent: AgentConfig) => {
        setMemoryLoading(true);
        setMemoryError('');
        try {
            const data = await getAgentMemories(agent.id);
            setMemories(data || []);
        } catch (error) {
            console.error('加载 Agent 记忆失败:', error);
            setMemoryError('加载失败，请重试');
            toast.error('加载 Agent 记忆失败');
        } finally {
            setMemoryLoading(false);
        }
    };

    const openMemoryModal = async (agent: AgentConfig) => {
        setMemoryModalAgent(agent);
        setMemoryStatusFilter('active');
        resetMemoryForm();
        await loadAgentMemories(agent);
    };

    const editMemory = (memory: AgentLongTermMemoryConfig) => {
        setMemoryForm({
            id: memory.id,
            memoryType: memory.memoryType || 'other',
            title: memory.title || '',
            content: memory.content || '',
            status: memory.status || 'active',
            confidence: String(memory.confidence ?? 0.8),
        });
    };

    const handleMemorySubmit = async () => {
        if (!memoryModalAgent) return;
        if (!memoryForm.content.trim()) {
            toast.warning('请填写记忆内容');
            return;
        }

        setMemorySaving(true);
        try {
            const parsedConfidence = parseFloat(memoryForm.confidence);
            const confidence = Number.isFinite(parsedConfidence)
                ? Math.min(1, Math.max(0, parsedConfidence))
                : 0.8;
            await saveAgentMemory(memoryModalAgent.id, {
                id: memoryForm.id,
                memoryType: memoryForm.memoryType,
                title: memoryForm.title.trim(),
                content: memoryForm.content.trim(),
                status: memoryForm.status,
                confidence,
            });
            toast.success(memoryForm.id ? '记忆已更新' : '记忆已添加');
            resetMemoryForm();
            await loadAgentMemories(memoryModalAgent);
        } catch (error) {
            console.error('保存 Agent 记忆失败:', error);
            toast.error('保存 Agent 记忆失败');
        } finally {
            setMemorySaving(false);
        }
    };

    const archiveMemory = async (memory: AgentLongTermMemoryConfig) => {
        if (!memoryModalAgent) return;
        setMemorySaving(true);
        try {
            await archiveAgentMemory(memoryModalAgent.id, memory.id);
            toast.success('记忆已归档');
            if (memoryForm.id === memory.id) resetMemoryForm();
            await loadAgentMemories(memoryModalAgent);
        } catch (error) {
            console.error('归档 Agent 记忆失败:', error);
            toast.error('归档 Agent 记忆失败');
        } finally {
            setMemorySaving(false);
        }
    };

    useEffect(() => {
        if (!modalOpen || form.model || modelOptions.length === 0) return;
        setForm(prev => ({...prev, model: modelOptions[0].value}));
    }, [modalOpen, form.model, modelOptions]);

    const handleSubmit = async () => {
        if (!form.name.trim()) return;
        if (form.feishuImEnabled && (!form.feishuAppId.trim() || !form.feishuAppSecret.trim())) {
            toast.warning('请填写飞书 App ID 和 App Secret');
            return;
        }

        setSaving(true);
        const success = await onSave({
            id: form.id,
            name: form.name.trim(),
            avatar: form.avatar.trim(),
            model: form.model || null,
            prompt: form.prompt.trim(),
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

    const handleTaskSubmit = async () => {
        if (!taskForm.name.trim() || !taskForm.prompt.trim()) {
            toast.warning('请填写任务名称和任务目标');
            return;
        }
        if (taskForm.agents.length === 0) {
            toast.warning('请至少选择一个 Agent');
            return;
        }
        if (!isManualTask && taskForm.scheduleType === 'interval' && (!taskForm.intervalMinutes || Number(taskForm.intervalMinutes) < 1)) {
            toast.warning('请填写大于 0 的间隔分钟数');
            return;
        }
        if (taskForm.notifyEnabled && !taskForm.notifyWebhookUrl.trim()) {
            toast.warning('请填写通知 Webhook 地址');
            return;
        }

        const success = await onSaveTask({
            id: taskForm.id,
            name: taskForm.name.trim(),
            agent: taskForm.agents[0],
            agents: taskForm.agents,
            executionMode: taskForm.executionMode,
            trigger: taskForm.trigger,
            schedule: isManualTask ? '手动执行' : buildTaskSchedule(taskForm),
            scheduleType: taskForm.scheduleType,
            scheduleTime: taskForm.scheduleTime,
            scheduleWeekday: taskForm.scheduleWeekday,
            scheduleMonthDay: taskForm.scheduleMonthDay,
            intervalMinutes: Number(taskForm.intervalMinutes || 60),
            enabled: taskForm.enabled,
            prompt: taskForm.prompt.trim(),
            notifyEnabled: taskForm.notifyEnabled,
            notifyPlatform: taskForm.notifyPlatform,
            notifyWebhookUrl: taskForm.notifyEnabled ? taskForm.notifyWebhookUrl.trim() : '',
        });
        if (success) setTaskModalOpen(false);
    };

    const toggleTaskEnabled = (taskId: string) => {
        const task = tasks.find(item => item.id === taskId);
        if (!task) return;
        onSaveTask({...task, enabled: !task.enabled});
    };

    const deleteTask = (taskId: string) => {
        onDeleteTask(taskId);
    };

    const runTaskNow = async (taskId: string) => {
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
    const selectedRecord = selectedRecordId ? runRecords.find(record => record.id === selectedRecordId) : null;
    const selectedRecordAgentRuns = selectedRecord?.agentRuns?.length ? selectedRecord.agentRuns : [];
    const getAgentById = (agentId: string) => agents.find(agent => agent.id === agentId);
    const getTaskAgentIds = (task: AgentTaskConfig) => task.agents?.length ? task.agents : (task.agent ? [task.agent] : []);
    const getTaskAgentNames = (task: AgentTaskConfig) => {
        if (task.agentNames?.length) return task.agentNames;
        const agentIds = getTaskAgentIds(task);
        const names = agentIds.map(agentId => agents.find(agent => agent.id === agentId)?.name).filter(Boolean) as string[];
        return names.length ? names : [task.agentName].filter(Boolean);
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
    const getAgentRunAvatar = (agentRun: {agent: string; agentName: string; agentAvatar?: string}) => {
        const currentAgent = getAgentById(agentRun.agent);
        return {
            name: agentRun.agentName || currentAgent?.name || 'Agent',
            avatar: agentRun.agentAvatar || currentAgent?.avatar || '',
        };
    };
    const toggleTaskAgent = (agentId: string) => {
        setTaskForm(prev => {
            const selected = new Set(prev.agents);
            if (selected.has(agentId)) {
                selected.delete(agentId);
            } else {
                selected.add(agentId);
            }
            return {...prev, agents: Array.from(selected)};
        });
    };
    const toggleAgentRunExpanded = (agentId: string) => {
        setExpandedAgentRuns(prev => ({...prev, [agentId]: !prev[agentId]}));
    };

    useEffect(() => {
        if (!runRecords.some(record => record.status === 'running')) return;
        const timer = window.setInterval(() => setElapsedTick(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [runRecords]);

    const parseRecordTime = (value?: string) => {
        if (!value) return null;
        const parsed = new Date(value.replace(' ', 'T'));
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    };

    const formatElapsedDuration = (seconds: number) => {
        const safeSeconds = Math.max(0, Math.floor(seconds));
        if (safeSeconds < 60) return `${safeSeconds}s`;
        const minutes = Math.floor(safeSeconds / 60);
        const rest = safeSeconds % 60;
        if (minutes < 60) return `${minutes}m ${rest}s`;
        const hours = Math.floor(minutes / 60);
        return `${hours}h ${minutes % 60}m`;
    };

    const getRecordDuration = (record: AgentRunRecordConfig) => {
        if (record.status !== 'running') return record.duration || '-';
        const startedAt = parseRecordTime(record.startedAt);
        if (!startedAt) return record.duration || '0s';
        return formatElapsedDuration((Date.now() - startedAt.getTime()) / 1000);
    };

    const getRecordTriggerLabel = (trigger: string) => {
        if (trigger === 'manual') return '手动执行';
        if (trigger === 'scheduler') return '定时任务';
        if (trigger === 'manual-preflight') return '手动预检';
        if (trigger === 'manual-pull') return '手动拉取';
        return trigger || '未知';
    };

    const getRecordStatusMeta = (status: AgentRunRecordConfig['status']) => {
        if (status === 'success') {
            return {
                label: '成功',
                icon: <CheckCircle2 className="h-3.5 w-3.5"/>,
                className: 'bg-emerald-50 text-emerald-700 border-emerald-100',
            };
        }

        if (status === 'failed') {
            return {
                label: '失败',
                icon: <XCircle className="h-3.5 w-3.5"/>,
                className: 'bg-red-50 text-red-700 border-red-100',
            };
        }

        return {
            label: '执行中',
            icon: <Clock3 className="h-3.5 w-3.5"/>,
            className: 'bg-blue-50 text-blue-700 border-blue-100',
        };
    };

    const getRecordStepMeta = (status?: string) => {
        if (status === 'success') return 'border-emerald-100 bg-emerald-50 text-emerald-700';
        if (status === 'failed') return 'border-red-100 bg-red-50 text-red-700';
        if (status === 'running') return 'border-blue-100 bg-blue-50 text-blue-700';
        return 'border-slate-200 bg-slate-50 text-slate-600';
    };

    const getMemoryTypeLabel = (type: AgentMemoryType) => {
        return memoryTypeOptions.find(option => option.value === type)?.label || '其他';
    };

    const visibleMemories = memories.filter(memory => {
        if (memoryStatusFilter === 'all') return true;
        return memory.status === memoryStatusFilter;
    });

    const handleAvatarUpload = async (file?: File) => {
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            toast.warning('请选择图片文件作为头像');
            return;
        }

        setAvatarUploading(true);
        const localPreviewUrl = URL.createObjectURL(file);
        try {
            const response = await uploadResource(file, 'image');
            setForm(prev => ({...prev, avatar: `/api/resource/view/${response.id}`}));
            setLocalAvatarPreview(localPreviewUrl);
            toast.success('头像已上传');
        } catch (error) {
            URL.revokeObjectURL(localPreviewUrl);
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
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-orange-50 text-orange-600 rounded-lg">
                            <Bot className="w-5 h-5"/>
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-800">Agent 管理</h3>
                            <p className="text-xs text-slate-500 mt-1">创建多个不同职责的 Agent，并分别绑定模型、提示词、MCP、技能和 IM 通道。</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                        <div className="flex rounded-lg bg-slate-100 p-1">
                            <button
                                onClick={() => setActiveView('list')}
                                className={`min-w-20 whitespace-nowrap px-3 py-1.5 text-xs font-medium rounded-md transition-all ${activeView === 'list' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Agent 列表
                            </button>
                            <button
                                onClick={() => setActiveView('tasks')}
                                className={`min-w-20 whitespace-nowrap px-3 py-1.5 text-xs font-medium rounded-md transition-all ${activeView === 'tasks' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                任务分配
                            </button>
                            <button
                                onClick={() => setActiveView('records')}
                                className={`min-w-20 whitespace-nowrap px-3 py-1.5 text-xs font-medium rounded-md transition-all ${activeView === 'records' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                执行记录
                            </button>
                        </div>
                        {activeView === 'list' && (
                            <button
                                onClick={openCreateModal}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white rounded-lg text-xs font-medium transition-all shadow-sm shadow-orange-500/20"
                            >
                                <Plus className="w-3.5 h-3.5"/>
                                创建 Agent
                            </button>
                        )}
                        {activeView === 'tasks' && (
                            <button
                                onClick={openCreateTaskModal}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white rounded-lg text-xs font-medium transition-all shadow-sm shadow-orange-500/20"
                            >
                                <Plus className="w-3.5 h-3.5"/>
                                新建任务
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {activeView === 'tasks' ? (
                <div className="space-y-3">
                    {tasks.length === 0 ? (
                        <div className="text-center py-14 bg-white rounded-2xl border border-dashed border-slate-200 text-slate-400">
                            <CalendarClock className="w-8 h-8 mx-auto mb-3 text-slate-300"/>
                            <p className="text-sm">暂无任务，创建一个定时或手动触发的 Agent 任务。</p>
                        </div>
                    ) : tasks.map(task => {
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
            ) : activeView === 'records' ? (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="grid grid-cols-[1.05fr_0.75fr_0.7fr_0.75fr_0.55fr_0.45fr] gap-4 border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-500">
                        <span>任务 / 摘要</span>
                        <span>Agent</span>
                        <span>触发方式</span>
                        <span>状态</span>
                        <span className="text-right">耗时</span>
                        <span></span>
                    </div>
                    <div className="divide-y divide-slate-100">
                        {runRecords.map(record => {
                            const statusMeta = getRecordStatusMeta(record.status);
                            const recordAgentNames = record.agentRuns?.length
                                ? record.agentRuns.map(agentRun => agentRun.agentName).filter(Boolean)
                                : [record.agentName].filter(Boolean);
                            return (
                                <div key={record.id} className="grid grid-cols-1 gap-3 px-4 py-4 text-sm transition-colors hover:bg-orange-50/30 md:grid-cols-[1.05fr_0.75fr_0.7fr_0.75fr_0.55fr_0.45fr] md:items-center md:gap-4">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 text-xs text-slate-400">
                                            <Activity className="h-3.5 w-3.5"/>
                                            {record.startedAt}
                                        </div>
                                        <p className="mt-1 truncate font-semibold text-slate-800">执行「{record.taskName}」任务</p>
                                        <p className="mt-0.5 truncate text-xs text-slate-500">{record.summary}</p>
                                    </div>
                                    {renderAgentSummary(recordAgentNames)}
                                    <span className="truncate text-slate-500">{getRecordTriggerLabel(record.trigger)}</span>
                                    <span className={`inline-flex w-fit items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-medium ${statusMeta.className}`}>
                                        {statusMeta.icon}
                                        {statusMeta.label}
                                    </span>
                                    <span className="text-left font-mono text-xs text-slate-500 md:text-right">{getRecordDuration(record)}</span>
                                    <button
                                        onClick={() => setSelectedRecordId(record.id)}
                                        className="text-left text-xs font-medium text-orange-600 hover:text-orange-700 md:text-right"
                                    >
                                        详情
                                    </button>
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
                                    <div className="group/skill relative">
                                        <div className="flex h-8 min-w-0 items-center gap-1.5 rounded-lg border border-orange-100 bg-orange-50 px-2.5 text-xs text-orange-700">
                                            <WandSparkles className="h-3.5 w-3.5 shrink-0 text-orange-600"/>
                                            <span className="shrink-0 font-semibold">技能</span>
                                            <span className="truncate">{skillSummary}</span>
                                        </div>
                                        {skillNames.length > 0 && (
                                            <div className="absolute right-0 top-full z-30 mt-2 hidden w-56 rounded-xl border border-orange-100 bg-white p-2 text-xs text-slate-600 shadow-xl shadow-slate-900/10 group-hover/skill:block">
                                                <div className="px-2 pb-1.5 font-semibold text-orange-700">已绑定技能</div>
                                                <div className="max-h-48 space-y-1 overflow-auto">
                                                    {skillNames.map(name => (
                                                        <div key={name} className="flex items-center gap-2 rounded-lg border border-orange-100 bg-orange-50/70 px-2.5 py-2 text-orange-800 transition-colors hover:border-orange-200 hover:bg-orange-50">
                                                            <WandSparkles className="h-3.5 w-3.5 shrink-0 text-orange-600"/>
                                                            <span className="truncate">{name}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <div className={`flex h-8 min-w-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs ${agent.feishuImEnabled ? 'border-sky-100 bg-sky-50 text-sky-700' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
                                        <MessageCircle className={`h-3.5 w-3.5 shrink-0 ${agent.feishuImEnabled ? 'text-sky-600' : 'text-slate-400'}`}/>
                                        <span className="shrink-0 font-semibold">飞书</span>
                                        <span className="truncate">{agent.feishuImEnabled ? 'IM 已开启' : '未开启'}</span>
                                    </div>
                                </div>

                                <div className="flex items-center justify-end gap-1 sm:w-9 sm:flex-col sm:justify-center">
                                    <button
                                        onClick={() => openMemoryModal(agent)}
                                        className="p-2 text-slate-400 transition-colors hover:bg-emerald-50 hover:text-emerald-600 rounded-lg"
                                        title="管理记忆"
                                    >
                                        <Database className="w-4 h-4"/>
                                    </button>
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

            {selectedRecord && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm animate-in fade-in duration-150">
                    <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl animate-in zoom-in-95 duration-150">
                        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="truncate text-lg font-bold text-slate-900">执行「{selectedRecord.taskName}」任务</h3>
                                    <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-medium ${getRecordStatusMeta(selectedRecord.status).className}`}>
                                        {getRecordStatusMeta(selectedRecord.status).icon}
                                        {getRecordStatusMeta(selectedRecord.status).label}
                                    </span>
                                </div>
                                <p className="mt-1 text-xs text-slate-500">
                                    {selectedRecord.startedAt} · {getRecordTriggerLabel(selectedRecord.trigger)} · 耗时 {getRecordDuration(selectedRecord)}
                                </p>
                            </div>
                            <button
                                onClick={() => setSelectedRecordId(null)}
                                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                            >
                                <X className="h-5 w-5"/>
                            </button>
                        </div>

                        <div className="max-h-[70vh] space-y-5 overflow-y-auto p-6">
                            <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm sm:grid-cols-3">
                                <div>
                                    <div className="text-xs font-medium text-slate-400">Agent</div>
                                    <div className="mt-1">
                                        {selectedRecordAgentRuns.length > 0
                                            ? renderAgentSummary(selectedRecordAgentRuns.map(agentRun => agentRun.agentName).filter(Boolean), 'font-semibold')
                                            : renderAgentSummary([selectedRecord.agentName].filter(Boolean), 'font-semibold')}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-xs font-medium text-slate-400">触发方式</div>
                                    <div className="mt-1 truncate font-semibold text-slate-700">{getRecordTriggerLabel(selectedRecord.trigger)}</div>
                                </div>
                                <div>
                                    <div className="text-xs font-medium text-slate-400">执行摘要</div>
                                    <div className="mt-1 truncate font-semibold text-slate-700">{selectedRecord.summary || '-'}</div>
                                </div>
                            </div>

                            {selectedRecord.output && (
                                <div>
                                    <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800">
                                        <Sparkles className="h-4 w-4 text-orange-500"/>
                                        生成结果
                                    </div>
                                    <div className="max-h-80 overflow-y-auto rounded-xl border border-orange-100 bg-orange-50/30 px-4 py-3 text-sm leading-6 text-slate-700">
                                        <div className="whitespace-pre-wrap break-words">{selectedRecord.output}</div>
                                    </div>
                                </div>
                            )}

                            <div>
                                <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800">
                                    <Activity className="h-4 w-4 text-orange-500"/>
                                    执行流程
                                </div>
                                {selectedRecordAgentRuns.length > 0 ? (
                                    <div className="space-y-3">
                                        {selectedRecordAgentRuns.map(agentRun => {
                                            const expanded = expandedAgentRuns[agentRun.agent] ?? true;
                                            const statusMeta = getRecordStatusMeta(agentRun.status);
                                            const agentAvatar = getAgentRunAvatar(agentRun);
                                            return (
                                                <div key={agentRun.agent} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                                                    <button
                                                        onClick={() => toggleAgentRunExpanded(agentRun.agent)}
                                                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-orange-50/40"
                                                    >
                                                        <div className="min-w-0 flex items-center gap-3">
                                                            <AgentAvatar agent={agentAvatar} size="sm"/>
                                                            <div className="min-w-0">
                                                                <div className="truncate text-sm font-bold text-slate-800">{agentAvatar.name}</div>
                                                                <div className="mt-0.5 truncate text-xs text-slate-500">{agentRun.summary || '暂无摘要'}</div>
                                                            </div>
                                                        </div>
                                                        <div className="flex shrink-0 items-center gap-2">
                                                            <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-medium ${statusMeta.className}`}>
                                                                {statusMeta.icon}
                                                                {statusMeta.label}
                                                            </span>
                                                            <span className="hidden font-mono text-[11px] text-slate-400 sm:inline">{agentRun.duration || '-'}</span>
                                                            <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}/>
                                                        </div>
                                                    </button>
                                                    {expanded && (
                                                        <div className="space-y-3 border-t border-slate-100 bg-slate-50/50 px-4 py-4">
                                                            {agentRun.steps && agentRun.steps.length > 0 ? agentRun.steps.map((step, index) => (
                                                                <div key={`${agentRun.agent}-${step.time}-${index}`} className="relative pl-7">
                                                                    {index < (agentRun.steps?.length || 0) - 1 && (
                                                                        <span className="absolute left-[0.45rem] top-6 h-full w-px bg-slate-200"/>
                                                                    )}
                                                                    <span className={`absolute left-0 top-1 h-3.5 w-3.5 rounded-full border-2 ${getRecordStepMeta(step.status)}`}/>
                                                                    <div className="rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
                                                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                                                            <div className="font-semibold text-slate-800">{step.title}</div>
                                                                            <div className="font-mono text-[11px] text-slate-400">{step.time}</div>
                                                                        </div>
                                                                        {step.detail && (
                                                                            <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-500">{step.detail}</p>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            )) : (
                                                                <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-xs text-slate-400">
                                                                    这个 Agent 暂无阶段明细。
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : selectedRecord.steps && selectedRecord.steps.length > 0 ? (
                                    <div className="space-y-3">
                                        {selectedRecord.steps.map((step, index) => (
                                            <div key={`${step.time}-${index}`} className="relative pl-7">
                                                {index < (selectedRecord.steps?.length || 0) - 1 && (
                                                    <span className="absolute left-[0.45rem] top-6 h-full w-px bg-slate-200"/>
                                                )}
                                                <span className={`absolute left-0 top-1 h-3.5 w-3.5 rounded-full border-2 ${getRecordStepMeta(step.status)}`}/>
                                                <div className="rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
                                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                                        <div className="font-semibold text-slate-800">{step.title}</div>
                                                        <div className="font-mono text-[11px] text-slate-400">{step.time}</div>
                                                    </div>
                                                    {step.detail && (
                                                        <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-500">{step.detail}</p>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-xs text-slate-400">
                                        这条记录没有阶段明细，新的执行记录会自动保存流程。
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {taskModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-150">
                    <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl animate-in zoom-in-95 duration-150">
                        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">{taskForm.id ? '编辑任务' : '新建任务'}</h3>
                                <p className="mt-1 text-xs text-slate-500">配置 Agent 在什么时机执行什么任务，以及输出到哪里</p>
                            </div>
                            <button
                                onClick={() => setTaskModalOpen(false)}
                                className="p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 rounded-lg"
                            >
                                <X className="w-5 h-5"/>
                            </button>
                        </div>

                        <div className="max-h-[72vh] space-y-5 overflow-y-auto p-6">
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">任务名称</label>
                                <input
                                    value={taskForm.name}
                                    onChange={event => setTaskForm({...taskForm, name: event.target.value})}
                                    placeholder="如：每日科技文章写作"
                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm"
                                />
                            </div>

                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">执行 Agent</label>
                                    <div className="max-h-40 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-2">
                                        {agents.length === 0 ? (
                                            <div className="px-3 py-6 text-center text-xs text-slate-400">暂无可选 Agent</div>
                                        ) : agents.map(agent => {
                                            const selected = taskForm.agents.includes(agent.id);
                                            return (
                                                <button
                                                    key={agent.id}
                                                    type="button"
                                                    onClick={() => toggleTaskAgent(agent.id)}
                                                    className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${selected ? 'border-orange-200 bg-orange-50 text-orange-700' : 'border-slate-100 bg-white text-slate-600 hover:border-orange-100 hover:bg-orange-50/50'}`}
                                                >
                                                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${selected ? 'border-orange-500 bg-orange-500' : 'border-slate-300 bg-white'}`}>
                                                        {selected && <CheckCircle2 className="h-3 w-3 text-white"/>}
                                                    </span>
                                                    <span className="truncate font-medium">{agent.name}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">执行模式</label>
                                    <SettingsSelect
                                        value={taskForm.executionMode}
                                        options={executionModeOptions}
                                        onChange={executionMode => setTaskForm({...taskForm, executionMode})}
                                        buttonClassName="bg-slate-50"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">触发方式</label>
                                    <SettingsSelect
                                        value={taskForm.trigger}
                                        options={taskTriggerOptions}
                                        onChange={trigger => setTaskForm({...taskForm, trigger})}
                                        buttonClassName="bg-slate-50"
                                        showSelectedDescription={false}
                                    />
                                </div>
                            </div>

                            {!isManualTask && (
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-slate-700">执行周期</label>
                                        <SettingsSelect
                                            value={taskForm.scheduleType}
                                            options={scheduleTypeOptions}
                                            onChange={scheduleType => setTaskForm({...taskForm, scheduleType})}
                                            buttonClassName="bg-slate-50"
                                            showSelectedDescription={false}
                                        />
                                    </div>

                                    {taskForm.scheduleType !== 'interval' && (
                                        <div className="space-y-2">
                                            <label className="text-sm font-semibold text-slate-700">执行时间</label>
                                            <input
                                                type="time"
                                                value={taskForm.scheduleTime}
                                                onChange={event => setTaskForm({...taskForm, scheduleTime: event.target.value})}
                                                className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 transition-all focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                                            />
                                        </div>
                                    )}

                                    {taskForm.scheduleType === 'weekly' && (
                                        <div className="space-y-2">
                                            <label className="text-sm font-semibold text-slate-700">执行星期</label>
                                            <SettingsSelect
                                                value={taskForm.scheduleWeekday}
                                                options={weekdayOptions}
                                                onChange={scheduleWeekday => setTaskForm({...taskForm, scheduleWeekday})}
                                                buttonClassName="bg-slate-50"
                                                showSelectedDescription={false}
                                            />
                                        </div>
                                    )}

                                    {taskForm.scheduleType === 'monthly' && (
                                        <div className="space-y-2">
                                            <label className="text-sm font-semibold text-slate-700">执行日期</label>
                                            <SettingsSelect
                                                value={taskForm.scheduleMonthDay}
                                                options={monthDayOptions}
                                                onChange={scheduleMonthDay => setTaskForm({...taskForm, scheduleMonthDay})}
                                                buttonClassName="bg-slate-50"
                                                showSelectedDescription={false}
                                            />
                                        </div>
                                    )}

                                    {taskForm.scheduleType === 'interval' && (
                                        <div className="space-y-2">
                                            <label className="text-sm font-semibold text-slate-700">间隔分钟</label>
                                            <input
                                                type="number"
                                                min="1"
                                                step="1"
                                                value={taskForm.intervalMinutes}
                                                onChange={event => setTaskForm({...taskForm, intervalMinutes: event.target.value})}
                                                placeholder="如：30"
                                                className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 transition-all focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                                            />
                                        </div>
                                    )}

                                    {taskForm.scheduleType === 'interval' && (
                                        <p className="self-end pb-2 text-xs text-slate-500 sm:col-span-2">从最近一次执行时间开始按固定间隔计算。</p>
                                    )}
                                </div>
                            )}

                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                                <label className="flex cursor-pointer items-center justify-between gap-4">
                                    <div className="flex items-start gap-3">
                                        <div className="mt-0.5 rounded-lg bg-white p-2 text-violet-600 shadow-sm ring-1 ring-slate-100">
                                            <BellRing className="h-4 w-4"/>
                                        </div>
                                        <div>
                                            <div className="text-sm font-semibold text-slate-700">任务完成通知</div>
                                            <div className="mt-0.5 text-xs text-slate-500">仅通知当前任务，消息内容包含任务名称</div>
                                        </div>
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={taskForm.notifyEnabled}
                                        onChange={event => setTaskForm({...taskForm, notifyEnabled: event.target.checked})}
                                        className="peer sr-only"
                                    />
                                    <span className="relative h-6 w-11 shrink-0 rounded-full bg-slate-200 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-violet-500 peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-violet-500/20"></span>
                                </label>

                                {taskForm.notifyEnabled && (
                                    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[12rem_1fr]">
                                        <div className="space-y-2">
                                            <label className="text-sm font-semibold text-slate-700">通知平台</label>
                                            <SettingsSelect
                                                value={taskForm.notifyPlatform}
                                                options={notifyPlatformOptions}
                                                onChange={notifyPlatform => setTaskForm({...taskForm, notifyPlatform})}
                                                buttonClassName="bg-white"
                                                showSelectedDescription={false}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-semibold text-slate-700">Webhook 地址</label>
                                            <input
                                                value={taskForm.notifyWebhookUrl}
                                                onChange={event => setTaskForm({...taskForm, notifyWebhookUrl: event.target.value})}
                                                placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..."
                                                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 transition-all focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

	                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">任务提示词</label>
                                <textarea
                                    value={taskForm.prompt}
                                    onChange={event => setTaskForm({...taskForm, prompt: event.target.value})}
                                    rows={5}
                                    placeholder="写清楚这个任务要做什么、参考哪些来源、输出格式和注意事项"
                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm leading-6 resize-y"
                                />
                            </div>

                            <label className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                                <div>
                                    <div className="text-sm font-semibold text-slate-700">启用任务</div>
                                    <div className="mt-0.5 text-xs text-slate-500">关闭后任务会保留，但不会自动执行</div>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={taskForm.enabled}
                                    onChange={event => setTaskForm({...taskForm, enabled: event.target.checked})}
                                    className="peer sr-only"
                                />
                                <span className="relative h-6 w-11 rounded-full bg-slate-200 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-orange-500 peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-orange-500/20"></span>
                            </label>
                        </div>

                        <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
                            <button
                                onClick={() => setTaskModalOpen(false)}
                                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleTaskSubmit}
                                className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-orange-600 active:bg-orange-700"
                            >
                                <Sparkles className="w-4 h-4"/>
                                保存任务
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {memoryModalAgent && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm animate-in fade-in duration-150">
                    <div className="w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl animate-in zoom-in-95 duration-150">
                        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <Database className="h-5 w-5 text-emerald-600"/>
                                    <h3 className="truncate text-lg font-bold text-slate-900">「{memoryModalAgent.name}」记忆</h3>
                                </div>
                                <p className="mt-1 text-xs text-slate-500">长期记忆会在相关对话中被召回，也可以手动维护。</p>
                            </div>
                            <button
                                onClick={() => setMemoryModalAgent(null)}
                                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                            >
                                <X className="h-5 w-5"/>
                            </button>
                        </div>

                        <div className="grid max-h-[76vh] grid-cols-1 overflow-y-auto lg:grid-cols-[1.15fr_0.85fr]">
                            <div className="border-b border-slate-100 p-5 lg:border-b-0 lg:border-r">
                                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                    <div className="flex rounded-lg bg-slate-100 p-1">
                                        {[
                                            {value: 'active', label: '有效'},
                                            {value: 'archived', label: '已归档'},
                                            {value: 'all', label: '全部'},
                                        ].map(option => (
                                            <button
                                                key={option.value}
                                                type="button"
                                                onClick={() => setMemoryStatusFilter(option.value as 'all' | AgentMemoryStatus)}
                                                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${memoryStatusFilter === option.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                            >
                                                {option.label}
                                            </button>
                                        ))}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={resetMemoryForm}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-emerald-100 hover:bg-emerald-50 hover:text-emerald-700"
                                    >
                                        <Plus className="h-3.5 w-3.5"/>
                                        新增
                                    </button>
                                </div>

                                {memoryLoading ? (
                                    <div className="flex h-44 items-center justify-center text-xs text-slate-400">
                                        <span className="mr-2 h-4 w-4 rounded-full border-2 border-emerald-100 border-t-emerald-500 animate-spin"/>
                                        加载记忆中
                                    </div>
                                ) : memoryError ? (
                                    <div className="flex h-44 flex-col items-center justify-center rounded-xl border border-dashed border-red-200 bg-red-50 px-4 text-center text-xs text-red-500">
                                        <p>{memoryError}</p>
                                        <button
                                            type="button"
                                            onClick={() => memoryModalAgent && loadAgentMemories(memoryModalAgent)}
                                            className="mt-3 rounded-lg bg-white px-3 py-1.5 font-medium text-red-600 ring-1 ring-red-100 transition-colors hover:bg-red-100"
                                        >
                                            重试
                                        </button>
                                    </div>
                                ) : visibleMemories.length === 0 ? (
                                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-12 text-center text-xs text-slate-400">
                                        暂无长期记忆
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {visibleMemories.map(memory => (
                                            <div
                                                key={memory.id}
                                                className={`rounded-xl border p-3 transition-colors ${memoryForm.id === memory.id ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white hover:border-emerald-100 hover:bg-emerald-50/40'}`}
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <button
                                                        type="button"
                                                        onClick={() => editMemory(memory)}
                                                        className="min-w-0 flex-1 text-left"
                                                    >
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <span className="rounded-md bg-white/80 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
                                                                {getMemoryTypeLabel(memory.memoryType)}
                                                            </span>
                                                            <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${memory.status === 'active' ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-100' : 'bg-slate-100 text-slate-500 ring-1 ring-slate-200'}`}>
                                                                {memory.status === 'active' ? '有效' : '已归档'}
                                                            </span>
                                                        </div>
                                                        <div className="mt-2 truncate text-sm font-semibold text-slate-800">{memory.title || '未命名记忆'}</div>
                                                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{memory.content}</p>
                                                        <div className="mt-2 text-[11px] text-slate-400">
                                                            置信度 {Number(memory.confidence || 0).toFixed(2)} · 来源 {memory.sourceCount || 0}
                                                        </div>
                                                    </button>
                                                    {memory.status !== 'archived' && (
                                                        <button
                                                            type="button"
                                                            onClick={() => archiveMemory(memory)}
                                                            disabled={memorySaving}
                                                            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                                                            title="归档记忆"
                                                        >
                                                            <Trash2 className="h-4 w-4"/>
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="space-y-4 bg-slate-50 p-5">
                                <div>
                                    <h4 className="text-sm font-bold text-slate-800">{memoryForm.id ? '编辑记忆' : '新增记忆'}</h4>
                                    <p className="mt-1 text-xs text-slate-500">建议只保存稳定偏好、长期事实、项目背景和明确指令。</p>
                                </div>

                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-slate-700">类型</label>
                                        <SettingsSelect
                                            value={memoryForm.memoryType}
                                            options={memoryTypeOptions}
                                            onChange={memoryType => setMemoryForm({...memoryForm, memoryType})}
                                            buttonClassName="bg-white"
                                            showSelectedDescription={false}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-slate-700">状态</label>
                                        <SettingsSelect
                                            value={memoryForm.status}
                                            options={[
                                                {value: 'active', label: '有效'},
                                                {value: 'archived', label: '已归档'},
                                            ]}
                                            onChange={status => setMemoryForm({...memoryForm, status})}
                                            buttonClassName="bg-white"
                                            showSelectedDescription={false}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">标题</label>
                                    <input
                                        value={memoryForm.title}
                                        onChange={event => setMemoryForm({...memoryForm, title: event.target.value})}
                                        placeholder="如：回答风格偏好"
                                        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 transition-all focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">内容</label>
                                    <textarea
                                        value={memoryForm.content}
                                        onChange={event => setMemoryForm({...memoryForm, content: event.target.value})}
                                        rows={8}
                                        placeholder="记录这条长期记忆的具体内容"
                                        className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-700 transition-all focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">置信度</label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="1"
                                        step="0.05"
                                        value={memoryForm.confidence}
                                        onChange={event => setMemoryForm({...memoryForm, confidence: event.target.value})}
                                        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 transition-all focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                                    />
                                </div>

                                <div className="flex justify-end gap-2 pt-2">
                                    {memoryForm.id && (
                                        <button
                                            type="button"
                                            onClick={resetMemoryForm}
                                            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
                                        >
                                            取消编辑
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={handleMemorySubmit}
                                        disabled={memorySaving || !memoryForm.content.trim()}
                                        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {memorySaving ? (
                                            <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin"/>
                                        ) : (
                                            <Sparkles className="h-4 w-4"/>
                                        )}
                                        保存记忆
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-150">
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

                        <div className="p-6 space-y-6 max-h-[72vh] overflow-y-auto">
                            <div className="flex flex-col items-center text-center">
                                <AgentAvatar agent={{name: form.name || 'Agent', avatar: avatarPreviewUrl || form.avatar}} size="xl"/>
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
                                            onClick={() => {
                                                clearAvatarPreview();
                                                setForm({...form, avatar: ''});
                                            }}
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
