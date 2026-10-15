import type {AgentConfig, AgentTaskMcpToolScope, MCPServerConfig} from '@/types/api/setting';

type Props = {
    value: AgentTaskMcpToolScope;
    selectedAgentIds: string[];
    agents: AgentConfig[];
    servers: MCPServerConfig[];
    onChange: (value: AgentTaskMcpToolScope) => void;
};

export function McpTaskScopeFields({value, selectedAgentIds, agents, servers, onChange}: Props) {
    const selectedAgentSet = new Set(selectedAgentIds);
    const boundServerIds = new Set(agents
        .filter(agent => selectedAgentSet.has(agent.id))
        .flatMap(agent => agent.mcpServers || []));
    const boundServers = servers.filter(server => boundServerIds.has(server.id));
    const strictScope = value ?? {};

    const setToolEnabled = (serverId: string, toolName: string, enabled: boolean) => {
        const next = {...strictScope};
        const names = new Set(next[serverId] || []);
        if (enabled) names.add(toolName);
        else names.delete(toolName);
        if (names.size) next[serverId] = [...names];
        else delete next[serverId];
        onChange(next);
    };

    return (
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div>
                <h4 className="text-sm font-semibold text-slate-800">任务可用的 MCP 工具</h4>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">每个自定义任务单独决定可调用的工具。只会显示所选 Agent 已绑定的 MCP 服务。</p>
            </div>

            <div className="inline-flex flex-wrap rounded-xl bg-slate-100 p-1">
                <button
                    type="button"
                    aria-pressed={value === null}
                    onClick={() => onChange(null)}
                    className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${value === null ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    兼容 Agent 全部已启用工具
                </button>
                <button
                    type="button"
                    aria-pressed={value !== null}
                    onClick={() => {if (value === null) onChange({});}}
                    className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${value !== null ? 'bg-white text-orange-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    按任务勾选
                </button>
            </div>

            {value === null ? (
                <p className="rounded-xl bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800">
                    兼容模式会装载所选 Agent 绑定的全部已启用 MCP 工具。切换为“按任务勾选”后，新任务默认没有 MCP 权限。
                </p>
            ) : (
                <div className="space-y-3">
                    <p className="rounded-xl bg-orange-50 px-4 py-3 text-xs leading-relaxed text-orange-800">
                        空白白名单表示任务不装载 MCP。任务只注册下方勾选的工具；未勾选服务不会建立 MCP 工具连接。
                    </p>
                    {boundServers.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-400">
                            当前所选 Agent 没有绑定 MCP 服务。可先在 Agent 配置中绑定服务。
                        </div>
                    ) : boundServers.map(server => {
                        const chosen = new Set(strictScope[server.id] || []);
                        const tools = server.tools || [];
                        return (
                            <div key={server.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="min-w-0">
                                        <h5 className="truncate text-sm font-semibold text-slate-800">{server.name}</h5>
                                        <p className="mt-0.5 text-xs text-slate-500">
                                            {server.enabled ? `${chosen.size} 个工具已授权` : 'MCP 服务已停用，当前不会装载'}
                                        </p>
                                    </div>
                                    {!server.enabled && <span className="rounded-full bg-slate-200 px-2 py-1 text-[11px] text-slate-500">已停用</span>}
                                </div>
                                {tools.length === 0 ? (
                                    <p className="mt-3 rounded-lg bg-white px-3 py-2 text-xs text-slate-400">尚无工具清单，请先在 MCP 设置中同步 / 刷新 Tools。</p>
                                ) : (
                                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                        {tools.map(tool => {
                                            const checked = chosen.has(tool.name);
                                            const disabled = !server.enabled || tool.enabled === false;
                                            return (
                                                <label key={tool.name} className={`flex min-w-0 items-start gap-2 rounded-lg border bg-white px-3 py-2.5 ${disabled ? 'border-slate-100 opacity-55' : checked ? 'border-orange-200 bg-orange-50/60' : 'border-slate-200'}`}>
                                                    <input
                                                        type="checkbox"
                                                        className="mt-0.5 accent-orange-500"
                                                        checked={checked}
                                                        disabled={disabled}
                                                        onChange={event => setToolEnabled(server.id, tool.name, event.target.checked)}
                                                    />
                                                    <span className="min-w-0">
                                                        <span className="block break-all text-xs font-medium text-slate-700">{tool.name}</span>
                                                        {tool.description && <span className="mt-1 line-clamp-2 block text-[11px] leading-relaxed text-slate-400">{tool.description}</span>}
                                                        {tool.enabled === false && <span className="mt-1 block text-[11px] text-slate-400">Agent 配置中已停用</span>}
                                                    </span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </section>
    );
}
