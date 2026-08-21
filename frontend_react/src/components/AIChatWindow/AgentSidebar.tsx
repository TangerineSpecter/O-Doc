// frontend_react/src/components/AIChatWindow/AgentSidebar.tsx

import { Bot, ChevronDown, Search } from 'lucide-react';
import { type AgentConfig } from '../../api/setting';
import { formatSummaryDate } from '../../utils/format';
import {isImageAvatarValue} from '../../utils/avatar';

interface ConversationItem {
    id: string;
    name: string;
    agent: AgentConfig | null;
    avatar: string;
    badge: string;
    summary: {
        content: string;
        updatedAt: string;
    };
}

interface AgentSidebarProps {
    conversationItems: ConversationItem[];
    activeConversationKey: string;
    onSelectAgent?: (agent: AgentConfig | null) => void;
    contactQuery: string;
    setContactQuery: (query: string) => void;
    setContactSidebarOpen: (open: boolean) => void;
}


export const AgentSidebar = ({
    conversationItems,
    activeConversationKey,
    onSelectAgent,
    contactQuery,
    setContactQuery,
    setContactSidebarOpen,
}: AgentSidebarProps) => {
    return (
        <aside className="hidden w-72 shrink-0 border-r border-slate-100 bg-slate-50/80 md:flex md:flex-col">
            <div className="border-b border-slate-100 px-4 py-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-base font-bold text-slate-900">AI 中心</h2>
                        <p className="mt-0.5 text-xs text-slate-400">选择助手或智能体</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setContactSidebarOpen(false)}
                        className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white hover:text-slate-700"
                        title="收起列表"
                    >
                        <ChevronDown className="h-4 w-4 rotate-90" />
                    </button>
                </div>
                <div className="mt-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm focus-within:border-orange-300 focus-within:ring-2 focus-within:ring-orange-500/10">
                    <Search className="h-4 w-4 text-slate-400" />
                    <input
                        value={contactQuery}
                        onChange={(event) => setContactQuery(event.target.value)}
                        className="min-w-0 flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                        placeholder="搜索会话"
                    />
                </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {conversationItems.map(item => {
                    const active = activeConversationKey === item.id;
                    return (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => onSelectAgent?.(item.agent)}
                            className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all last:mb-0 ${
                                active
                                    ? 'bg-orange-50 text-slate-900 shadow-sm ring-1 ring-orange-100'
                                    : 'text-slate-600 hover:bg-white hover:shadow-sm'
                            }`}
                        >
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white bg-orange-50 text-orange-600 shadow-sm">
                                {isImageAvatarValue(item.avatar) ? (
                                    <img src={item.avatar} alt={item.name} className="h-full w-full object-cover" />
                                ) : (
                                    item.avatar?.trim() || <Bot className="h-5 w-5" />
                                )}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex min-w-0 items-center gap-1.5">
                                        <span className="truncate text-sm font-bold">{item.name}</span>
                                        <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold leading-4 ${
                                            item.agent ? 'bg-violet-100 text-violet-600' : 'bg-slate-100 text-slate-500'
                                        }`}>
                                            {item.badge}
                                        </span>
                                    </div>
                                    <span className="shrink-0 text-[11px] text-slate-400">{formatSummaryDate(item.summary.updatedAt)}</span>
                                </div>
                                <p className="mt-1 truncate text-xs text-slate-400">{item.summary.content}</p>
                            </div>
                        </button>
                    );
                })}
            </div>
        </aside>
    );
};
