import React, {useState, useEffect} from 'react';
import {X, Save} from 'lucide-react';
import {TagItem} from '../api/tag';

// 定义接口
export interface TagFormData {
    name: string;
    themeId: string;
}

interface ColorTheme {
    id: string;
    label: string;
    bg: string;
    text: string;
    border: string;
    dot: string;
}

interface TagModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: TagFormData) => void;
    editingTag: TagItem | null;
    initialFormData: TagFormData;
    colorThemes: ColorTheme[];
}

export default function TagModal({
                                     isOpen,
                                     onClose,
                                     onSubmit,
                                     editingTag,
                                     initialFormData,
                                     colorThemes
                                 }: TagModalProps) {
    const [formData, setFormData] = useState<TagFormData>(initialFormData);

    useEffect(() => {
        if (isOpen) {
            setFormData(initialFormData);
        }
    }, [isOpen, initialFormData]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (formData.name.trim()) {
            onSubmit(formData);
        }
    };

    // 新增：处理标签名称输入
    const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value.replace(/\s+/g, ''); // 禁止空格
        setFormData({...formData, name: value});
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
                 onClick={onClose}></div>
            <div
                className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
                onClick={e => e.stopPropagation()}>
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <h3 className="text-lg font-bold text-slate-800">
                        {editingTag ? '编辑标签' : '新建标签'}
                    </h3>
                    <button onClick={onClose}
                            className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors">
                        <X className="w-5 h-5"/>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">标签名称 <span
                            className="text-red-500">*</span></label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={handleNameChange}
                            maxLength={10}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                            placeholder="例如：React"
                            autoFocus
                        />
                        {/* 添加字数统计 */}
                        <div className="text-right">
                            <span
                                className={`text-xs ${formData.name.length >= 10 ? 'text-indigo-500 font-medium' : 'text-slate-400'}`}>
                                {formData.name.length}/10 字
                            </span>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">颜色主题</label>
                        <div className="flex flex-wrap gap-2">
                            {colorThemes.map((theme) => (
                                <button
                                    key={theme.id}
                                    type="button"
                                    onClick={() => setFormData({...formData, themeId: theme.id})}
                                    className={`
                                        flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-all
                                        ${formData.themeId === theme.id
                                        ? `${theme.bg} ${theme.text} ${theme.border} ring-1 ring-offset-1 ring-${theme.text.split('-')[1]}-500`
                                        : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}
                                    `}
                                >
                                    <div className={`w-2 h-2 rounded-full ${theme.dot}`}></div>
                                    {theme.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={onClose}
                                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">取消
                        </button>
                        <button type="submit" disabled={!formData.name.trim()}
                                className="px-4 py-2 text-sm text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                            <Save className="w-4 h-4"/>
                            {editingTag ? '保存修改' : '立即创建'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}