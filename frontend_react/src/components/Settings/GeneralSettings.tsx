import {useState} from 'react';
import { Monitor, Shield, Type as TypeIcon } from 'lucide-react';
import {SettingsSelect} from './SettingsSelect';
import {APP_FONT_OPTIONS, AppFontId, getStoredAppFont, saveAndApplyAppFont} from '../../config/fonts';

export const GeneralSettings = () => {
    const [defaultAccess, setDefaultAccess] = useState<'public' | 'private'>('public');
    const [selectedFont, setSelectedFont] = useState<AppFontId>(() => getStoredAppFont());
    const handleFontChange = (fontId: AppFontId) => {
        setSelectedFont(fontId);
        saveAndApplyAppFont(fontId);
    };

    return (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-slate-100 text-slate-600 rounded-lg"><Monitor className="w-5 h-5" /></div>
                    <div>
                        <h3 className="font-bold text-slate-800">界面主题</h3>
                        <p className="text-xs text-slate-500">切换系统的外观显示模式</p>
                    </div>
                </div>
                <div className="flex bg-slate-100 p-1 rounded-lg">
                    <button className="px-3 py-1.5 bg-white shadow-sm rounded text-xs font-medium text-slate-800">浅色</button>
                    <button className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700">深色</button>
                    <button className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700">跟随系统</button>
                </div>
            </div>

            <div className="h-px bg-slate-100"></div>

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-orange-50 text-orange-600 rounded-lg"><TypeIcon className="w-5 h-5" /></div>
                    <div>
                        <h3 className="font-bold text-slate-800">字体设置</h3>
                        <p className="text-xs text-slate-500">调整全站界面和文章详情的显示字体</p>
                    </div>
                </div>
                <div className="w-full sm:w-56">
                    <SettingsSelect
                        value={selectedFont}
                        options={APP_FONT_OPTIONS}
                        onChange={handleFontChange}
                        buttonClassName="min-h-9 bg-slate-50 text-xs"
                    />
                </div>
            </div>

            <div className="h-px bg-slate-100"></div>

            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-orange-50 text-orange-600 rounded-lg"><Shield className="w-5 h-5" /></div>
                    <div>
                        <h3 className="font-bold text-slate-800">安全选项</h3>
                        <p className="text-xs text-slate-500">文集默认访问权限设置</p>
                    </div>
                </div>
                <div className="w-40">
                    <SettingsSelect
                        value={defaultAccess}
                        options={[
                            {value: 'public', label: '默认为公开'},
                            {value: 'private', label: '默认为私有'},
                        ]}
                        onChange={setDefaultAccess}
                        buttonClassName="min-h-9 bg-slate-50 text-xs"
                    />
                </div>
            </div>
        </div>
    );
};
