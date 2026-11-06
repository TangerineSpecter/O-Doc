import {useState} from 'react';
import {Clock, Database, Sliders, X} from 'lucide-react';
import {savePerformancePolicy} from '@/api/performance';
import type {PerformancePolicy} from '@/types/performance';
import {useEscapeDismissal} from '@/hooks/useEscapeDismissal';
import {Checkbox} from '@/components/common/Checkbox';

interface FieldConfig {
    key: keyof Omit<PerformancePolicy, 'enabled' | 'version' | 'generation'>;
    label: string;
    unit: string;
    hint?: string;
}

const thresholdFields: FieldConfig[] = [
    {key: 'requestMs', label: '普通接口慢阈值', unit: 'ms', hint: '单次普通 HTTP 请求耗时'},
    {key: 'streamMs', label: '流式总时长阈值', unit: 'ms', hint: '流式请求全量传输完成'},
    {key: 'firstChunkMs', label: '流式首块响应阈值', unit: 'ms', hint: '流式首个数据块到达'},
    {key: 'sqlMs', label: '单次 SQL 慢阈值', unit: 'ms', hint: '单个 SQL 语句执行耗时'},
    {key: 'sqlTotalMs', label: 'SQL 累计耗时阈值', unit: 'ms', hint: '单次请求内的 SQL 耗时之和'},
    {key: 'sqlCount', label: 'SQL 触发次数阈值', unit: '次', hint: '单次请求内执行 SQL 次数'},
    {key: 'aiMs', label: '模型调用总时长阈值', unit: 'ms', hint: 'AI 模型完整调用耗时'},
    {key: 'firstOutputMs', label: '模型首输出阈值', unit: 'ms', hint: 'AI 开始吐出有效内容或思考'},
    {key: 'taskMs', label: '后台任务执行阈值', unit: 'ms', hint: '周期与后台任务耗时'},
    {key: 'httpMs', label: '外部调用阈值', unit: 'ms', hint: '发送给第三方的网络请求耗时'},
];

const storageFields: FieldConfig[] = [
    {key: 'sampleDays', label: '明细样本保留', unit: '天', hint: '超出天数将自动清理'},
    {key: 'aggregateDays', label: '统计聚合保留', unit: '天', hint: '聚合指标历史记录天数'},
    {key: 'maxMb', label: '本地容量预算', unit: 'MiB', hint: '达到上限优先淘汰旧样本'},
];

const allKeys: (keyof Omit<PerformancePolicy, 'enabled' | 'version' | 'generation'>)[] = [
    'requestMs', 'sqlMs', 'sqlTotalMs', 'sqlCount',
    'streamMs', 'firstChunkMs', 'aiMs', 'firstOutputMs',
    'taskMs', 'httpMs', 'sampleDays', 'aggregateDays', 'maxMb'
];

export function PerformancePolicyDialog({
    policy,
    onClose,
    onSaved,
}: {
    policy: PerformancePolicy;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [draft, setDraft] = useState(policy);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEscapeDismissal(!busy, onClose);

    const save = async () => {
        const changes: Partial<PerformancePolicy> = {enabled: draft.enabled};
        for (const key of allKeys) {
            const val = draft[key];
            if (!Number.isInteger(val) || val < 1) {
                setError('所有阈值与保留策略必须是正整数。');
                return;
            }
            changes[key] = val;
        }
        setBusy(true);
        setError('');
        try {
            await savePerformancePolicy(changes);
            onSaved();
            onClose();
        } catch {
            setError('保存失败，请检查数值范围或稍后重试。');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div data-modal-scroll-lock className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-xs p-4 flex items-center justify-center animate-in fade-in duration-200">
            <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="performance-policy-title"
                className="bg-white rounded-2xl border border-slate-200 w-full max-w-2xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
            >
                {/* Header */}
                <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
                    <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-50 text-orange-600 border border-orange-100/60 shrink-0">
                            <Sliders className="h-4.5 w-4.5" />
                        </div>
                        <div>
                            <h2 id="performance-policy-title" className="font-bold text-slate-800 text-base">
                                性能采集设置
                            </h2>
                            <p className="text-xs text-slate-500 mt-0.5">
                                控制各类型耗时触发慢操作采样的阈值与本机保留容量
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        disabled={busy}
                        onClick={onClose}
                        aria-label="关闭采集设置"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto scrollbar-hide space-y-6 text-slate-700">
                    {/* 启用开关卡片 */}
                    <div className="bg-slate-50/70 border border-slate-200/80 rounded-xl p-4 transition-all">
                        <div className="flex items-start gap-3">
                            <Checkbox
                                id="performance-enable-checkbox"
                                checked={draft.enabled}
                                onChange={checked => setDraft({...draft, enabled: checked})}
                                label={<span className="font-semibold text-slate-800 text-sm">启用当前部署的性能采集</span>}
                            />
                        </div>
                        <p className="mt-2 text-xs text-slate-500 pl-6 leading-relaxed">
                            仅在当前部署的本机保存，不参与 WebDAV 云端同步。修改策略后约 5 秒内广播同步至本机所有工作进程。
                        </p>
                    </div>

                    {/* 阈值分组 */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-orange-500 shrink-0" />
                            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                                慢操作耗时阈值
                            </h3>
                            <span className="text-[11px] text-slate-400 font-normal">（超过阈值将记录详细样本）</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                            {thresholdFields.map(({key, label, unit, hint}) => (
                                <div
                                    key={key}
                                    className="bg-white border border-slate-200/80 rounded-xl p-3 hover:border-slate-300 transition-all focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-500/20"
                                >
                                    <div className="flex items-center justify-between gap-2 mb-1.5">
                                        <label htmlFor={`policy-input-${key}`} className="text-xs font-semibold text-slate-700">
                                            {label}
                                        </label>
                                        <span className="text-[10px] text-slate-400 shrink-0 font-medium">{hint}</span>
                                    </div>
                                    <div className="relative flex items-center">
                                        <input
                                            id={`policy-input-${key}`}
                                            type="number"
                                            min={1}
                                            value={draft[key]}
                                            onChange={e => setDraft({...draft, [key]: Number(e.target.value)})}
                                            className="w-full bg-slate-50/60 rounded-lg px-2.5 py-1.5 text-xs font-mono font-medium text-slate-800 border border-slate-200/60 focus:outline-none focus:bg-white pr-9"
                                        />
                                        <span className="absolute right-2.5 text-[11px] font-medium text-slate-400 select-none">
                                            {unit}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 存储容量分组 */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <Database className="w-4 h-4 text-orange-500 shrink-0" />
                            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                                存储与清理策略
                            </h3>
                            <span className="text-[11px] text-slate-400 font-normal">（超出限制自动分批清理最旧数据）</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                            {storageFields.map(({key, label, unit, hint}) => (
                                <div
                                    key={key}
                                    className="bg-white border border-slate-200/80 rounded-xl p-3 hover:border-slate-300 transition-all focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-500/20"
                                >
                                    <div className="flex items-center justify-between gap-2 mb-1.5">
                                        <label htmlFor={`policy-input-${key}`} className="text-xs font-semibold text-slate-700 truncate">
                                            {label}
                                        </label>
                                    </div>
                                    <div className="relative flex items-center">
                                        <input
                                            id={`policy-input-${key}`}
                                            type="number"
                                            min={1}
                                            value={draft[key]}
                                            onChange={e => setDraft({...draft, [key]: Number(e.target.value)})}
                                            className="w-full bg-slate-50/60 rounded-lg px-2.5 py-1.5 text-xs font-mono font-medium text-slate-800 border border-slate-200/60 focus:outline-none focus:bg-white pr-10"
                                        />
                                        <span className="absolute right-2.5 text-[11px] font-medium text-slate-400 select-none">
                                            {unit}
                                        </span>
                                    </div>
                                    <p className="mt-1 text-[10px] text-slate-400 truncate">{hint}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {error && (
                        <div role="alert" className="bg-red-50 text-red-700 border border-red-200/80 rounded-xl p-3 text-xs flex items-center gap-2">
                            <span className="font-medium">{error}</span>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-slate-50/80 border-t border-slate-100 flex items-center justify-end gap-3">
                    <button
                        type="button"
                        disabled={busy}
                        onClick={onClose}
                        className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors whitespace-nowrap shrink-0"
                    >
                        取消
                    </button>
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => void save()}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-600 active:bg-orange-700 disabled:opacity-50 text-white rounded-xl text-xs font-medium transition-all shadow-sm shadow-orange-500/20 active:scale-95 whitespace-nowrap shrink-0"
                    >
                        {busy ? '正在保存…' : '保存采集设置'}
                    </button>
                </div>
            </section>
        </div>
    );
}
