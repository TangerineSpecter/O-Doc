import {useEffect, useState} from 'react';
import {X} from 'lucide-react';
import {Select} from '../common/Select';
import type {DecisionConnection, DecisionConnectionInput, DecisionProtocol} from '../../types/api/decision';
import {fieldsAfterProtocolChange} from './decisionConnectionDefaults';

interface DecisionConnectionModalProps {
    isOpen: boolean;
    initialData?: DecisionConnection | null;
    onClose: () => void;
    onSave: (value: DecisionConnectionInput) => Promise<void>;
}

const protocolOptions = [
    {value: 'systemone' as const, label: 'JEV / TypeSafe System One', description: '发送 state/questions，接收 answers'},
    {value: 'openai_chat_json' as const, label: 'OpenAI Chat + JSON 决策', description: '将 state/questions JSON 放入 user content，解析 assistant JSON'},
];

export function DecisionConnectionModal({isOpen, initialData, onClose, onSave}: DecisionConnectionModalProps) {
    const [name, setName] = useState('');
    const [protocol, setProtocol] = useState<DecisionProtocol>('openai_chat_json');
    const [baseUrl, setBaseUrl] = useState('');
    const [modelId, setModelId] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [clearApiKey, setClearApiKey] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!isOpen) return;
        setName(initialData?.name || '');
        setProtocol(initialData?.protocol || 'openai_chat_json');
        setBaseUrl(initialData?.baseUrl || '');
        setModelId(initialData?.modelId || '');
        setApiKey('');
        setClearApiKey(false);
        setError('');
    }, [isOpen, initialData]);

    if (!isOpen) return null;

    const changeProtocol = (next: DecisionProtocol) => {
        const nextFields = fieldsAfterProtocolChange(protocol, next, {baseUrl, modelId});
        setProtocol(next);
        setBaseUrl(nextFields.baseUrl);
        setModelId(nextFields.modelId);
    };

    const submit = async () => {
        if (saving) return;
        setSaving(true);
        setError('');
        const value: DecisionConnectionInput = {name: name.trim(), protocol, baseUrl: baseUrl.trim(), modelId: modelId.trim()};
        if (clearApiKey) value.apiKey = null;
        else if (apiKey.trim()) value.apiKey = apiKey.trim();
        try {
            await onSave(value);
            onClose();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : '保存决策连接失败');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div data-modal-scroll-lock className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <button type="button" aria-label="关闭弹窗" className="absolute inset-0 bg-slate-950/30 backdrop-blur-sm" onClick={onClose}/>
            <section role="dialog" aria-modal="true" aria-labelledby="decision-connection-title" className="relative z-10 max-h-[90vh] w-full max-w-xl overflow-y-auto scrollbar-hide rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
                <header className="mb-5 flex items-center gap-3 border-b border-slate-100 pb-4">
                    <div className="min-w-0 flex-1">
                        <h3 id="decision-connection-title" className="font-bold text-slate-900">{initialData ? '编辑决策模型连接' : '新增决策模型连接'}</h3>
                        <p className="mt-1 text-xs leading-5 text-slate-500">选择模型实际提供的协议。选中 JEV / TypeSafe System One 时，服务地址和模型 ID 会填入 JEV 默认值，仍可修改。名称和 API Key 保持空白。</p>
                    </div>
                    <button type="button" aria-label="关闭" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4"/></button>
                </header>

                <div className="space-y-4">
                    <label className="block space-y-1.5 text-xs font-semibold text-slate-600">
                        <span>连接名称</span>
                        <input value={name} onChange={event => setName(event.target.value)} maxLength={80} placeholder="例如：StartLux 本地决策模型" className="min-h-10 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-700 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"/>
                    </label>
                    <label className="block space-y-1.5 text-xs font-semibold text-slate-600">
                        <span>协议适配器</span>
                        <Select<DecisionProtocol> value={protocol} options={protocolOptions} onChange={changeProtocol} menuPortal/>
                    </label>
                    <label className="block space-y-1.5 text-xs font-semibold text-slate-600">
                        <span>服务地址</span>
                        <input value={baseUrl} onChange={event => setBaseUrl(event.target.value)} placeholder="https://api.example.com/v1 或完整接口地址" className="min-h-10 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs font-normal text-slate-700 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"/>
                        <span className="block font-normal leading-5 text-slate-400">可填写 API 根地址（以 /v1 结尾）或完整接口地址。</span>
                    </label>
                    <label className="block space-y-1.5 text-xs font-semibold text-slate-600">
                        <span>模型 ID</span>
                        <input value={modelId} onChange={event => setModelId(event.target.value)} maxLength={160} placeholder="例如：startlux-decision" className="min-h-10 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm font-normal text-slate-700 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"/>
                    </label>
                    <label className="block space-y-1.5 text-xs font-semibold text-slate-600">
                        <span>API Key <span className="font-normal text-slate-400">（随 WebDAV 同步，可留空）</span></span>
                        <input type="password" autoComplete="new-password" value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder={initialData?.apiKeyConfigured ? '已保存；留空表示不修改' : '填写服务密钥'} className="min-h-10 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm font-normal text-slate-700 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"/>
                    </label>
                    {initialData?.apiKeyConfigured && (
                        <label className="flex items-center gap-2 text-xs text-slate-500">
                            <input type="checkbox" checked={clearApiKey} onChange={event => setClearApiKey(event.target.checked)}/>
                            清除已保存的 API Key
                        </label>
                    )}
                    {error && <p role="alert" className="text-xs leading-5 text-red-600">{error}</p>}
                </div>

                <footer className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4">
                    <button type="button" onClick={onClose} disabled={saving} className="min-h-9 rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50">取消</button>
                    <button type="button" onClick={() => void submit()} disabled={saving || !name.trim() || !baseUrl.trim() || !modelId.trim()} className="min-h-9 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50">{saving ? '保存中…' : '保存连接'}</button>
                </footer>
            </section>
        </div>
    );
}
