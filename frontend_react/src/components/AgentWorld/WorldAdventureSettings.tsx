import {useEffect, useState} from 'react';
import {Clock3, Loader2, Save, Swords} from 'lucide-react';
import {getCombatConfig, setCombatConfig} from '../../api/combat';
import {useToast} from '../common/ToastProvider';
import type {CombatHistoryStorage} from '../../types/api/combat';
import {WorldAdventureHistory} from './WorldAdventureHistory';

const MIN_DAILY_MINUTES = 30;
const MAX_DAILY_MINUTES = 1440;

export function WorldAdventureSettings() {
    const toast = useToast();
    const [dailyMinutes, setDailyMinutes] = useState<number | ''>('');
    const [savedMinutes, setSavedMinutes] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [revision, setRevision] = useState(0);
    const [historyStorage, setHistoryStorage] = useState<CombatHistoryStorage>();

    useEffect(() => {
        const controller = new AbortController();
        let active = true;
        setLoading(true);
        getCombatConfig(controller.signal)
            .then(config => {
                if (!active) return;
                setDailyMinutes(config.dailyMinutes);
                setSavedMinutes(config.dailyMinutes);
                setHistoryStorage(config.historyStorage);
                setError('');
            })
            .catch(value => {
                if (active) setError(value instanceof Error ? value.message : '冒险设置加载失败');
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
            controller.abort();
        };
    }, [revision]);

    const numericMinutes = Number(dailyMinutes);
    const validMinutes = Number.isInteger(numericMinutes)
        && numericMinutes >= MIN_DAILY_MINUTES
        && numericMinutes <= MAX_DAILY_MINUTES;
    const hasChanges = savedMinutes !== null && numericMinutes !== savedMinutes;

    const save = async () => {
        if (!validMinutes) return;
        setSaving(true);
        setError('');
        try {
            const config = await setCombatConfig({dailyMinutes: numericMinutes});
            setDailyMinutes(config.dailyMinutes);
            setSavedMinutes(config.dailyMinutes);
            toast.success('冒险设置已保存');
        } catch (value) {
            const message = value instanceof Error ? value.message : '保存冒险设置失败';
            setError(message);
            toast.error(message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                    <Swords className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold text-slate-800">迷宫探索限制</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                        设定每位居民每天可实际推进探索的累计时长上限。它不是晚间出发截止时间；更换迷宫或重新出发不会重置额度。
                    </p>
                </div>
            </div>

            <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50/70 p-4">
                <div className="flex items-start gap-2 text-slate-700">
                    <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
                    <div className="space-y-1 text-xs leading-5">
                        <p>已出发后的实际探索时间会累计；未出发的准备失败不计入，跨午夜的部分归入次日。</p>
                        <p className="text-slate-500">单次探索仍可选择 30、60 或 120 分钟。每日上限范围为 30～1440 分钟。</p>
                    </div>
                </div>
            </div>

            <form
                className="mt-5 flex flex-col gap-4 border-t border-slate-100 pt-5 sm:flex-row sm:items-end sm:justify-between"
                onSubmit={event => {
                    event.preventDefault();
                    void save();
                }}
            >
                <div className="w-full max-w-sm space-y-2">
                    <label htmlFor="world-daily-exploration-limit" className="block text-sm font-semibold text-slate-700">
                        每日累计探索上限
                    </label>
                    <div className="relative">
                        <input
                            id="world-daily-exploration-limit"
                            type="number"
                            inputMode="numeric"
                            min={MIN_DAILY_MINUTES}
                            max={MAX_DAILY_MINUTES}
                            step={1}
                            required
                            value={dailyMinutes}
                            disabled={loading || saving || savedMinutes === null}
                            aria-describedby="world-daily-exploration-limit-help"
                            onChange={event => setDailyMinutes(event.target.value === '' ? '' : Number(event.target.value))}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 pr-16 text-sm font-mono text-slate-800 transition-all focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                        />
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-400">分钟/天</span>
                    </div>
                    <p id="world-daily-exploration-limit-help" className="text-xs text-slate-500">
                        {loading
                            ? '正在读取当前额度…'
                            : savedMinutes === null
                                ? '尚未读取当前额度，重试加载后再修改。'
                                : `当前已保存：每位居民每天 ${savedMinutes} 分钟`}
                    </p>
                </div>

                <div className="flex flex-col items-start gap-2 sm:items-end">
                    {error && (
                        <p role="alert" className="text-xs leading-5 text-red-600">
                            {error}
                            {savedMinutes === null && (
                                <button type="button" onClick={() => setRevision(value => value + 1)} className="ml-2 font-medium underline underline-offset-2">
                                    重试加载
                                </button>
                            )}
                        </p>
                    )}
                    {dailyMinutes !== '' && !validMinutes && (
                        <p role="alert" className="text-xs text-amber-700">请输入 30～1440 之间的整数分钟。</p>
                    )}
                    <button
                        type="submit"
                        disabled={loading || saving || !hasChanges || !validMinutes}
                        className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        {saving ? '保存中…' : '保存限额'}
                    </button>
                </div>
            </form>
            <WorldAdventureHistory storage={historyStorage}/>
        </section>
    );
}
