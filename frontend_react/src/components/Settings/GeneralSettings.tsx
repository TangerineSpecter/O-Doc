import {useEffect, useState} from 'react';
import { Image, Monitor, Shield, Type as TypeIcon } from 'lucide-react';
import {SettingsSelect} from './SettingsSelect';
import {APP_FONT_OPTIONS, AppFontId, getStoredAppFont, saveAndApplyAppFont} from '../../config/fonts';
import {getImageUploadConfig, ImageUploadConfig, saveImageUploadConfig} from '../../api/setting';
import {useToast} from '../common/ToastProvider';

const DEFAULT_IMAGE_UPLOAD_CONFIG: ImageUploadConfig = { maxLongEdge: 2048, maxFileSizeMb: 10 };

export const GeneralSettings = () => {
    const [defaultAccess, setDefaultAccess] = useState<'public' | 'private'>('public');
    const [selectedFont, setSelectedFont] = useState<AppFontId>(() => getStoredAppFont());
    const [imageUploadConfig, setImageUploadConfig] = useState<ImageUploadConfig>(DEFAULT_IMAGE_UPLOAD_CONFIG);
    const [isSavingImageConfig, setIsSavingImageConfig] = useState(false);
    const toast = useToast();

    useEffect(() => {
        getImageUploadConfig().then(setImageUploadConfig).catch(() => {
            toast.error('加载图片上传设置失败');
        });
    }, []);

    const handleFontChange = (fontId: AppFontId) => {
        setSelectedFont(fontId);
        saveAndApplyAppFont(fontId);
    };

    const saveImageConfig = async () => {
        const maxLongEdge = Math.round(Number(imageUploadConfig.maxLongEdge));
        const maxFileSizeMb = Number(imageUploadConfig.maxFileSizeMb);
        if (!Number.isFinite(maxLongEdge) || maxLongEdge < 256 || maxLongEdge > 16384 || !Number.isFinite(maxFileSizeMb) || maxFileSizeMb < 0.5 || maxFileSizeMb > 100) {
            toast.error('最长边请输入 256–16384px，文件大小请输入 0.5–100MB');
            return;
        }
        try {
            setIsSavingImageConfig(true);
            const config = await saveImageUploadConfig({maxLongEdge, maxFileSizeMb});
            setImageUploadConfig(config);
            toast.success('图片上传设置已保存');
        } catch (error) {
            console.error('保存图片上传设置失败:', error);
            toast.error('保存图片上传设置失败');
        } finally {
            setIsSavingImageConfig(false);
        }
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

            <div className="space-y-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-orange-50 text-orange-600 rounded-lg"><Image className="w-5 h-5" /></div>
                    <div>
                        <h3 className="font-bold text-slate-800">图片文集上传</h3>
                        <p className="text-xs text-slate-500">图片超过任一阈值时，上传前提示等比缩放或裁切处理</p>
                    </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                    <label className="block text-sm font-semibold text-slate-700">
                        最大边（px）
                        <input
                            type="number"
                            min="256"
                            max="16384"
                            value={imageUploadConfig.maxLongEdge}
                            onChange={(event) => setImageUploadConfig(current => ({...current, maxLongEdge: Number(event.target.value)}))}
                            className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-all focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                        />
                    </label>
                    <label className="block text-sm font-semibold text-slate-700">
                        最大文件大小（MB）
                        <input
                            type="number"
                            min="0.5"
                            max="100"
                            step="0.5"
                            value={imageUploadConfig.maxFileSizeMb}
                            onChange={(event) => setImageUploadConfig(current => ({...current, maxFileSizeMb: Number(event.target.value)}))}
                            className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-all focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                        />
                    </label>
                    <button onClick={saveImageConfig} disabled={isSavingImageConfig} className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60">
                        {isSavingImageConfig ? '保存中…' : '保存设置'}
                    </button>
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
