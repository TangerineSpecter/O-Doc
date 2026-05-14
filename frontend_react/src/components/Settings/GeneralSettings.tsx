import {useState} from 'react';
import { BellRing, Clock3, Monitor, Shield, Type as TypeIcon } from 'lucide-react';
import {SettingsSelect} from './SettingsSelect';
import type {MemosPushConfig, MemosPushFrequency} from '../../types/api/setting';
import {APP_FONT_OPTIONS, AppFontId, getStoredAppFont, saveAndApplyAppFont} from '../../config/fonts';

interface GeneralSettingsProps {
    memosPushConfig: MemosPushConfig;
    onMemosPushConfigChange: (config: MemosPushConfig) => void;
}

export const GeneralSettings = ({memosPushConfig, onMemosPushConfigChange}: GeneralSettingsProps) => {
    const [defaultAccess, setDefaultAccess] = useState<'public' | 'private'>('public');
    const [selectedFont, setSelectedFont] = useState<AppFontId>(() => getStoredAppFont());
    const frequencyOptions: {value: MemosPushFrequency; label: string; description: string}[] = [
        {value: 'daily', label: '每天', description: '每天在指定时间推送'},
        {value: 'everyTwoDays', label: '每两天', description: '距离上次推送满两天后推送'},
        {value: 'weekly', label: '每周', description: '每周指定星期推送'},
        {value: 'monthly', label: '每月', description: '每月指定日期推送'},
    ];
    const weekdayOptions = [
        {value: '1', label: '周一'},
        {value: '2', label: '周二'},
        {value: '3', label: '周三'},
        {value: '4', label: '周四'},
        {value: '5', label: '周五'},
        {value: '6', label: '周六'},
        {value: '0', label: '周日'},
    ];
    const monthDayOptions = Array.from({length: 31}, (_, index) => {
        const value = String(index + 1);
        return {value, label: `${value} 日`};
    });
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

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-orange-50 text-orange-600 rounded-lg"><BellRing className="w-5 h-5" /></div>
                    <div>
                        <h3 className="font-bold text-slate-800">Memos 定时推送</h3>
                        <p className="text-xs text-slate-500">按配置随机抽取一条 Memos，推送到系统通知</p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                    <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-600">
                        <input
                            type="checkbox"
                            checked={memosPushConfig.enabled}
                            onChange={(event) => onMemosPushConfigChange({
                                ...memosPushConfig,
                                enabled: event.target.checked,
                            })}
                            className="h-4 w-4 rounded border-slate-300 accent-orange-500 focus:ring-orange-500/20"
                        />
                        开启
                    </label>
                    <div className="w-36">
                        <SettingsSelect
                            value={memosPushConfig.frequency}
                            options={frequencyOptions}
                            onChange={(frequency) => onMemosPushConfigChange({
                                ...memosPushConfig,
                                frequency,
                            })}
                            buttonClassName="min-h-9 bg-slate-50 text-xs"
                            showSelectedDescription={false}
                        />
                    </div>
                    {memosPushConfig.frequency === 'weekly' && (
                        <div className="w-28">
                            <SettingsSelect
                                value={memosPushConfig.weekday}
                                options={weekdayOptions}
                                onChange={(weekday) => onMemosPushConfigChange({
                                    ...memosPushConfig,
                                    weekday,
                                })}
                                buttonClassName="min-h-9 bg-slate-50 text-xs"
                                showSelectedDescription={false}
                            />
                        </div>
                    )}
                    {memosPushConfig.frequency === 'monthly' && (
                        <div className="w-28">
                            <SettingsSelect
                                value={memosPushConfig.monthDay}
                                options={monthDayOptions}
                                onChange={(monthDay) => onMemosPushConfigChange({
                                    ...memosPushConfig,
                                    monthDay,
                                })}
                                buttonClassName="min-h-9 bg-slate-50 text-xs"
                                showSelectedDescription={false}
                            />
                        </div>
                    )}
                    <div className="relative">
                        <Clock3 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                            type="time"
                            value={memosPushConfig.pushTime}
                            disabled={!memosPushConfig.enabled}
                            onChange={(event) => onMemosPushConfigChange({
                                ...memosPushConfig,
                                pushTime: event.target.value,
                            })}
                            className="h-9 w-36 rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs text-slate-700 transition-all focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                    </div>
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
