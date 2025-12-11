import React, { useState, useEffect } from 'react';
import { AIProvider } from '../../api/setting';

interface ProviderModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (provider: Partial<AIProvider>) => void;
    initialData?: Partial<AIProvider> | null;
}

export const ProviderModal = ({ isOpen, onClose, onSave, initialData }: ProviderModalProps) => {
    const [form, setForm] = useState<Partial<AIProvider>>({ name: '', type: 'openai', baseUrl: '', apiKey: '' });

    useEffect(() => {
        if (isOpen) {
            setForm(initialData || { name: '', type: 'openai', baseUrl: '', apiKey: '' });
        }
    }, [isOpen, initialData]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose}></div>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 relative z-10 animate-in zoom-in-95 duration-200">
                <h3 className="text-lg font-bold text-slate-900 mb-4">{initialData?.id ? '编辑服务商' : '添加服务商'}</h3>
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1.5">服务商名称</label>
                        <input
                            type="text"
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none"
                            placeholder="例如：My OpenAI"
                            value={form.name}
                            onChange={e => setForm({ ...form, name: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1.5">类型</label>
                        <select
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none bg-white"
                            value={form.type}
                            onChange={e => setForm({ ...form, type: e.target.value as any })}
                        >
                            <option value="openai">OpenAI</option>
                            <option value="ollama">Ollama</option>
                            <option value="azure">Azure OpenAI</option>
                            <option value="anthropic">Anthropic</option>
                            <option value="custom">Custom (OpenAI Compatible)</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1.5">API Base URL</label>
                        <input
                            type="text"
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none"
                            placeholder="https://api.openai.com/v1"
                            value={form.baseUrl}
                            onChange={e => setForm({ ...form, baseUrl: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1.5">API Key</label>
                        <input
                            type="password"
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none"
                            placeholder="sk-..."
                            value={form.apiKey}
                            onChange={e => setForm({ ...form, apiKey: e.target.value })}
                        />
                    </div>
                </div>
                <div className="flex justify-end gap-3 mt-6">
                    <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">取消</button>
                    <button onClick={() => onSave(form)} className="px-4 py-2 text-sm text-white bg-orange-600 hover:bg-orange-700 rounded-lg shadow-sm">保存</button>
                </div>
            </div>
        </div>
    );
};