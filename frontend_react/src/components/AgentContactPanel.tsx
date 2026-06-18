import {useEffect, useMemo, useState} from 'react';
import {
    Bot,
    Loader2,
    MessageCircle,
    Search,
    Settings,
    Sparkles,
    UsersRound,
    X
} from 'lucide-react';
import {getAgents, type AgentConfig} from '../api/setting';
import { formatSummaryDate } from '../utils/format';

interface AgentContactPanelProps {
    isOpen: boolean;
    onClose: () => void;
    onStartPublicChat: () => void;
    onStartAgentChat: (agent: AgentConfig) => void;
    onManageAgents?: () => void;
}

const getInitial = (name: string) => name.trim().slice(0, 1).toUpperCase() || 'A';
const CHAT_STORAGE_PREFIX = 'o-doc:ai-chat:';

const getAgentId = (agent?: AgentConfig | null) => {
    if (!agent) return '';
    const raw = agent as AgentConfig & {agentId?: string; agent_id?: string};
    return String(raw.id || raw.agentId || raw.agent_id || '').trim();
};

const getAgentConversationKey = (agent?: AgentConfig | null) => {
    const id = getAgentId(agent);
    if (id) return `agent:${id}`;
    const name = agent?.name?.trim();
    return name ? `agent-name:${name}` : 'public';
};

interface StoredMessage {
    role: 'user' | 'assistant';
    content: string;
}

interface ChatSummary {
    content: string;
    updatedAt: string;
}

const getChatSummary = (conversationKey: string): ChatSummary | null => {
    try {
        const raw = localStorage.getItem(`${CHAT_STORAGE_PREFIX}${conversationKey}`);
        if (!raw) return null;

        const parsed = JSON.parse(raw) as {messages?: StoredMessage[]; updatedAt?: string};
        const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
        const lastMessage = [...messages].reverse().find(message => message.content?.trim());
        if (!lastMessage) return null;

        return {
            content: lastMessage.content.trim().replace(/\s+/g, ' '),
            updatedAt: parsed.updatedAt || '',
        };
    } catch (error) {
        console.warn('读取智能体会话摘要失败:', error);
        return null;
    }
};


const AgentAvatar = ({agent, size = 'md'}: { agent?: Pick<AgentConfig, 'name' | 'avatar'>; size?: 'sm' | 'md' | 'lg' }) => {
    const sizeClass = size === 'lg' ? 'h-12 w-12 rounded-2xl' : size === 'sm' ? 'h-9 w-9 rounded-xl' : 'h-12 w-12 rounded-2xl';
    const avatar = agent?.avatar?.trim();

    if (avatar) {
        return (
            <div className={`${sizeClass} shrink-0 overflow-hidden border border-white bg-orange-50 shadow-sm`}>
                <img src={avatar} alt={agent?.name || '智能体'} className="h-full w-full object-cover"/>
            </div>
        );
    }

    return (
        <div className={`${sizeClass} shrink-0 border border-orange-100 bg-orange-50 text-orange-600 shadow-sm flex items-center justify-center`}>
            {agent ? <span className="text-sm font-bold">{getInitial(agent.name)}</span> : <Bot className="h-5 w-5"/>}
        </div>
    );
};

export default function AgentContactPanel({
    isOpen,
    onClose,
    onStartPublicChat,
    onStartAgentChat,
    onManageAgents,
}: AgentContactPanelProps) {
    const [agents, setAgents] = useState<AgentConfig[]>([]);
    const [chatSummaries, setChatSummaries] = useState<Record<string, ChatSummary | null>>({});
    const [query, setQuery] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!isOpen) return;

        setIsLoading(true);
        getAgents()
            .then((agentData) => {
                const nextAgents = (agentData || []) as unknown as AgentConfig[];
                setAgents(nextAgents);
                setChatSummaries(Object.fromEntries(nextAgents.map(agent => [
                    getAgentConversationKey(agent),
                    getChatSummary(getAgentConversationKey(agent))
                ])));
            })
            .catch(error => {
                console.warn('加载智能体联系人失败:', error);
            })
            .finally(() => setIsLoading(false));
    }, [isOpen]);

    const filteredAgents = useMemo(() => {
        const keyword = query.trim().toLowerCase();
        if (!keyword) return agents;
        return agents.filter(agent => {
            const haystack = [
                agent.name,
                chatSummaries[getAgentConversationKey(agent)]?.content || '',
            ].join(' ').toLowerCase();
            return haystack.includes(keyword);
        });
    }, [agents, chatSummaries, query]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex justify-end bg-slate-900/20 backdrop-blur-[2px] animate-in fade-in duration-200">
            <button type="button" className="hidden flex-1 cursor-default md:block" onClick={onClose} aria-label="关闭 Agent 联系人"/>
            <section className="flex h-full w-full max-w-[430px] flex-col border-l border-slate-200 bg-white shadow-2xl shadow-slate-900/20 animate-in slide-in-from-right-6 duration-300">
                <header className="border-b border-slate-100 bg-slate-50/90 px-5 py-4 backdrop-blur">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-orange-100 bg-orange-50 text-orange-600 shadow-sm">
                                <UsersRound className="h-5 w-5"/>
                            </div>
                            <div className="min-w-0">
                                <h2 className="truncate text-lg font-bold text-slate-900">AI 中心</h2>
                                <p className="truncate text-xs text-slate-500">公共助手和你的智能体联系人</p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700"
                            title="关闭"
                        >
                            <X className="h-5 w-5"/>
                        </button>
                    </div>
                    <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm focus-within:border-orange-300 focus-within:ring-2 focus-within:ring-orange-500/10">
                        <Search className="h-4 w-4 text-slate-400"/>
                        <input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            className="min-w-0 flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                            placeholder="搜索智能体或消息"
                        />
                    </div>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                    <button
                        type="button"
                        onClick={onStartPublicChat}
                        className="mb-4 flex w-full items-center gap-3 rounded-xl border border-orange-100 bg-orange-50/70 p-3 text-left shadow-sm transition-all hover:border-orange-200 hover:bg-orange-50 hover:shadow-md"
                    >
                        <AgentAvatar/>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                                <span className="truncate text-sm font-bold text-slate-900">小橘助手</span>
                                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-orange-600">公共</span>
                            </div>
                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">所有人可用的默认 AI 助手，适合快速问答、文档检索和临时写作。</p>
                        </div>
                        <MessageCircle className="h-4 w-4 shrink-0 text-orange-500"/>
                    </button>

                    <div className="mb-2 flex items-center justify-between px-1">
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                            <Sparkles className="h-3.5 w-3.5 text-orange-500"/>
                            <span>我的智能体</span>
                        </div>
                        {onManageAgents && (
                            <button
                                type="button"
                                onClick={onManageAgents}
                                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-orange-600"
                            >
                                <Settings className="h-3.5 w-3.5"/>
                                管理
                            </button>
                        )}
                    </div>

                    {isLoading ? (
                        <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-400">
                            <Loader2 className="h-4 w-4 animate-spin"/>
                            正在加载联系人
                        </div>
                    ) : filteredAgents.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
                            <Bot className="mx-auto h-8 w-8 text-slate-300"/>
                            <p className="mt-3 text-sm font-semibold text-slate-600">{query ? '没有匹配的智能体' : '还没有智能体联系人'}</p>
                            <p className="mt-1 text-xs leading-5 text-slate-400">创建并配置智能体后，它们会出现在这里。</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {filteredAgents.map(agent => {
                                const conversationKey = getAgentConversationKey(agent);
                                const summary = chatSummaries[conversationKey];
                                return (
                                    <button
                                        key={conversationKey}
                                        type="button"
                                        onClick={() => onStartAgentChat(agent)}
                                        className="group w-full rounded-xl border border-slate-100 bg-white px-3 py-2.5 text-left shadow-sm transition-all hover:border-orange-200 hover:shadow-md"
                                    >
                                        <div className="flex items-center gap-3">
                                            <AgentAvatar agent={agent}/>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="flex min-w-0 items-center gap-2">
                                                        <h3 className="truncate text-sm font-bold text-slate-900">{agent.name}</h3>
                                                        <span className="shrink-0 rounded-md bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold leading-4 text-violet-600">智能体</span>
                                                    </div>
                                                    <span className="shrink-0 text-xs text-slate-400">{formatSummaryDate(summary?.updatedAt || '')}</span>
                                                </div>
                                                <p className="mt-1 truncate text-sm text-slate-400">
                                                    {summary?.content || '还没有对话，点开开始聊天'}
                                                </p>
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}
