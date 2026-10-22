import {useState} from 'react';
import {getFishingConfig, saveFishingConfig} from '../../../api/fishing';
import {getLotteryConfig, saveLotteryConfig} from '../../../api/lottery';
import {getSocialConfiguration, saveSocialConfiguration} from '../../../api/social';
import {useActivityConfiguration} from '../../../hooks/useActivityConfiguration';
import type {LotteryConfig} from '../../../types/api/lottery';
import SocialSettingsDialog from '../../AgentWorld/SocialSettingsDialog';
import {ActivityConfigCard} from './ActivityConfigCard';

const writeFishing = (value: {enabled: boolean}) => saveFishingConfig(value.enabled);
const writeLottery = (value: LotteryConfig) => saveLotteryConfig(value.enabled);

export function FishingActivityCard() {
    const state = useActivityConfiguration(getFishingConfig, writeFishing);
    return <ActivityConfigCard title="居民钓鱼" guides={['fishing']} description="在空档选择钓点、鱼饵和时长，逐竿复核体力；关闭后，进行中的钓鱼会结束并退还剩余鱼饵。"
        enabled={state.value?.enabled ?? null} busy={state.saving} loading={state.loading} error={state.error}
        onRetry={state.reload} onToggle={() => {if (state.value) void state.save({...state.value, enabled: !state.value.enabled});}}/>;
}

export function LotteryActivityCard() {
    const state = useActivityConfiguration(getLotteryConfig, writeLottery);
    return <ActivityConfigCard title="大乐透" guides={['lottery']} description="由主日程安排购票，遵守期次、停售时间和购票额度。关闭后不再安排购票，已售彩票仍正常开奖兑奖。"
        enabled={state.value?.enabled ?? null} busy={state.saving} loading={state.loading} error={state.error}
        onRetry={state.reload} onToggle={() => {if (state.value) void state.save({...state.value, enabled: !state.value.enabled});}}/>;
}

export function SocialActivityCard() {
    const state = useActivityConfiguration(getSocialConfiguration, saveSocialConfiguration);
    const [open, setOpen] = useState(false);
    const settings = state.value?.settings;
    return <>
        <ActivityConfigCard title="朋友圈与小剧场" guides={['social', 'theatre']} description="按社交机会、日终和新闻场次独立安排。参与居民、朋友圈发布与回应、小剧场每日场数在这里统一配置。"
            enabled={settings?.enabled ?? null} busy={state.saving} loading={state.loading} error={state.error} onRetry={state.reload}
            onToggle={() => {if (state.value && settings) void state.save({...state.value, settings: {...settings, enabled: !settings.enabled}});}}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] text-slate-500">{settings ? `小剧场：${settings.theatreDailyCount > 0 ? `每天最多 ${settings.theatreDailyCount} 场${settings.enabled ? '' : ' · 等待开启社交'}` : '自动安排已关闭'}` : '小剧场状态未知'}</span>
                <button type="button" disabled={state.loading || state.saving || !settings} onClick={() => setOpen(true)} className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">配置社交与小剧场</button>
            </div>
        </ActivityConfigCard>
        {open && <SocialSettingsDialog onClose={() => setOpen(false)} onSaved={state.reload}/>}
    </>;
}
