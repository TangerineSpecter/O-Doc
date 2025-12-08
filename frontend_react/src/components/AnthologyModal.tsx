import React, { useState, useEffect } from 'react';
import { X, Globe, Lock, Loader2, Save, Plus } from 'lucide-react';
import { AVAILABLE_ICONS } from '../constants/iconList';

export interface AnthologyFormData {
    id?: number; // 编辑时才有
    coll_id?: string; // 编辑时才有
    title: string;
    description: string;
    iconId: string;
    permission: 'public' | 'private';
}

interface CreateAnthologyModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: AnthologyFormData) => Promise<void>;
    initialData?: AnthologyFormData | null; // 传入初始数据即为编辑模式
}

export default function CreateAnthologyModal({
    isOpen,
    onClose,
    onSubmit,
    initialData
}: CreateAnthologyModalProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formData, setFormData] = useState<AnthologyFormData>({
        title: "",
        description: "",
        iconId: "book",
        permission: "public"
    });

    const isEditing = !!initialData;

    // 当打开或初始数据变化时重置表单
    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setFormData(initialData);
            } else {
                setFormData({ title: "", description: "", iconId: "book", permission: "public" });
            }
        }
    }, [isOpen, initialData]);

    const handleSubmit = async () => {
        if (!formData.title) return;
        setIsSubmitting(true);
        try {
            await onSubmit(formData);
            onClose();
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => !isSubmitting && onClose()}></div>
            <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-2 duration-200" onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                    <h3 className="text-lg font-bold text-slate-800">
                        {isEditing ? '编辑文集' : '新建文集'}
                    </h3>
                    <button onClick={onClose} disabled={isSubmitting} className="p-1 rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-5">
                    {/* Title */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-semibold text-slate-700">文集名称 <span className="text-red-500">*</span></label>
                        <input
                            type="text"
                            disabled={isSubmitting}
                            placeholder='请输入文集名称，最多 20 个字'
                            maxLength={20}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm"
                            value={formData.title}
                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                            autoFocus={!isEditing}
                        />
                        <span className={`text-xs ${formData.title.length > 20 ? 'text-red-500' : 'text-slate-500'}`}>{Math.min(formData.title.length, 20)}/20 字</span>
                    </div>

                    {/* Description */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-semibold text-slate-700">简介说明</label>
                        <textarea
                            disabled={isSubmitting}
                            rows={3}
                            placeholder='请在此处输入文集的简介说明，最多支持 100 个字。'
                            maxLength={100}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm resize-none"
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        />
                        <span className={`text-xs ${formData.description.length > 100 ? 'text-red-500' : 'text-slate-500'}`}>{Math.min(formData.description.length, 100)}/100 字</span>
                    </div>

                    {/* Icon Selector */}
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-700">选择图标</label>
                        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent -mx-1 px-1">
                            {AVAILABLE_ICONS.map((item) => (
                                <button
                                    key={item.id}
                                    disabled={isSubmitting}
                                    onClick={() => setFormData({ ...formData, iconId: item.id })}
                                    className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center border transition-all ${formData.iconId === item.id ? 'bg-orange-50 border-orange-500 text-orange-600 ring-2 ring-orange-200' : 'bg-white border-slate-200 text-slate-400 hover:border-orange-300 hover:text-slate-600'}`}
                                >
                                    {React.cloneElement(item.icon, { className: "w-5 h-5" })}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Permission */}
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-700">访问权限</label>
                        <div className="grid grid-cols-2 gap-3">
                            <div
                                onClick={() => !isSubmitting && setFormData({ ...formData, permission: 'public' })}
                                className={`cursor-pointer p-3 border rounded-lg flex items-center gap-3 transition-all ${formData.permission === 'public' ? 'bg-orange-50 border-orange-500 ring-1 ring-orange-500' : 'bg-white border-slate-200 hover:border-slate-300'} ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                <div className={`p-2 rounded-full ${formData.permission === 'public' ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-500'}`}><Globe className="w-4 h-4" /></div>
                                <div><div className="text-sm font-medium text-slate-800">公开文集</div><div className="text-xs text-slate-500">所有访客可见</div></div>
                            </div>
                            <div
                                onClick={() => !isSubmitting && setFormData({ ...formData, permission: 'private' })}
                                className={`cursor-pointer p-3 border rounded-lg flex items-center gap-3 transition-all ${formData.permission === 'private' ? 'bg-orange-50 border-orange-500 ring-1 ring-orange-500' : 'bg-white border-slate-200 hover:border-slate-300'} ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                <div className={`p-2 rounded-full ${formData.permission === 'private' ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-500'}`}><Lock className="w-4 h-4" /></div>
                                <div><div className="text-sm font-medium text-slate-800">私密文集</div><div className="text-xs text-slate-500">仅团队成员可见</div></div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
                    >
                        取消
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={!formData.title || isSubmitting}
                        className="px-4 py-2 text-sm font-medium text-white bg-orange-500 hover:bg-orange-600 active:bg-orange-700 rounded-lg transition-colors shadow-sm disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isSubmitting ? (
                            <><Loader2 className="w-4 h-4 animate-spin" /> {isEditing ? '保存中...' : '创建中...'}</>
                        ) : (
                            <>{isEditing ? <Save className="w-4 h-4" /> : <Plus className="w-4 h-4" />} {isEditing ? '保存修改' : '立即创建'}</>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}