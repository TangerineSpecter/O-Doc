// frontend_react/src/components/AIChatWindow/ChatSettingsToolbar.tsx

import { useEffect, useRef, useState } from 'react';
import { Plug, ChevronDown, Check, BookOpen, WandSparkles, BrainCircuit, X } from 'lucide-react';
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
    const [mobileKbOpen, setMobileKbOpen] = useState(false);

    const selectedAnthology = anthologyOptions.find(opt => opt.value === selectedCollId);

    // 点击 MCP 面板外部关闭（桌面端）
    useEffect(() => {
        if (!mcpPanelOpen) return;
        const closeOnOutside = (event: MouseEvent) => {
            if (!mcpPanelRef.current?.contains(event.target as Node)) {
                // 仅在桌面端通过全局点击外部关闭，移动端由遮罩层控制
                if (window.innerWidth >= 640) {
                    setMcpPanelOpen(false);
                }
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

    // 点击技能面板外部关闭（桌面端）
    useEffect(() => {
        if (!skillPanelOpen) return;
        const closeOnOutside = (event: MouseEvent) => {
            if (!skillPanelRef.current?.contains(event.target as Node)) {
                if (window.innerWidth >= 640) {
                    setSkillPanelOpen(false);
                }
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

    // 渲染 MCP 配置内容（模式 + 插件列表）
    const renderMcpContent = () => (
        <>
            <div className="p-2">
                <div className="mb-1.5 px-1 text-xs font-semibold text-slate-500">
                    选择工作模式
                </div>
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
                            className={`mb-1 flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition-all last:mb-0 ${
                                active
                                    ? 'bg-orange-50 text-orange-700 ring-1 ring-orange-200'
                                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                            }`}
                        >
                            <span>
                                <span className="block text-sm font-semibold">{option.label}</span>
                                <span className="mt-0.5 block text-[11px] opacity-70">{option.description}</span>
                            </span>
                            {active && <Check className="h-4 w-4 shrink-0 text-orange-600" />}
                        </button>
                    );
                })}
            </div>
            {assistantMode === 'manual' && (
                <div className="border-t border-slate-100 p-2 pt-2.5">
                    <div className="mb-2 flex items-center justify-between px-1">
                        <span className="text-xs font-semibold text-slate-500">MCP 能力列表</span>
                        <span className="text-[11px] text-slate-400">可多选</span>
                    </div>
                    {mcpOptions.length === 0 ? (
                        <div className="py-4 text-center text-xs text-slate-400">暂无可用的 MCP 插件</div>
                    ) : (
                        <div className="max-h-60 sm:max-h-72 overflow-y-auto space-y-1.5">
                            {mcpOptions.map(option => {
                                const active = selectedMcpIds.includes(option.id);
                                return (
                                    <button
                                        key={option.id}
                                        type="button"
                                        onClick={() => toggleMcp(option.id)}
                                        className={`flex w-full items-start gap-2.5 rounded-xl border p-2.5 text-left transition-all ${
                                            active
                                                ? 'border-orange-200 bg-orange-50/70 text-orange-700'
                                                : 'border-slate-100 bg-white text-slate-600 hover:border-orange-100 hover:bg-orange-50/30'
                                        }`}
                                    >
                                        <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                                            active ? 'border-orange-500 bg-orange-500 text-white' : 'border-slate-300 bg-white'
                                        }`}>
                                            {active && <Check className="h-3 w-3" />}
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="flex items-center gap-1.5">
                                                <span className="truncate text-xs sm:text-sm font-semibold">{option.name}</span>
                                                {option.source === 'system' && (
                                                    <span className="shrink-0 rounded-full bg-orange-100 px-1.5 py-0.2 text-[10px] text-orange-600 font-medium">
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
                    )}
                </div>
            )}
        </>
    );

    // 渲染技能装载内容
    const renderSkillContent = () => (
        <div className="p-2">
            <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-xs font-semibold text-slate-500">AI 对话技能</span>
                <span className="text-[11px] text-slate-400">轻触勾选装载</span>
            </div>
            {chatSkills.length === 0 ? (
                <div className="py-4 text-center text-xs text-slate-400">暂无可用技能</div>
            ) : (
                <div className="max-h-60 sm:max-h-64 overflow-y-auto space-y-1.5">
                    {chatSkills.map(skill => {
                        const active = selectedSkillIds.includes(skill.id);
                        return (
                            <button
                                key={skill.id}
                                type="button"
                                onClick={() => toggleChatSkill(skill.id)}
                                className={`w-full rounded-xl border p-2.5 text-left transition-all ${
                                    active
                                        ? 'border-orange-200 bg-orange-50/70 text-orange-700'
                                        : 'border-slate-100 bg-white text-slate-600 hover:border-orange-100 hover:bg-orange-50/30'
                                }`}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                                            active ? 'border-orange-500 bg-orange-500 text-white' : 'border-slate-300 bg-white'
                                        }`}>
                                            {active && <Check className="h-3 w-3" />}
                                        </span>
                                        <span className="truncate text-xs sm:text-sm font-semibold">{skill.name}</span>
                                    </div>
                                    {skill.version && (
                                        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-mono text-slate-500">
                                            v{skill.version}
                                        </span>
                                    )}
                                </div>
                                <p className="mt-1 line-clamp-2 text-[11px] leading-4 opacity-70 pl-6">
                                    {skill.description || '未填写说明'}
                                </p>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );

    return (
        <div className="flex items-center justify-between mb-2 sm:mb-3 px-1">
            <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto sm:overflow-visible no-scrollbar py-0.5 max-w-full">
                {/* MCP 模式选择 */}
                <div ref={mcpPanelRef} className="relative shrink-0">
                    <button
                        type="button"
                        onClick={() => setMcpPanelOpen(!mcpPanelOpen)}
                        className={`flex h-7 sm:h-10 items-center gap-1.5 sm:gap-2 rounded-lg sm:rounded-xl border px-2 sm:px-3 text-[11px] sm:text-xs font-semibold whitespace-nowrap transition-all ${
                            assistantMode === 'manual' && selectedMcpIds.length > 0
                                ? 'border-orange-200 bg-orange-50 text-orange-700 ring-1 ring-orange-100'
                                : assistantMode === 'auto'
                                    ? 'border-orange-200 bg-orange-50 text-orange-700 ring-1 ring-orange-100'
                                    : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100'
                        }`}
                    >
                        <Plug className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                        {assistantMode === 'disabled'
                            ? 'MCP：已禁用'
                            : assistantMode === 'auto'
                                ? 'MCP：自动'
                                : `MCP：${selectedMcpIds.length} 个`}
                        <ChevronDown className={`h-3 w-3 sm:h-3.5 sm:w-3.5 transition-transform ${mcpPanelOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {/* 桌面端 MCP 下拉浮层 */}
                    {mcpPanelOpen && (
                        <div className="hidden sm:block absolute bottom-full left-0 z-[130] mb-2 w-72 sm:w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10">
                            <div className="border-b border-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">
                                MCP 模式与能力
                            </div>
                            {renderMcpContent()}
                        </div>
                    )}
                </div>

                {/* 技能装载 */}
                <div ref={skillPanelRef} className="relative shrink-0">
                    <button
                        type="button"
                        onClick={() => setSkillPanelOpen(prev => !prev)}
                        disabled={chatSkills.length === 0}
                        className={`flex h-7 sm:h-10 items-center gap-1.5 sm:gap-2 rounded-lg sm:rounded-xl border px-2 sm:px-3 text-[11px] sm:text-xs font-semibold whitespace-nowrap transition-all ${
                            selectedSkillIds.length > 0
                                ? 'bg-orange-50 text-orange-700 border-orange-200 shadow-sm ring-1 ring-orange-100'
                                : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed'
                        }`}
                    >
                        <WandSparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                        {selectedSkillIds.length > 0 ? `技能：${selectedSkillIds.length} 个` : '装载技能'}
                        <ChevronDown className={`h-3 w-3 sm:h-3.5 sm:w-3.5 transition-transform ${skillPanelOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {/* 桌面端技能下拉浮层 */}
                    {skillPanelOpen && chatSkills.length > 0 && (
                        <div className="hidden sm:block absolute bottom-full left-0 z-[130] mb-2 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10">
                            <div className="border-b border-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">
                                AI 对话技能
                            </div>
                            {renderSkillContent()}
                        </div>
                    )}
                </div>

                {/* 思考模式 */}
                <button
                    type="button"
                    onClick={() => setUseThinking(!useThinking)}
                    className={`flex h-7 sm:h-10 items-center gap-1.5 sm:gap-2 rounded-lg sm:rounded-xl border px-2 sm:px-3 text-[11px] sm:text-xs font-semibold whitespace-nowrap transition-all shrink-0 ${
                        useThinking
                            ? 'bg-amber-50 text-amber-700 border-amber-200 shadow-sm ring-1 ring-amber-100'
                            : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                    }`}
                >
                    <BrainCircuit className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    <span className="hidden sm:inline">思考模式：</span>
                    <span>{useThinking ? '思考中' : '深度思考'}</span>
                </button>

                {/* 知识库模式 */}
                <button
                    type="button"
                    onClick={() => setUseKb(prev => !prev)}
                    className={`flex h-7 sm:h-10 items-center gap-1.5 sm:gap-2 rounded-lg sm:rounded-xl border px-2 sm:px-3 text-[11px] sm:text-xs font-semibold whitespace-nowrap transition-all shrink-0 ${
                        useKb
                            ? 'bg-blue-50 text-blue-600 border-blue-200 shadow-sm ring-1 ring-blue-100'
                            : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                    }`}
                >
                    <BookOpen className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    <span className="hidden sm:inline">知识库模式：</span>
                    <span>{useKb ? '知识库开' : '知识库关'}</span>
                </button>

                {/* 知识库文集选择 */}
                {useKb && (
                    <>
                        {/* 移动端专属文集快捷按钮 */}
                        <div className="sm:hidden shrink-0">
                            <button
                                type="button"
                                onClick={() => setMobileKbOpen(true)}
                                className="flex h-7 items-center gap-1 rounded-lg border border-blue-200 bg-blue-50/60 px-2 text-[11px] font-semibold text-blue-700 whitespace-nowrap active:scale-95 transition"
                            >
                                <span className="max-w-[90px] truncate">{selectedAnthology?.label || '全部文集'}</span>
                                <ChevronDown className="h-3 w-3 text-blue-500" />
                            </button>
                        </div>

                        {/* 桌面端文集 Select */}
                        <div className="hidden sm:block shrink-0">
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
                        </div>
                    </>
                )}
            </div>

            <span className="hidden md:flex text-[11px] text-slate-300 font-mono items-center gap-1 shrink-0 ml-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Model: Auto
            </span>

            {/* 移动端专属：MCP 底部抽屉 (Bottom Sheet) */}
            {mcpPanelOpen && (
                <div className="sm:hidden fixed inset-0 z-[150] flex flex-col justify-end">
                    <div
                        className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] animate-in fade-in duration-200"
                        onClick={() => setMcpPanelOpen(false)}
                    />
                    <div className="relative z-10 flex max-h-[82vh] flex-col rounded-t-3xl border-t border-slate-200/80 bg-white shadow-2xl animate-in slide-in-from-bottom duration-300">
                        <div className="flex justify-center pt-3 pb-1 cursor-pointer" onClick={() => setMcpPanelOpen(false)}>
                            <div className="h-1.5 w-10 rounded-full bg-slate-300/80" />
                        </div>
                        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
                            <div className="flex items-center gap-2 font-bold text-sm text-slate-800">
                                <Plug className="h-4 w-4 text-orange-500" />
                                <span>MCP 模式与能力配置</span>
                            </div>
                            <button
                                type="button"
                                onClick={() => setMcpPanelOpen(false)}
                                className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-3 scrollbar-hide">
                            {renderMcpContent()}
                        </div>
                    </div>
                </div>
            )}

            {/* 移动端专属：技能装载底部抽屉 (Bottom Sheet) */}
            {skillPanelOpen && chatSkills.length > 0 && (
                <div className="sm:hidden fixed inset-0 z-[150] flex flex-col justify-end">
                    <div
                        className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] animate-in fade-in duration-200"
                        onClick={() => setSkillPanelOpen(false)}
                    />
                    <div className="relative z-10 flex max-h-[82vh] flex-col rounded-t-3xl border-t border-slate-200/80 bg-white shadow-2xl animate-in slide-in-from-bottom duration-300">
                        <div className="flex justify-center pt-3 pb-1 cursor-pointer" onClick={() => setSkillPanelOpen(false)}>
                            <div className="h-1.5 w-10 rounded-full bg-slate-300/80" />
                        </div>
                        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
                            <div className="flex items-center gap-2 font-bold text-sm text-slate-800">
                                <WandSparkles className="h-4 w-4 text-orange-500" />
                                <span>AI 对话技能装载</span>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSkillPanelOpen(false)}
                                className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-3 scrollbar-hide">
                            {renderSkillContent()}
                        </div>
                    </div>
                </div>
            )}

            {/* 移动端专属：知识库检索文集抽屉 (Bottom Sheet) */}
            {mobileKbOpen && (
                <div className="sm:hidden fixed inset-0 z-[150] flex flex-col justify-end">
                    <div
                        className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] animate-in fade-in duration-200"
                        onClick={() => setMobileKbOpen(false)}
                    />
                    <div className="relative z-10 flex max-h-[80vh] flex-col rounded-t-3xl border-t border-slate-200/80 bg-white shadow-2xl animate-in slide-in-from-bottom duration-300">
                        <div className="flex justify-center pt-3 pb-1 cursor-pointer" onClick={() => setMobileKbOpen(false)}>
                            <div className="h-1.5 w-10 rounded-full bg-slate-300/80" />
                        </div>
                        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
                            <div className="flex items-center gap-2 font-bold text-sm text-slate-800">
                                <BookOpen className="h-4 w-4 text-blue-600" />
                                <span>选择检索文集</span>
                            </div>
                            <button
                                type="button"
                                onClick={() => setMobileKbOpen(false)}
                                className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-hide">
                            {anthologyOptions.length === 0 ? (
                                <div className="py-6 text-center text-xs text-slate-400">暂无文章文集</div>
                            ) : (
                                anthologyOptions.map(option => {
                                    const active = option.value === selectedCollId;
                                    return (
                                        <button
                                            key={option.value}
                                            type="button"
                                            onClick={() => {
                                                setSelectedCollId(option.value);
                                                setMobileKbOpen(false);
                                            }}
                                            className={`flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-left transition-all ${
                                                active
                                                    ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200 font-semibold'
                                                    : 'text-slate-600 hover:bg-slate-50 border border-slate-100'
                                            }`}
                                        >
                                            <span className="truncate text-sm">{option.label}</span>
                                            {active && <Check className="h-4 w-4 shrink-0 text-blue-600" />}
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
