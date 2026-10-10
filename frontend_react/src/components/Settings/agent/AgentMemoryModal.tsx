import { useMemo } from 'react';
import {
    Database,
    X,
    Plus,
    Trash2,
    Sparkles,
    RotateCcw,
    FileText,
} from 'lucide-react';
import type {
    AgentConfig,
    AgentLongTermMemoryConfig,
    AgentMemoryStatus,
    AgentMemoryType,
} from '@/api/setting';
import { SettingsSelect, SettingsSelectOption } from '../SettingsSelect';
import type { AgentMemoryForm } from './useAgentMemories';

export interface AgentMemoryModalProps {
    agent: AgentConfig;
    onClose: () => void;
    memories: AgentLongTermMemoryConfig[];
    memoryLoading: boolean;
    memorySaving: boolean;
    memoryError: string;
    memoryStatusFilter: 'all' | AgentMemoryStatus;
    setMemoryStatusFilter: (filter: 'all' | AgentMemoryStatus) => void;
    memoryForm: AgentMemoryForm;
    setMemoryForm: React.Dispatch<React.SetStateAction<AgentMemoryForm>>;
    resetMemoryForm: () => void;
    loadAgentMemories: (agent: AgentConfig) => void;
    editMemory: (memory: AgentLongTermMemoryConfig) => void;
    handleMemorySubmit: () => void;
    archiveMemory: (memory: AgentLongTermMemoryConfig) => void;
    memoryTypeOptions: SettingsSelectOption<AgentMemoryType>[];
}

const memoryTypeMeta: Record<AgentMemoryType, { label: string; badge: string }> = {
    preference: { label: '偏好', badge: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200/80' },
    fact: { label: '事实', badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/80' },
    project: { label: '项目', badge: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200/80' },
    instruction: { label: '指令', badge: 'bg-purple-50 text-purple-700 ring-1 ring-purple-200/80' },
    other: { label: '其他', badge: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200' },
};

const statusOptions: SettingsSelectOption<AgentMemoryStatus>[] = [
    { value: 'active', label: '有效' },
    { value: 'archived', label: '已归档' },
];

export function AgentMemoryModal({
    agent,
    onClose,
    memories,
    memoryLoading,
    memorySaving,
    memoryError,
    memoryStatusFilter,
    setMemoryStatusFilter,
    memoryForm,
    setMemoryForm,
    resetMemoryForm,
    loadAgentMemories,
    editMemory,
    handleMemorySubmit,
    archiveMemory,
    memoryTypeOptions,
}: AgentMemoryModalProps) {
    const activeCount = useMemo(
        () => memories.filter(m => m.status === 'active').length,
        [memories]
    );

    const visibleMemories = useMemo(() => {
        if (memoryStatusFilter === 'all') return memories;
        return memories.filter(memory => memory.status === memoryStatusFilter);
    }, [memories, memoryStatusFilter]);

    return (
        <div data-modal-scroll-lock
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm animate-in fade-in duration-150"
            role="dialog"
            aria-modal="true"
            aria-labelledby="agent-memory-modal-title"
        >
            <div className="flex h-[600px] max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl animate-in zoom-in-95 duration-150">
                {/* 顶部 Header */}
                <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-3.5 bg-white">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-100 bg-emerald-50 text-emerald-600 shadow-sm">
                            <Database className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2.5">
                                <h3 id="agent-memory-modal-title" className="truncate text-base font-bold text-slate-900">
                                    「{agent.name}」长期记忆
                                </h3>
                                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                                    共 {memories.length} 条 · {activeCount} 条有效
                                </span>
                            </div>
                            <p className="mt-0.5 truncate text-xs text-slate-500">
                                长期记忆会在相关对话与自主活动中被语义召回，用于保持角色认知一致。
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="关闭记忆窗口"
                        className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* 内容主体：左右双栏，外层严禁出现滚动条 */}
                <div className="grid flex-1 min-h-0 grid-cols-1 grid-rows-[minmax(0,1fr)_minmax(0,2fr)] overflow-hidden divide-y divide-slate-100 lg:grid-cols-[1.12fr_0.88fr] lg:grid-rows-[minmax(0,1fr)] lg:divide-y-0 lg:divide-x">
                    {/* 左侧：记忆列表区域 */}
                    <div className="flex min-h-0 flex-col bg-white p-5">
                        {/* 过滤条与新增按钮（置顶固定） */}
                        <div className="mb-3.5 flex shrink-0 items-center justify-between gap-3">
                            <div className="flex rounded-lg bg-slate-100 p-0.5">
                                {[
                                    { value: 'active', label: '有效' },
                                    { value: 'archived', label: '已归档' },
                                    { value: 'all', label: '全部' },
                                ].map(option => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        onClick={() => setMemoryStatusFilter(option.value as 'all' | AgentMemoryStatus)}
                                        className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
                                            memoryStatusFilter === option.value
                                                ? 'bg-white text-slate-900 shadow-sm'
                                                : 'text-slate-500 hover:text-slate-700'
                                        }`}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                            <button
                                type="button"
                                onClick={resetMemoryForm}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-all hover:bg-emerald-100/80 active:scale-95"
                            >
                                <Plus className="h-3.5 w-3.5" />
                                新增记忆
                            </button>
                        </div>

                        {/* 列表局部独立滚动区，带 scrollbar-hide */}
                        <div className="flex-1 min-h-0 space-y-2.5 overflow-y-auto pr-1 scrollbar-hide">
                            {memoryLoading ? (
                                <div className="flex h-56 flex-col items-center justify-center text-xs text-slate-400">
                                    <span className="mb-2 h-5 w-5 rounded-full border-2 border-emerald-100 border-t-emerald-500 animate-spin" />
                                    加载记忆列表中...
                                </div>
                            ) : memoryError ? (
                                <div className="flex h-56 flex-col items-center justify-center rounded-xl border border-dashed border-red-200 bg-red-50/60 px-4 text-center text-xs text-red-500">
                                    <p>{memoryError}</p>
                                    <button
                                        type="button"
                                        onClick={() => loadAgentMemories(agent)}
                                        className="mt-3 inline-flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 font-medium text-red-600 ring-1 ring-red-100 transition-colors hover:bg-red-50"
                                    >
                                        <RotateCcw className="h-3 w-3" />
                                        重试
                                    </button>
                                </div>
                            ) : visibleMemories.length === 0 ? (
                                <div className="flex h-56 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 text-center text-xs text-slate-400">
                                    <FileText className="mb-2 h-8 w-8 text-slate-300 stroke-[1.5]" />
                                    <p>暂无符合筛选条件的长期记忆</p>
                                    <button
                                        type="button"
                                        onClick={resetMemoryForm}
                                        className="mt-2 text-xs font-medium text-emerald-600 hover:text-emerald-700"
                                    >
                                        立即创建第一条记忆
                                    </button>
                                </div>
                            ) : (
                                visibleMemories.map(memory => {
                                    const typeInfo = memoryTypeMeta[memory.memoryType] || memoryTypeMeta.other;
                                    const isSelected = memoryForm.id === memory.id;

                                    return (
                                        <div
                                            key={memory.id}
                                            onClick={() => editMemory(memory)}
                                            className={`group relative cursor-pointer rounded-xl border p-3.5 transition-all ${
                                                isSelected
                                                    ? 'border-emerald-300 bg-emerald-50/60 shadow-sm ring-1 ring-emerald-400/30'
                                                    : 'border-slate-200/90 bg-white hover:border-emerald-200 hover:bg-emerald-50/20 hover:shadow-sm'
                                            }`}
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                        <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${typeInfo.badge}`}>
                                                            {typeInfo.label}
                                                        </span>
                                                        <span
                                                            className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${
                                                                memory.status === 'active'
                                                                    ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-100'
                                                                    : 'bg-slate-100 text-slate-500 ring-1 ring-slate-200'
                                                            }`}
                                                        >
                                                            {memory.status === 'active' ? '有效' : '已归档'}
                                                        </span>
                                                    </div>
                                                    <div className="mt-2 truncate text-sm font-semibold text-slate-800">
                                                        {memory.title || '未命名记忆'}
                                                    </div>
                                                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">
                                                        {memory.content}
                                                    </p>
                                                    <div className="mt-2.5 flex items-center gap-3 text-[11px] text-slate-400">
                                                        <span>置信度 <strong className="font-mono font-medium text-slate-600">{Number(memory.confidence || 0).toFixed(2)}</strong></span>
                                                        <span>·</span>
                                                        <span>来源 <strong className="font-mono font-medium text-slate-600">{memory.sourceCount || 0}</strong></span>
                                                    </div>
                                                </div>

                                                {memory.status !== 'archived' && (
                                                    <button
                                                        type="button"
                                                        onClick={event => {
                                                            event.stopPropagation();
                                                            archiveMemory(memory);
                                                        }}
                                                        disabled={memorySaving}
                                                        className="opacity-0 group-hover:opacity-100 rounded-lg p-1.5 text-slate-400 transition-all hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                                                        title="归档记忆"
                                                        aria-label="归档记忆"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* 表单独立滚动，短视口和窄屏下仍保留底部保存操作。 */}
                    <div className="flex min-h-0 flex-col justify-between overflow-hidden bg-slate-50/70 p-5">
                        <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto scrollbar-hide">
                            {/* 表单 Header */}
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className={`h-2 w-2 rounded-full ${memoryForm.id ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                                        <h4 className="text-sm font-bold text-slate-800">
                                            {memoryForm.id ? '编辑长期记忆' : '录入新记忆'}
                                        </h4>
                                    </div>
                                    <p className="mt-1 text-xs text-slate-500">
                                        建议保存长期偏好、关键事实、业务背景与明确指令。
                                    </p>
                                </div>
                                {memoryForm.id && (
                                    <button
                                        type="button"
                                        onClick={resetMemoryForm}
                                        className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 shadow-2xs hover:bg-slate-50 hover:text-emerald-600 transition-colors"
                                    >
                                        切换为新增
                                    </button>
                                )}
                            </div>

                            {/* 行1：类型 + 状态 并排 */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-slate-700">类型</label>
                                    <SettingsSelect
                                        value={memoryForm.memoryType}
                                        options={memoryTypeOptions}
                                        onChange={memoryType => setMemoryForm(prev => ({ ...prev, memoryType }))}
                                        buttonClassName="bg-white h-9 text-xs"
                                        showSelectedDescription={false}
                                        menuPortal={true}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-slate-700">状态</label>
                                    <SettingsSelect
                                        value={memoryForm.status}
                                        options={statusOptions}
                                        onChange={status => setMemoryForm(prev => ({ ...prev, status }))}
                                        buttonClassName="bg-white h-9 text-xs"
                                        showSelectedDescription={false}
                                        menuPortal={true}
                                    />
                                </div>
                            </div>

                            {/* 行2：标题（主宽） + 置信度（紧凑） 并排 */}
                            <div className="grid grid-cols-[1fr_105px] gap-3">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-slate-700">标题</label>
                                    <input
                                        value={memoryForm.title}
                                        onChange={event => setMemoryForm(prev => ({ ...prev, title: event.target.value }))}
                                        placeholder="如：回答风格偏好 / 所在城市"
                                        className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 transition-all focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-slate-700">置信度 (0~1)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="1"
                                        step="0.05"
                                        value={memoryForm.confidence}
                                        onChange={event => setMemoryForm(prev => ({ ...prev, confidence: event.target.value }))}
                                        className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-mono text-slate-700 transition-all focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                                    />
                                </div>
                            </div>

                            {/* 行3：内容多行文本框（严格 resize-none，杜绝拉伸柄） */}
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-semibold text-slate-700">内容</label>
                                    <span className="text-[11px] text-slate-400">必填</span>
                                </div>
                                <textarea
                                    value={memoryForm.content}
                                    onChange={event => setMemoryForm(prev => ({ ...prev, content: event.target.value }))}
                                    rows={5}
                                    placeholder="记录这条长期记忆的具体事实内容、业务背景或明确指令..."
                                    className="w-full resize-none rounded-xl border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-700 transition-all focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                                />
                            </div>
                        </div>

                        {/* 行4：底部操作栏 */}
                        <div className="mt-3 flex shrink-0 items-center justify-between border-t border-slate-200/70 pt-3">
                            <span className="text-[11px] text-slate-400">
                                {memoryForm.id ? '编辑已选记忆项' : '将持久保存至向量记忆库'}
                            </span>
                            <div className="flex items-center gap-2">
                                {memoryForm.id && (
                                    <button
                                        type="button"
                                        onClick={resetMemoryForm}
                                        className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200/60"
                                    >
                                        取消编辑
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={handleMemorySubmit}
                                    disabled={memorySaving || !memoryForm.content.trim()}
                                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-emerald-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {memorySaving ? (
                                        <span className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                                    ) : (
                                        <Sparkles className="h-3.5 w-3.5" />
                                    )}
                                    {memoryForm.id ? '更新记忆' : '保存记忆'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default AgentMemoryModal;
