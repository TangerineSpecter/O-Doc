// frontend_react/src/components/AIChatWindow/ChatSettingsToolbar.tsx

import { useEffect, useRef } from 'react';
import { Plug, ChevronDown, Check, BookOpen, WandSparkles, BrainCircuit } from 'lucide-react';
import { Select } from '../common/Select';
import { type SkillConfig } from '../../api/setting';
import { type AssistantMode } from './types';
import { type SelectOption } from '../common/Select';

interface ChatSettingsToolbarProps {
    assistantMode: AssistantMode;
    selectedMcpIds: string[];
    mcpOptions: { id: string; name: string; description: string; source: string }[];
    mcpPanelOpen: boolean;
    setMcpPanelOpen: (open: boolean) => void;
    setModeWithSideEffects: (mode: AssistantMode) => void;
    toggleMcp: (id: string) => void;
    useKb: boolean;
    setUseKb: (use: boolean | ((prev: boolean) => boolean)) => void;
    selectedCollId: string;
    setSelectedCollId: (id: string) => void;
    anthologyOptions: SelectOption<string>[];
    chatSkills: SkillConfig[];
    selectedSkillIds: string[];
    toggleChatSkill: (id: string) => void;
    skillPanelOpen: boolean;
    setSkillPanelOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
    useThinking: boolean;
    setUseThinking: (use: boolean) => void;
}

export const ChatSettingsToolbar = ({
    assistantMode,
    selectedMcpIds,
    mcpOptions,
    mcpPanelOpen,
    setMcpPanelOpen,
    setModeWithSideEffects,
    toggleMcp,
    useKb,
    setUseKb,
    selectedCollId,
    setSelectedCollId,
    anthologyOptions,
    chatSkills,
    selectedSkillIds,
    toggleChatSkill,
    skillPanelOpen,
    setSkillPanelOpen,
    useThinking,
    setUseThinking,
}: ChatSettingsToolbarProps) => {
    const mcpPanelRef = useRef<HTMLDivElement>(null);
    const skillPanelRef = useRef<HTMLDivElement>(null);

    // 点击 MCP 面板外部关闭
    useEffect(() => {
        if (!mcpPanelOpen) return;
        const closeOnOutside = (event: MouseEvent) => {
            if (!mcpPanelRef.current?.contains(event.target as Node)) {
                setMcpPanelOpen(false);
            }
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setMcpPanelOpen(false);
        };
        document.addEventListener('mousedown', closeOnOutside);
        document.addEventListener('keydown', closeOnEscape);
        return () => {
            document.removeEventListener('mousedown', closeOnOutside);
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, [mcpPanelOpen, setMcpPanelOpen]);

    // 点击技能面板外部关闭
    useEffect(() => {
        if (!skillPanelOpen) return;
        const closeOnOutside = (event: MouseEvent) => {
            if (!skillPanelRef.current?.contains(event.target as Node)) {
                setSkillPanelOpen(false);
            }
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setSkillPanelOpen(false);
        };
        document.addEventListener('mousedown', closeOnOutside);
        document.addEventListener('keydown', closeOnEscape);
        return () => {
            document.removeEventListener('mousedown', closeOnOutside);
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, [skillPanelOpen, setSkillPanelOpen]);
    return (
        <div className="flex items-center justify-between mb-3 px-1">
            <div className="flex flex-wrap items-center gap-2">
                {/* MCP 模式选择 */}
                <div ref={mcpPanelRef} className="relative">
                    <button
                        type="button"
                        onClick={() => setMcpPanelOpen(!mcpPanelOpen)}
                        className={`flex h-10 items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition-all ${
                            assistantMode === 'manual' && selectedMcpIds.length > 0
                                ? 'border-orange-200 bg-orange-50 text-orange-700 ring-1 ring-orange-100'
                                : assistantMode === 'auto'
                                    ? 'border-orange-200 bg-orange-50 text-orange-700 ring-1 ring-orange-100'
                                    : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100'
                        }`}
                    >
                        <Plug className="h-3.5 w-3.5" />
                        {assistantMode === 'disabled'
                            ? 'MCP：已禁用'
                            : assistantMode === 'auto'
                                ? 'MCP：自动'
                                : `MCP：${selectedMcpIds.length} 个`}
                        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${mcpPanelOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {mcpPanelOpen && (
                        <div className="absolute bottom-full left-0 z-[130] mb-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10">
                            <div className="border-b border-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">
                                MCP 模式
                            </div>
                            <div className="p-2">
                                {([
                                    { value: 'disabled', label: '禁用', description: '不装载 MCP' },
                                    { value: 'manual', label: '手动', description: '手动选择一个或多个 MCP' },
                                    { value: 'auto', label: '自动', description: '从全部 MCP 中自动选择' },
                                ] as const).map(option => {
                                    const active = assistantMode === option.value;
                                    return (
                                        <button
                                            key={option.value}
                                            type="button"
                                            onClick={() => setModeWithSideEffects(option.value)}
                                            className={`mb-1 flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-all last:mb-0 ${
                                                active
                                                    ? 'bg-orange-50 text-orange-700 ring-1 ring-orange-100'
                                                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                            }`}
                                        >
                                            <span>
                                                <span className="block text-sm font-semibold">{option.label}</span>
                                                <span className="mt-0.5 block text-[11px] opacity-70">{option.description}</span>
                                            </span>
                                            {active && <Check className="h-4 w-4 shrink-0" />}
                                        </button>
                                    );
                                })}
                            </div>
                            {assistantMode === 'manual' && (
                                <>
                                    <div className="border-t border-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">
                                        MCP 能力
                                    </div>
                                    <div className="max-h-72 overflow-y-auto p-2 pt-0">
                                        {mcpOptions.map(option => {
                                            const active = selectedMcpIds.includes(option.id);
                                            return (
                                                <button
                                                    key={option.id}
                                                    type="button"
                                                    onClick={() => toggleMcp(option.id)}
                                                    className={`mb-1 flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left transition-all last:mb-0 ${
                                                        active
                                                            ? 'border-orange-200 bg-orange-50 text-orange-700'
                                                            : 'border-slate-100 bg-white text-slate-600 hover:border-orange-100 hover:bg-orange-50/50'
                                                    }`}
                                                >
                                                    <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                                                        active ? 'border-orange-500 bg-orange-500 text-white' : 'border-slate-300 bg-white'
                                                    }`}>
                                                        {active && <Check className="h-3 w-3" />}
                                                    </span>
                                                    <span className="min-w-0">
                                                        <span className="flex items-center gap-2">
                                                            <span className="truncate text-sm font-semibold">{option.name}</span>
                                                            {option.source === 'system' && (
                                                                <span className="shrink-0 rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] text-orange-600">
                                                                    内置
                                                                </span>
                                                            )}
                                                        </span>
                                                        <span className="mt-0.5 line-clamp-2 text-[11px] leading-4 opacity-70">
                                                            {option.description || '未填写说明'}
                                                        </span>
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* 技能装载 */}
                <div ref={skillPanelRef} className="relative">
                    <button
                        type="button"
                        onClick={() => setSkillPanelOpen(prev => !prev)}
                        disabled={chatSkills.length === 0}
                        className={`flex h-10 items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition-all ${
                            selectedSkillIds.length > 0
                                ? 'bg-orange-50 text-orange-700 border-orange-200 shadow-sm ring-1 ring-orange-100'
                                : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed'
                        }`}
                    >
                        <WandSparkles className="w-3.5 h-3.5" />
                        {selectedSkillIds.length > 0 ? `技能：${selectedSkillIds.length} 个已装载` : '装载技能'}
                    </button>
                    {skillPanelOpen && chatSkills.length > 0 && (
                        <div className="absolute bottom-full left-0 z-[130] mb-2 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10">
                            <div className="border-b border-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">
                                AI 对话技能
                            </div>
                            <div className="max-h-64 overflow-y-auto p-2">
                                {chatSkills.map(skill => {
                                    const active = selectedSkillIds.includes(skill.id);
                                    return (
                                        <button
                                            key={skill.id}
                                            type="button"
                                            onClick={() => toggleChatSkill(skill.id)}
                                            className={`mb-1 w-full rounded-lg border px-3 py-2 text-left transition-all last:mb-0 ${
                                                active
                                                    ? 'border-orange-200 bg-orange-50 text-orange-700'
                                                    : 'border-slate-100 bg-white text-slate-600 hover:border-orange-100 hover:bg-orange-50/50'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="truncate text-sm font-semibold">{skill.name}</span>
                                                {skill.version && (
                                                    <span className="shrink-0 rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-mono text-slate-500">
                                                        v{skill.version}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 opacity-70">
                                                {skill.description || '未填写说明'}
                                            </p>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* 思考模式 */}
                <button
                    type="button"
                    onClick={() => setUseThinking(!useThinking)}
                    className={`flex h-10 items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition-all ${
                        useThinking
                            ? 'bg-amber-50 text-amber-700 border-amber-200 shadow-sm ring-1 ring-amber-100'
                            : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                    }`}
                >
                    <BrainCircuit className="w-3.5 h-3.5" />
                    {useThinking ? '思考模式：已开启' : '思考模式：未开启'}
                </button>

                {/* 知识库模式 */}
                <button
                    type="button"
                    onClick={() => setUseKb(prev => !prev)}
                    className={`flex h-10 items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition-all ${
                        useKb
                            ? 'bg-blue-50 text-blue-600 border-blue-200 shadow-sm ring-1 ring-blue-100'
                            : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                    }`}
                >
                    <BookOpen className="w-3.5 h-3.5" />
                    {useKb ? '知识库模式：已开启' : '知识库模式：未开启'}
                </button>
                {useKb && (
                    <Select
                        value={selectedCollId}
                        options={anthologyOptions}
                        onChange={setSelectedCollId}
                        placeholder="全部文集"
                        emptyMessage="暂无文章文集"
                        accentClassName="bg-blue-50 text-blue-700"
                        showSelectedDescription={false}
                        buttonClassName="!h-10 !min-h-10 w-[156px] rounded-xl border-blue-200 px-3 !py-0 text-xs font-semibold shadow-none hover:border-blue-300 focus:border-blue-400 focus:ring-blue-100"
                        menuClassName="bottom-full right-0 !mt-0 mb-2 w-64 max-h-[min(320px,45vh)] overflow-y-auto z-[120]"
                    />
                )}
            </div>
            <span className="text-[11px] text-slate-300 font-mono flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Model: Auto
            </span>
        </div>
    );
};
