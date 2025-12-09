import React, { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import { CategoryItem } from '../api/category';

// 定义颜色主题类型
interface ColorTheme {
    id: string;
    label: string;
    bg: string;
    text: string;
    border: string;
    dot: string;
}

// 定义图标映射类型
interface IconMap {
    [key: string]: React.ReactElement<{ className?: string }>;
}

// 定义表单数据类型
export interface CategoryFormData {
    name: string;
    description: string;
    themeId: string;
    iconKey: string;
}

// 定义组件属性类型
interface CategoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (formData: CategoryFormData) => void;
    editingCategory: CategoryItem | null;
    initialFormData?: CategoryFormData;
    iconMap: IconMap;
    colorThemes: ColorTheme[];
}

const CategoryModal: React.FC<CategoryModalProps> = ({
    isOpen,
    onClose,
    onSubmit,
    editingCategory,
    initialFormData = { name: '', description: '', themeId: 'blue', iconKey: 'Folder' },
    iconMap,
    colorThemes
}) => {
    // 表单数据状态
    const [formData, setFormData] = useState<CategoryFormData>(initialFormData);

    // 当编辑的分类或初始表单数据变化时更新表单
    useEffect(() => {
        if (editingCategory) {
            setFormData({
                name: editingCategory.name,
                description: editingCategory.description,
                themeId: editingCategory.themeId,
                iconKey: editingCategory.iconKey
            });
        } else if (initialFormData) {
            setFormData(initialFormData);
        }
    }, [editingCategory, initialFormData]);

    // 表单字段变化处理
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        let finalValue = value;

        // 如果是名称字段，禁止输入空格
        if (name === 'name') {
            finalValue = value.replace(/\s+/g, '');
        }

        setFormData(prev => ({ ...prev, [name]: finalValue }));
    };

    // 图标选择处理
    const handleIconSelect = (iconKey: string) => {
        setFormData(prev => ({ ...prev, iconKey }));
    };

    // 主题选择处理
    const handleThemeSelect = (themeId: string) => {
        setFormData(prev => ({ ...prev, themeId }));
    };

    // 表单提交处理
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (formData.name.trim()) {
            onSubmit(formData);
        }
    };

    // 如果模态框未打开，不渲染任何内容
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div 
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            ></div>
            <div 
                className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
                onClick={e => e.stopPropagation()}
            >
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <h3 className="text-lg font-bold text-slate-800">
                        {editingCategory ? '编辑分类' : '新建分类'}
                    </h3>
                    <button 
                        onClick={onClose} 
                        className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">分类名称 <span className="text-red-500">*</span></label>
                        <input
                            type="text"
                            name="name"
                            value={formData.name}
                            onChange={handleInputChange}
                            maxLength={10}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                            placeholder="例如：技术文档"
                            autoFocus
                        />
                        <div className="text-right">
                            <span className={`text-xs ${formData.name.length >= 10 ? 'text-orange-500 font-medium' : 'text-slate-400'}`}>
                                {formData.name.length}/10 字
                            </span>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">描述说明</label>
                        <textarea
                            name="description"
                            value={formData.description}
                            onChange={handleInputChange}
                            rows={3}
                            maxLength={100}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all resize-none"
                            placeholder="简要描述该分类下的内容..."
                        />
                        <div className="text-right">
                            <span className={`text-xs ${formData.description.length >= 100 ? 'text-orange-500 font-medium' : 'text-slate-400'}`}>
                                {formData.description.length}/100 字
                            </span>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">选择图标</label>
                        <div className="flex gap-2 overflow-x-auto p-1 pb-2 scrollbar-hide -mx-1 px-1">
                            {Object.keys(iconMap).map(key => (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => handleIconSelect(key)}
                                    className={`p-2 rounded-lg border transition-all flex-shrink-0 ${formData.iconKey === key
                                        ? 'bg-orange-50 border-orange-500 text-orange-600 ring-1 ring-orange-500'
                                        : 'bg-white border-slate-200 text-slate-400 hover:border-orange-200 hover:text-slate-600'
                                        }`}
                                >
                                    {React.cloneElement(iconMap[key], { className: "w-5 h-5" })}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">颜色主题</label>
                        <div className="flex flex-wrap gap-2">
                            {colorThemes.map(theme => (
                                <button
                                    key={theme.id}
                                    type="button"
                                    onClick={() => handleThemeSelect(theme.id)}
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
                        <button 
                            type="button" 
                            onClick={onClose} 
                            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                            取消
                        </button>
                        <button 
                            type="submit" 
                            disabled={!formData.name.trim()} 
                            className="px-4 py-2 text-sm text-white bg-orange-600 hover:bg-orange-700 rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            <Save className="w-4 h-4" />
                            {editingCategory ? '保存修改' : '立即创建'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default CategoryModal;