import React, { useState, useEffect } from 'react';
import { ModelType } from '../../api/setting';

interface ModelModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (model: { name: string, type: ModelType }) => void;
}

export const ModelModal = ({ isOpen, onClose, onSave }: ModelModalProps) => {
    const [form, setForm] = useState<{ name: string, type: ModelType }>({ name: '', type: 'chat' });

    useEffect(() => {
        if (isOpen) setForm({ name: '', type: 'chat' });
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose}></div>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 relative z-10 animate-in zoom-in-95 duration-200">
                <h3 className="text-lg font-bold text-slate-900 mb-4">添加模型</h3>
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1.5">模型名称 (Model ID)</label>
                        <input
                            type="text"
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none"
                            placeholder="例如：gpt-4o, text-embedding-3"
                            value={form.name}
                            onChange={e => setForm({ ...form, name: e.target.value })}
                        />
                        <p className="text-[10px] text-slate-400 mt-1">需与服务商 API 支持的模型名称一致</p>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1.5">模型功能类型</label>
                        <div className="grid grid-cols-3 gap-2">
                            {(['chat', 'embedding', 'rerank'] as const).map(type => (
                                <button
                                    key={type}
                                    onClick={() => setForm({ ...form, type })}
                                    className={`px-2 py-2 rounded-lg text-xs border transition-all ${form.type === type ? 'bg-orange-50 border-orange-500 text-orange-700 font-medium' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                                >
                                    {type === 'chat' ? '对话' : type === 'embedding' ? '向量' : '重排'}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="flex justify-end gap-3 mt-6">
                    <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">取消</button>
                    <button onClick={() => onSave(form)} className="px-4 py-2 text-sm text-white bg-orange-600 hover:bg-orange-700 rounded-lg shadow-sm">添加</button>
                </div>
            </div>
        </div>
    );
};