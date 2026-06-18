// frontend_react/src/components/AIChatWindow/index.tsx

import { useState, useEffect, useRef, useMemo } from 'react';
import { Bot, Maximize2, MessageCircle, Trash2, Minimize2, X } from 'lucide-react';

import { type AgentConfig } from '../../api/setting';
import { type AIChatWindowProps } from './types';
import ConfirmationModal from '../common/ConfirmationModal';
import { useChatSettings } from './hooks/useChatSettings';
import { useChatSession, getConversationSummary } from './hooks/useChatSession';
import { AgentSidebar } from './AgentSidebar';
import { ChatMessageList } from './ChatMessageList';
import { ChatSettingsToolbar } from './ChatSettingsToolbar';
import { ChatInput } from './ChatInput';

const getAgentId = (agent?: AgentConfig | null) => {
    if (!agent) return '';
    const raw = agent as AgentConfig & { agentId?: string; agent_id?: string };
    return String(raw.id || raw.agentId || raw.agent_id || '').trim();
};

const getAgentConversationKey = (agent?: AgentConfig | null) => {
    const id = getAgentId(agent);
    if (id) return `agent:${id}`;
    const name = agent?.name?.trim();
    return name ? `agent-name:${name}` : 'public';
};

export const AIChatWindow = ({
    isOpen,
    onClose,
    activeAgent = null,
    onOpenContacts,
    onSelectAgent,
}: AIChatWindowProps) => {
    const [isMinimized, setIsMinimized] = useState(false);
    const [input, setInput] = useState('');
    const [contactSidebarOpen, setContactSidebarOpen] = useState(true);
    const [contactAgents, setContactAgents] = useState<AgentConfig[]>([]);
    const [contactQuery, setContactQuery] = useState('');
    const [isClearModalOpen, setIsClearModalOpen] = useState(false);

    const activeConversationKey = useMemo(() => {
        return activeAgent ? getAgentConversationKey(activeAgent) : 'public';
    }, [activeAgent]);

    // 切换会话时清空输入框
    useEffect(() => {
        setInput('');
    }, [activeConversationKey]);

    const activeAgentName = activeAgent?.name || '小橘 AI助手';
    const showContactSidebar = Boolean(onSelectAgent) && contactSidebarOpen;

    // ESC 键监听：最小化窗口
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen && !isMinimized) {
                setIsMinimized(true);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, isMinimized]);

    // 加载全部智能体列表
    useEffect(() => {
        if (!isOpen || !onSelectAgent) return;
        import('../../api/setting')
            .then(({ getAgents }) => getAgents())
            .then(data => setContactAgents((data || []) as unknown as AgentConfig[]))
            .catch(error => console.warn('加载智能体列表失败:', error));
    }, [isOpen, onSelectAgent]);

    // 初始化会话管理 Hook
    const {
        messages,
        messagesConversationKey,
        isLoading,
        activitySteps,
        shouldAutoScroll,
        setShouldAutoScroll,
        confirmClear,
        addAssistantMessage,
        handleSend,
    } = useChatSession({
        isOpen,
        activeConversationKey,
        activeAgent,
        buildActivitySteps: (
            usePhotographyAssistant,
            activeMcpServerIds,
            effectiveUseKb,
            effectiveSelectedSkillIds
        ) => {
            const steps = [];
            if (usePhotographyAssistant) {
                steps.push({
                    id: 'photography',
                    label: '读取摄影数据',
                    detail: '准备图片文集、焦段、标签与地点统计',
                    status: 'active' as const,
                });
            }
            if (effectiveUseKb && !usePhotographyAssistant) {
                steps.push({
                    id: 'knowledge',
                    label: '检索知识库',
                    detail: selectedCollId
                        ? anthologyOptions.find(option => option.value === selectedCollId)?.label || '指定文集'
                        : '全部文集',
                    status: steps.length === 0 ? ('active' as const) : ('queued' as const),
                });
            }
            if (activeMcpServerIds.length > 0) {
                steps.push({
                    id: 'mcp',
                    label: '装载 MCP',
                    detail: activeMcpServerIds.map(getMcpName).join('、'),
                    status: steps.length === 0 ? ('active' as const) : ('queued' as const),
                });
            }
            if (effectiveSelectedSkillIds.length > 0) {
                steps.push({
                    id: 'skill',
                    label: '装载 Skill',
                    detail: effectiveSelectedSkillIds.map(getSkillName).join('、'),
                    status: steps.length === 0 ? ('active' as const) : ('queued' as const),
                });
            }
            steps.push({
                id: 'answer',
                label: '生成回答',
                detail: '整理上下文并输出',
                status: steps.length === 0 ? ('active' as const) : ('queued' as const),
            });
            return steps;
        }
    });

    // 初始化配置管理 Hook
    const {
        useKb,
        setUseKb,
        useThinking,
        setUseThinking,
        assistantMode,
        selectedCollId,
        setSelectedCollId,
        selectedMcpIds,
        selectedSkillIds,
        chatMcpServers,
        chatSkills,
        mcpPanelOpen,
        setMcpPanelOpen,
        skillPanelOpen,
        setSkillPanelOpen,
        anthologyOptions,
        mcpOptions,
        imageAnthologies,
        getMcpName,
        getSkillName,
        toggleChatSkill,
        toggleMcp,
        setModeWithSideEffects,
    } = useChatSettings({
        isOpen,
        messagesLength: messages.length,
        activeConversationKey,
        onAddAssistantMessage: addAssistantMessage,
    });

    // 智能体技能与 MCP 列表
    const activeAgentSkills = activeAgent?.skills?.map(getSkillName).filter(Boolean) || [];
    const activeAgentMcpServers = activeAgent?.mcpServers?.map(getMcpName).filter(Boolean) || [];

    // 计算侧边栏会话列表
    const conversationItems = useMemo(() => {
        const keyword = contactQuery.trim().toLowerCase();
        const liveMessages = messagesConversationKey === activeConversationKey ? messages : undefined;
        const publicSummary = getConversationSummary('public', activeConversationKey === 'public' ? liveMessages : undefined);
        const items = [
            {
                id: 'public',
                name: '小橘助手',
                agent: null as AgentConfig | null,
                avatar: '',
                badge: '公共',
                summary: publicSummary,
            },
            ...contactAgents.map(agent => ({
                id: getAgentConversationKey(agent),
                name: agent.name,
                agent,
                avatar: agent.avatar,
                badge: '智能体',
                summary: getConversationSummary(getAgentConversationKey(agent), activeConversationKey === getAgentConversationKey(agent) ? liveMessages : undefined),
            })),
        ];

        if (!keyword) return items;
        return items.filter(item => `${item.name} ${item.summary.content}`.toLowerCase().includes(keyword));
    }, [activeConversationKey, contactAgents, contactQuery, messages, messagesConversationKey]);

    // 点击 MCP 面板外部关闭
    const mcpPanelRef = useRef<HTMLDivElement>(null);
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

    // 自动滚动控制
    const chatBodyRef = useRef<HTMLDivElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const container = chatBodyRef.current;
        if (!container || isMinimized || !isOpen || !shouldAutoScroll) return;

        if (isLoading) {
            container.scrollTop = container.scrollHeight;
            return;
        }

        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, isMinimized, isOpen, isLoading, shouldAutoScroll]);

    const handleChatBodyScroll = () => {
        const container = chatBodyRef.current;
        if (!container) return;

        const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        setShouldAutoScroll(distanceToBottom < 96);
    };

    // 清空历史对话弹窗
    const handleClearMessages = () => {
        if (messages.length > 0) {
            setIsClearModalOpen(true);
        }
    };

    if (!isOpen) return null;

    // 最小化状态视图
    if (isMinimized) {
        return (
            <div
                className="fixed right-0 top-1/2 -translate-y-1/2 z-[100] bg-gradient-to-r from-orange-500 to-orange-600 text-white p-3 rounded-l-xl shadow-lg cursor-pointer hover:w-16 transition-all w-12 flex flex-col items-center gap-3 group border-y border-l border-white/20"
                onClick={() => setIsMinimized(false)}
                title="展开 AI 对话"
            >
                <Bot className="w-6 h-6 animate-pulse" />
                <div className="flex flex-col items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                    <span className="text-[10px] font-bold writing-vertical-rl tracking-widest">AI</span>
                    <Maximize2 className="w-3 h-3 mt-1" />
                </div>
            </div>
        );
    }

    const inputSendHandler = (userMsg: string) => {
        handleSend(userMsg, {
            assistantMode,
            selectedMcpIds,
            chatMcpServers,
            useKb,
            selectedCollId,
            useThinking,
            selectedSkillIds,
            imageAnthologies,
        });
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/20 backdrop-blur-[2px] animate-in fade-in duration-200">
            {/* 确认弹窗 */}
            <ConfirmationModal
                isOpen={isClearModalOpen}
                onClose={() => setIsClearModalOpen(false)}
                onConfirm={() => {
                    confirmClear();
                    setIsClearModalOpen(false);
                }}
                title="清空对话"
                description="确定要清空当前所有对话记录吗？此操作无法撤销。"
                confirmText="清空"
                type="warning"
            />

            {/* 主容器 */}
            <div
                className="relative h-[80vh] max-h-[820px] w-[min(1120px,95vw)] bg-white rounded-2xl shadow-2xl border border-slate-200 flex animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 ring-1 ring-slate-900/5 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {showContactSidebar && (
                    <AgentSidebar
                        conversationItems={conversationItems}
                        activeConversationKey={activeConversationKey}
                        onSelectAgent={onSelectAgent}
                        contactQuery={contactQuery}
                        setContactQuery={setContactQuery}
                        setContactSidebarOpen={setContactSidebarOpen}
                    />
                )}

                <div className="flex min-w-0 flex-1 flex-col">
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80 backdrop-blur-sm">
                        <div className="min-w-0 flex items-center gap-3 text-slate-800">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-orange-100 bg-orange-100 text-orange-600 shadow-sm">
                                {activeAgent?.avatar ? (
                                    <img src={activeAgent.avatar} alt={activeAgent.name} className="h-full w-full object-cover" />
                                ) : (
                                    <Bot className="w-5 h-5" />
                                )}
                            </div>
                            <div className="min-w-0">
                                <div className="flex min-w-0 items-center gap-2">
                                    <span className="truncate text-lg font-bold">{activeAgentName}</span>
                                    <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-xs font-semibold leading-5 ${
                                        activeAgent ? 'bg-violet-100 text-violet-600' : 'bg-slate-100 text-slate-400'
                                    }`}>
                                        {activeAgent ? '智能体' : '公共'}
                                    </span>
                                </div>
                                {activeAgent && (
                                    <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px] font-normal text-slate-400">
                                        {activeAgent.modelDetail?.name && <span className="truncate">模型：{activeAgent.modelDetail.name}</span>}
                                        {(activeAgentSkills.length > 0 || activeAgentMcpServers.length > 0) && (
                                            <span className="truncate">
                                                {activeAgent.modelDetail?.name ? ' · ' : ''}
                                                {activeAgentSkills.length} 技能 / {activeAgentMcpServers.length} 工具
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-1">
                            {onOpenContacts && (
                                <button
                                    onClick={() => setContactSidebarOpen(!contactSidebarOpen)}
                                    className="mr-1 rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-200 hover:text-orange-600"
                                    title={contactSidebarOpen ? '收起会话列表' : '展开会话列表'}
                                >
                                    <MessageCircle className="w-5 h-5" />
                                </button>
                            )}
                            <button
                                onClick={handleClearMessages}
                                disabled={messages.length === 0}
                                className={`p-2 rounded-lg transition-colors mr-1 ${
                                    messages.length === 0
                                        ? 'text-slate-200 cursor-not-allowed'
                                        : 'text-slate-400 hover:bg-slate-200 hover:text-orange-600'
                                }`}
                                title={messages.length === 0 ? "暂无对话" : "清空会话"}
                            >
                                <Trash2 className="w-5 h-5" />
                            </button>
                            <button
                                onClick={() => setIsMinimized(true)}
                                className="p-2 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
                                title="最小化"
                            >
                                <Minimize2 className="w-5 h-5" />
                            </button>
                            <button
                                onClick={onClose}
                                className="p-2 hover:bg-red-50 hover:text-red-500 rounded-lg text-slate-400 transition-colors"
                                title="关闭"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* 对话消息列表 */}
                    <ChatMessageList
                        messages={messages}
                        isLoading={isLoading}
                        activitySteps={activitySteps}
                        activeAgent={activeAgent}
                        activeAgentSkills={activeAgentSkills}
                        activeAgentMcpServers={activeAgentMcpServers}
                        chatBodyRef={chatBodyRef}
                        messagesEndRef={messagesEndRef}
                        onScroll={handleChatBodyScroll}
                        setIsMinimized={setIsMinimized}
                        useThinking={!activeAgent && useThinking}
                    />

                    {/* Footer 输入框及状态面板区域 */}
                    <div className="p-5 bg-white border-t border-slate-100">
                        {!activeAgent && (
                            <ChatSettingsToolbar
                                mcpPanelRef={mcpPanelRef}
                                assistantMode={assistantMode}
                                selectedMcpIds={selectedMcpIds}
                                mcpOptions={mcpOptions}
                                mcpPanelOpen={mcpPanelOpen}
                                setMcpPanelOpen={setMcpPanelOpen}
                                setModeWithSideEffects={setModeWithSideEffects}
                                toggleMcp={toggleMcp}
                                useKb={useKb}
                                setUseKb={setUseKb}
                                selectedCollId={selectedCollId}
                                setSelectedCollId={setSelectedCollId}
                                anthologyOptions={anthologyOptions}
                                chatSkills={chatSkills}
                                selectedSkillIds={selectedSkillIds}
                                toggleChatSkill={toggleChatSkill}
                                skillPanelOpen={skillPanelOpen}
                                setSkillPanelOpen={setSkillPanelOpen}
                                useThinking={useThinking}
                                setUseThinking={setUseThinking}
                            />
                        )}
                        <ChatInput
                            input={input}
                            setInput={setInput}
                            isLoading={isLoading}
                            onSend={inputSendHandler}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AIChatWindow;
