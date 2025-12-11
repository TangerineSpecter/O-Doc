import React, { useState, useEffect } from 'react';
import { AIProvider } from '../../api/setting';
import { Server } from 'lucide-react';

interface ProviderModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (provider: Partial<AIProvider>) => void;
    initialData?: Partial<AIProvider> | null;
}

export const ProviderModal = ({ isOpen, onClose, onSave, initialData }: ProviderModalProps) => {
    // 默认值设为 OpenAi
    const [form, setForm] = useState<Partial<AIProvider>>({ name: '', type: 'OpenAi', baseUrl: '', apiKey: '' });

    useEffect(() => {
        if (isOpen) {
            setForm(initialData || { name: '', type: 'OpenAi', baseUrl: '', apiKey: '' });
        }
    }, [isOpen, initialData]);

    if (!isOpen) return null;

    // 预设的 Base URL 逻辑
    const handleTypeChange = (newType: any) => {
        let defaultBaseUrl = form.baseUrl;
        // 如果用户没填或者填的是旧的默认值，则自动切换 BaseURL
        if (!form.baseUrl || form.baseUrl.includes('api.')) {
            switch (newType) {
                case 'OpenAi': defaultBaseUrl = 'https://api.openai.com/v1'; break;
                case 'DeepSeek': defaultBaseUrl = 'https://api.deepseek.com/v1'; break;
                case 'Qwen': defaultBaseUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1'; break;
                case 'Ollama': defaultBaseUrl = 'http://localhost:11434/v1'; break;
                case 'Google AI': defaultBaseUrl = 'https://generativelanguage.googleapis.com/v1beta/openai/'; break;
                case 'Doubao': defaultBaseUrl = 'https://ark.cn-beijing.volces.com/api/v3'; break;
            }
        }
        setForm({ ...form, type: newType, baseUrl: defaultBaseUrl });
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose}></div>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 relative z-10 animate-in zoom-in-95 duration-200">
                <div className="flex items-center gap-3 mb-6 border-b border-slate-100 pb-4">
                    <div className="p-2 bg-slate-100 rounded-lg">
                        <Server className="w-5 h-5 text-slate-600" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900">{initialData?.id ? '编辑服务商' : '添加模型服务商'}</h3>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1.5">模型类型 (Type)</label>
                        <select
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none bg-white"
                            value={form.type}
                            onChange={e => handleTypeChange(e.target.value)}
                        >
                            <option value="OpenAi">OpenAI</option>
                            <option value="Google AI">Google AI (Gemini)</option>
                            <option value="DeepSeek">DeepSeek (深度求索)</option>
                            <option value="Qwen">Qwen (通义千问)</option>
                            <option value="Doubao">Doubao (豆包)</option>
                            <option value="Ollama">Ollama (Local)</option>
                            <option value="custom">Custom (OpenAI Compatible)</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1.5">服务商名称</label>
                        <input
                            type="text"
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none"
                            placeholder="自定义显示的名称"
                            value={form.name}
                            onChange={e => setForm({...form, name: e.target.value})}
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1.5">API Base URL</label>
                        <input
                            type="text"
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none font-mono"
                            placeholder="https://..."
                            value={form.baseUrl}
                            onChange={e => setForm({...form, baseUrl: e.target.value})}
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1.5">API Key</label>
                        <input
                            type="password"
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none font-mono"
                            placeholder="sk-..."
                            value={form.apiKey}
                            onChange={e => setForm({...form, apiKey: e.target.value})}
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-slate-50">
                    <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">取消</button>
                    <button onClick={() => onSave(form)} className="px-4 py-2 text-sm text-white bg-orange-600 hover:bg-orange-700 rounded-lg shadow-sm transition-colors">保存配置</button>
                </div>
            </div>
        </div>
    );
};