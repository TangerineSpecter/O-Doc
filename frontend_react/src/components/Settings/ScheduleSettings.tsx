import { BellRing, Clock3 } from 'lucide-react';
import { SettingsSelect } from './SettingsSelect';
import type { MemosPushConfig, MemosPushFrequency } from '../../types/api/setting';

interface ScheduleSettingsProps {
    memosPushConfig: MemosPushConfig;
    onMemosPushConfigChange: (config: MemosPushConfig) => void;
}

export const ScheduleSettings = ({ memosPushConfig, onMemosPushConfigChange }: ScheduleSettingsProps) => {
    const frequencyOptions: { value: MemosPushFrequency; label: string; description: string }[] = [
        { value: 'daily', label: '每天', description: '每天在指定时间推送' },
        { value: 'everyTwoDays', label: '每两天', description: '距离上次推送满两天后推送' },
        { value: 'weekly', label: '每周', description: '每周指定星期推送' },
        { value: 'monthly', label: '每月', description: '每月指定日期推送' },
    ];
    const weekdayOptions = [
        { value: '1', label: '周一' },
        { value: '2', label: '周二' },
        { value: '3', label: '周三' },
        { value: '4', label: '周四' },
        { value: '5', label: '周五' },
        { value: '6', label: '周六' },
        { value: '0', label: '周日' },
    ];
    const monthDayOptions = Array.from({ length: 31 }, (_, index) => {
        const value = String(index + 1);
        return { value, label: `${value} 日` };
    });

    return (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-orange-50 text-orange-600 rounded-lg">
                        <BellRing className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-800">Memos 定时推送</h3>
                        <p className="text-xs text-slate-500">按配置随机抽取一条 Memos，推送到系统通知</p>
                    </div>
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-600">
                    <span>开启推送</span>
                    <input
                        type="checkbox"
                        checked={memosPushConfig.enabled}
                        onChange={(event) => onMemosPushConfigChange({
                            ...memosPushConfig,
                            enabled: event.target.checked,
                        })}
                        className="peer sr-only"
                    />
                    <span className="relative h-6 w-11 rounded-full bg-slate-200 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-orange-500 peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-orange-500/20"></span>
                </label>
            </div>

            <div className="h-px bg-slate-100"></div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">推送频率</label>
                    <SettingsSelect
                        value={memosPushConfig.frequency}
                        options={frequencyOptions}
                        onChange={(frequency) => onMemosPushConfigChange({
                            ...memosPushConfig,
                            frequency,
                        })}
                        buttonClassName="h-10 min-h-10 bg-slate-50 text-sm"
                        showSelectedDescription={false}
                    />
                </div>

                {memosPushConfig.frequency === 'weekly' && (
                    <div>
                        <label className="mb-2 block text-sm font-semibold text-slate-700">推送星期</label>
                        <SettingsSelect
                            value={memosPushConfig.weekday}
                            options={weekdayOptions}
                            onChange={(weekday) => onMemosPushConfigChange({
                                ...memosPushConfig,
                                weekday,
                            })}
                            buttonClassName="min-h-10 bg-slate-50 text-sm"
                            showSelectedDescription={false}
                        />
                    </div>
                )}

                {memosPushConfig.frequency === 'monthly' && (
                    <div>
                        <label className="mb-2 block text-sm font-semibold text-slate-700">推送日期</label>
                        <SettingsSelect
                            value={memosPushConfig.monthDay}
                            options={monthDayOptions}
                            onChange={(monthDay) => onMemosPushConfigChange({
                                ...memosPushConfig,
                                monthDay,
                            })}
                            buttonClassName="min-h-10 bg-slate-50 text-sm"
                            showSelectedDescription={false}
                        />
                    </div>
                )}

                <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">推送时间</label>
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
                            className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-700 transition-all focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};
