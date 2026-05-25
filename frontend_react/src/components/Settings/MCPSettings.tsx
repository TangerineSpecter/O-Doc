import {useState} from 'react';
import {Code2, Edit2, Plus, Radar, Trash2, X} from 'lucide-react';
import type {MCPServerConfig, MCPTransport} from '@/api/setting';
import {SettingsSelect} from './SettingsSelect';

interface MCPSettingsProps {
    servers: MCPServerConfig[];
    onSave: (server: Partial<MCPServerConfig>) => Promise<boolean>;
    onDelete: (target: { type: 'mcp', serverId: string }) => void;
    onScan: () => Promise<{ count: number, servers: MCPServerConfig[] }>;
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

export const MCPSettings = ({servers, onSave, onDelete, onScan}: MCPSettingsProps) => {
    const [modalOpen, setModalOpen] = useState(false);
    const [form, setForm] = useState<MCPForm>(defaultForm);
    const [saving, setSaving] = useState(false);
    const [scanning, setScanning] = useState(false);

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
        });
        setSaving(false);
        if (success) setModalOpen(false);
    };

    const handleScan = async () => {
        setScanning(true);
        await onScan();
        setScanning(false);
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
                    {servers.map(server => (
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
                        </div>
                    ))}
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
