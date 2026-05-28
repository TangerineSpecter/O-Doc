import {useMemo, useState} from 'react';
import {ChevronDown, Code2, Edit2, Plus, Radar, RefreshCw, Trash2, Wrench, X} from 'lucide-react';
import type {MCPServerConfig, MCPToolConfig, MCPTransport} from '@/api/setting';
import {SettingsSelect} from './SettingsSelect';

interface MCPSettingsProps {
    servers: MCPServerConfig[];
    onSave: (server: Partial<MCPServerConfig>) => Promise<boolean>;
    onDelete: (target: { type: 'mcp', serverId: string }) => void;
    onScan: () => Promise<{ count: number, servers: MCPServerConfig[] }>;
    onRefreshTools: (serverId: string) => Promise<boolean>;
}

type MCPForm = {
    id?: string;
    name: string;
    transport: MCPTransport;
    command: string;
    argsText: string;
    url: string;
    headersText: string;
    description: string;
    enabled: boolean;
};

const defaultForm: MCPForm = {
    name: '',
    transport: 'stdio',
    command: '',
    argsText: '',
    url: '',
    headersText: '',
    description: '',
    enabled: true,
};

const transportOptions = [
    {value: 'stdio' as MCPTransport, label: '标准输入 / 输出 (stdio)', description: '本地命令启动'},
    {value: 'sse' as MCPTransport, label: '服务器发送事件 (sse)', description: '外部 SSE 服务'},
    {value: 'streamableHttp' as MCPTransport, label: '可流式传输的 HTTP (streamableHttp)', description: '外部 Streamable HTTP 服务'},
];

const parseArgs = (value: string) => value
    .split('\n')
    .map(item => item.trim())
    .filter(Boolean);

const stringifyHeaders = (headers: Record<string, string> = {}) => Object.entries(headers)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

const parseHeaders = (value: string) => {
    return value.split('\n').reduce<Record<string, string>>((result, line) => {
        const trimmed = line.trim();
        if (!trimmed) return result;
        const separator = trimmed.indexOf('=');
        if (separator <= 0) return result;
        const key = trimmed.slice(0, separator).trim();
        const headerValue = trimmed.slice(separator + 1).trim();
        if (key) result[key] = headerValue;
        return result;
    }, {});
};

const getStoredTools = (server?: MCPServerConfig): MCPToolConfig[] => {
    if (!server || !Array.isArray(server.tools)) return [];
    return server.tools;
};

const buildFallbackTools = (server: MCPServerConfig): MCPToolConfig[] => {
    const lowerName = server.name.toLowerCase();

    if (lowerName.includes('filesystem') || lowerName.includes('file')) {
        return [
            {name: 'read_file', description: '读取指定路径的文件内容', enabled: true},
            {name: 'write_file', description: '写入或更新指定路径的文件', enabled: true},
            {name: 'list_directory', description: '列出目录中的文件和文件夹', enabled: true},
        ];
    }

    if (lowerName.includes('github')) {
        return [
            {name: 'search_repositories', description: '搜索仓库和代码', enabled: true},
            {name: 'create_issue', description: '创建 GitHub Issue', enabled: true},
            {name: 'create_pull_request', description: '创建 Pull Request', enabled: false},
        ];
    }

    return [
        {name: 'search', description: '搜索 MCP 提供的资源', enabled: true},
        {name: 'fetch', description: '读取指定资源内容', enabled: true},
        {name: 'execute', description: '执行 MCP 暴露的操作', enabled: false},
    ];
};

export const MCPSettings = ({servers, onSave, onDelete, onScan, onRefreshTools}: MCPSettingsProps) => {
    const [modalOpen, setModalOpen] = useState(false);
    const [form, setForm] = useState<MCPForm>(defaultForm);
    const [saving, setSaving] = useState(false);
    const [scanning, setScanning] = useState(false);
    const [refreshingServerId, setRefreshingServerId] = useState<string | null>(null);
    const [expandedServerIds, setExpandedServerIds] = useState<string[]>([]);
    const [toolOverrides, setToolOverrides] = useState<Record<string, MCPToolConfig[]>>({});

    const handleRefreshTools = async (serverId: string) => {
        setRefreshingServerId(serverId);
        await onRefreshTools(serverId);
        setRefreshingServerId(null);
    };

    const serverTools = useMemo(() => {
        return servers.reduce<Record<string, MCPToolConfig[]>>((result, server) => {
            const storedTools = getStoredTools(server);
            result[server.id] = toolOverrides[server.id] || (storedTools.length > 0 ? storedTools : buildFallbackTools(server));
            return result;
        }, {});
    }, [servers, toolOverrides]);

    const openCreateModal = () => {
        setForm(defaultForm);
        setModalOpen(true);
    };

    const openEditModal = (server: MCPServerConfig) => {
        setForm({
            id: server.id,
            name: server.name,
            transport: server.transport,
            command: server.command || '',
            argsText: (server.args || []).join('\n'),
            url: server.url || '',
            headersText: stringifyHeaders(server.headers),
            description: server.description || '',
            enabled: server.enabled,
        });
        setModalOpen(true);
    };

    const handleSubmit = async () => {
        if (!form.name.trim()) return;
        setSaving(true);
        const currentServer = servers.find(server => server.id === form.id);
        const success = await onSave({
            id: form.id,
            name: form.name.trim(),
            transport: form.transport,
            command: form.command.trim(),
            args: parseArgs(form.argsText),
            url: form.url.trim(),
            headers: parseHeaders(form.headersText),
            env: {},
            source: 'external',
            enabled: form.enabled,
            description: form.description.trim(),
            tools: form.id ? getStoredTools(currentServer) : [],
        });
        setSaving(false);
        if (success) setModalOpen(false);
    };

    const handleScan = async () => {
        setScanning(true);
        await onScan();
        setScanning(false);
    };

    const toggleExpanded = (serverId: string) => {
        setExpandedServerIds(prev => (
            prev.includes(serverId)
                ? prev.filter(id => id !== serverId)
                : [...prev, serverId]
        ));
    };

    const updateServerTools = async (serverId: string, updater: (tools: MCPToolConfig[]) => MCPToolConfig[]) => {
        const server = servers.find(item => item.id === serverId);
        if (!server) return;
        const storedTools = getStoredTools(server);
        const currentTools = toolOverrides[serverId] || storedTools;
        if (currentTools.length === 0) return;
        const nextTools = updater(currentTools);
        setToolOverrides(prev => ({
            ...prev,
            [serverId]: nextTools,
        }));
        await onSave({...server, tools: nextTools});
    };

    const toggleTool = (serverId: string, toolName: string) => {
        updateServerTools(serverId, tools => tools.map(tool => (
            tool.name === toolName ? {...tool, enabled: !tool.enabled} : tool
        )));
    };

    return (
        <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-orange-50 text-orange-600 rounded-lg">
                            <Code2 className="w-5 h-5"/>
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-800">MCP 设置</h3>
                            <p className="text-xs text-slate-500 mt-1">扫描本机已配置 MCP，也可以接入外部 MCP 服务。</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleScan}
                            disabled={scanning}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 hover:text-orange-600 hover:border-orange-200 rounded-lg text-xs font-medium transition-all shadow-sm disabled:opacity-60"
                        >
                            {scanning ? (
                                <div className="w-3.5 h-3.5 rounded-full border-2 border-orange-200 border-t-orange-500 animate-spin"/>
                            ) : (
                                <Radar className="w-3.5 h-3.5"/>
                            )}
                            扫描系统 MCP
                        </button>
                        <button
                            onClick={openCreateModal}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white rounded-lg text-xs font-medium transition-all shadow-sm shadow-orange-500/20"
                        >
                            <Plus className="w-3.5 h-3.5"/>
                            接入外部 MCP
                        </button>
                    </div>
                </div>
            </div>

            {servers.length === 0 ? (
                <div className="text-center py-14 bg-white rounded-2xl border border-dashed border-slate-200 text-slate-400">
                    <Code2 className="w-8 h-8 mx-auto mb-3 text-slate-300"/>
                    <p className="text-sm">暂无 MCP。可以先扫描系统配置，或手动接入一个外部 MCP。</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-3">
                    {servers.map(server => {
                        const tools = serverTools[server.id] || [];
                        const enabledToolCount = tools.filter(tool => tool.enabled).length;
                        const expanded = expandedServerIds.includes(server.id);

                        return (
                        <div key={server.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm hover:border-orange-200 transition-colors group">
                            <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h4 className="font-bold text-slate-800">{server.name}</h4>
                                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-mono uppercase text-slate-500">
                                            {server.transport === 'streamableHttp' ? 'streamableHttp' : server.transport}
                                        </span>
                                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${server.source === 'system' ? 'border-blue-100 bg-blue-50 text-blue-600' : 'border-emerald-100 bg-emerald-50 text-emerald-600'}`}>
                                            {server.source === 'system' ? '系统扫描' : '外部接入'}
                                        </span>
                                        <button
                                            onClick={() => toggleExpanded(server.id)}
                                            className="inline-flex items-center gap-1 rounded-full border border-orange-100 bg-orange-50 px-2 py-0.5 text-[10px] font-medium text-orange-600 transition-colors hover:border-orange-200 hover:bg-orange-100/70"
                                        >
                                            <Wrench className="h-3 w-3"/>
                                            {enabledToolCount}/{tools.length} Tools
                                            <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`}/>
                                        </button>
                                    </div>
                                    <p className="mt-2 truncate text-xs text-slate-500">
                                        {server.transport === 'stdio'
                                            ? [server.command, ...(server.args || [])].filter(Boolean).join(' ')
                                            : server.url || '未配置 URL'}
                                    </p>
                                    {server.description && (
                                        <p className="mt-1 truncate text-xs text-slate-400">{server.description}</p>
                                    )}
                                </div>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => openEditModal(server)}
                                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                    >
                                        <Edit2 className="w-4 h-4"/>
                                    </button>
                                    <button
                                        onClick={() => onDelete({type: 'mcp', serverId: server.id})}
                                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4"/>
                                    </button>
                                </div>
                            </div>

                            {expanded && (
                                <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3">
                                    <div className="mb-2 flex items-center justify-between">
                                        <div className="text-xs font-semibold text-slate-700">Tool 选择</div>
                                        <button
                                            onClick={() => handleRefreshTools(server.id)}
                                            disabled={refreshingServerId === server.id}
                                            className="flex items-center gap-1 text-[11px] font-medium text-orange-600 hover:text-orange-700 transition-colors disabled:opacity-60"
                                        >
                                            <RefreshCw className={`h-3 w-3 ${refreshingServerId === server.id ? 'animate-spin' : ''}`} />
                                            {refreshingServerId === server.id ? '同步中...' : '同步/刷新 Tools'}
                                        </button>
                                    </div>
                                    {tools.length === 0 ? (
                                        <div className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-4 text-center text-xs text-slate-400">
                                            暂无 Tool
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                            {tools.map(tool => (
                                                <button
                                                    key={tool.name}
                                                    onClick={() => toggleTool(server.id, tool.name)}
                                                    className={`rounded-lg border px-3 py-2 text-left transition-colors ${tool.enabled ? 'border-emerald-100 bg-white text-slate-700' : 'border-slate-200 bg-white/70 text-slate-400'}`}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <span className={`h-2 w-2 rounded-full ${tool.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                                                        <span className="truncate text-xs font-semibold">{tool.name}</span>
                                                    </div>
                                                    {tool.description && (
                                                        <p className="mt-1 truncate pl-4 text-[11px] text-slate-400">
                                                            {tool.description}
                                                        </p>
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                    })}
                </div>
            )}

            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-150">
                    <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">{form.id ? '编辑 MCP' : '接入外部 MCP'}</h3>
                                <p className="text-xs text-slate-500 mt-1">配置 MCP 的连接方式，Agent 可在创建时直接勾选。</p>
                            </div>
                            <button
                                onClick={() => setModalOpen(false)}
                                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                            >
                                <X className="w-5 h-5"/>
                            </button>
                        </div>

                        <div className="p-6 space-y-5">
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">名称</label>
                                <input
                                    value={form.name}
                                    onChange={event => setForm({...form, name: event.target.value})}
                                    placeholder="如：filesystem"
                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">传输方式</label>
                                <SettingsSelect
                                    value={form.transport}
                                    options={transportOptions}
                                    onChange={value => setForm({...form, transport: value})}
                                    accentClassName="bg-orange-50 text-orange-700"
                                />
                            </div>

                            {form.transport === 'stdio' ? (
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-slate-700">启动命令</label>
                                        <input
                                            value={form.command}
                                            onChange={event => setForm({...form, command: event.target.value})}
                                            placeholder="npx / uvx / python"
                                            className="w-full h-11 px-3 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-slate-700">参数</label>
                                        <textarea
                                            value={form.argsText}
                                            onChange={event => setForm({...form, argsText: event.target.value})}
                                            rows={4}
                                            placeholder={'每行一个参数，例如：\n-y\n@modelcontextprotocol/server-filesystem\n/Users/me/Documents'}
                                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm font-mono leading-6 resize-y"
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-slate-700">服务 URL</label>
                                        <input
                                            value={form.url}
                                            onChange={event => setForm({...form, url: event.target.value})}
                                            placeholder={form.transport === 'sse' ? 'https://example.com/sse' : 'https://example.com/mcp'}
                                            className="w-full h-11 px-3 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-slate-700">请求头</label>
                                        <textarea
                                            value={form.headersText}
                                            onChange={event => setForm({...form, headersText: event.target.value})}
                                            rows={4}
                                            placeholder={'Content-Type=application/json\nAuthorization=Bearer token'}
                                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm font-mono leading-6 resize-y"
                                        />
                                        <p className="text-xs text-slate-500">每行一个请求头，格式为 Key=Value。</p>
                                    </div>
                                </div>
                            )}

                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">描述</label>
                                <input
                                    value={form.description}
                                    onChange={event => setForm({...form, description: event.target.value})}
                                    placeholder="这个 MCP 提供什么工具能力"
                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm"
                                />
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
                                {saving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>}
                                保存 MCP
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
