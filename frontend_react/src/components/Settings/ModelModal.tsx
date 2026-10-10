import { useState } from 'react';
import type {AIModel, ModelInput} from '../../types/api/setting';
import {useModelThinkingCapability} from '../../hooks/useModelThinkingCapability';
import {ModelThinkingFields} from './ModelThinkingFields';
import { ModelType } from '../../api/setting';
import {Eye, ImagePlus, Layers, MessageCircle, SearchCheck, X} from 'lucide-react';
import {useEscapeDismissal} from '../../hooks/useEscapeDismissal';

interface ModelModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialData?: AIModel;
    providerId: string;
    providerType: string;
    onSave: (model: ModelInput) => Promise<boolean>;
}

export const ModelModal = ({ isOpen, onClose, onSave, initialData, providerId, providerType }: ModelModalProps) => {
    const [form, setForm] = useState<ModelInput>(() => ({name: initialData?.name || '', type: initialData?.type || 'chat', thinkingMode: initialData?.thinkingMode || 'default', thinkingProtocol: initialData?.thinkingProtocol || 'auto'}));
    const [saving, setSaving] = useState(false);
    const capability = useModelThinkingCapability(providerId, form.name, form.type, form.thinkingProtocol);
    const modelSupportsThinking = !!capability.data?.supported;
    const supportsManualProtocol = ['NewAPI', 'custom'].includes(providerType);

    const save = async () => {
        setSaving(true);
        try {
            if (await onSave({...form, thinkingMode: modelSupportsThinking ? form.thinkingMode : 'default'})) onClose();
        } finally { setSaving(false); }
    };
    const modelTypeOptions: { type: ModelType; label: string; icon: typeof MessageCircle }[] = [
        {type: 'chat', label: '对话', icon: MessageCircle},
        {type: 'image', label: '图像识别', icon: Eye},
        {type: 'image_generation', label: '生图', icon: ImagePlus},
        {type: 'embedding', label: '向量', icon: Layers},
        {type: 'rerank', label: '重排', icon: SearchCheck},
    ];
    useEscapeDismissal(isOpen, onClose);

    if (!isOpen) return null;

    return (
        <div data-modal-scroll-lock className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose}></div>
            <div className="bg-white rounded-2xl max-h-[90dvh] overflow-y-auto scrollbar-hide shadow-xl shadow-slate-900/15 ring-1 ring-slate-900/5 w-full max-w-sm p-6 relative z-10 animate-in zoom-in-95 duration-200">
                <div className="flex items-center gap-3 mb-5 border-b border-slate-100 pb-4">
                    <div className="p-2 bg-orange-50 text-orange-600 rounded-lg">
                        <Layers className="w-5 h-5"/>
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 flex-1">{initialData ? '编辑模型' : '添加模型'}</h3>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                        <X className="w-4 h-4"/>
                    </button>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1.5">模型名称 (Model ID)</label>
                        <input
                            type="text"
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none"
                            placeholder="例如：gpt-4o, qwen-vl-plus, text-embedding-3"
                            value={form.name}
                            onChange={e => setForm({ ...form, name: e.target.value })}
                        />
                        <p className="text-[10px] text-slate-400 mt-1">需与服务商 API 支持的模型名称一致</p>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1.5">模型功能类型</label>
                        <div className="grid grid-cols-2 gap-2">
                            {modelTypeOptions.map(({type, label, icon: Icon}) => (
                                <button
                                    key={type}
                                    type="button"
                                    onClick={() => setForm({ ...form, type })}
                                    className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs border transition-all ${form.type === type ? 'bg-orange-50 border-orange-500 text-orange-700 font-medium' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                                >
                                    <Icon className="w-3.5 h-3.5"/>
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                    {['chat', 'image'].includes(form.type) && <ModelThinkingFields
                        capability={capability} manualProtocol={supportsManualProtocol}
                        mode={form.thinkingMode} protocol={form.thinkingProtocol}
                        onModeChange={thinkingMode => setForm({...form, thinkingMode})}
                        onProtocolChange={thinkingProtocol => setForm({...form, thinkingProtocol})}
                    />}
                </div>
                <div className="flex justify-end gap-3 mt-6">
                    <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">取消</button>
                    <button disabled={saving || !form.name.trim() || capability.loading || !!capability.error} onClick={save} className="px-4 py-2 text-sm text-white bg-orange-600 hover:bg-orange-700 rounded-lg shadow-sm disabled:opacity-50">{saving ? '保存中…' : '保存'}</button>
                </div>
            </div>
        </div>
    );
};
