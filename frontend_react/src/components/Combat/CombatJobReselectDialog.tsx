import {useEffect, useMemo, useState} from 'react';
import {ShieldAlert, Shuffle, Sparkles} from 'lucide-react';
import WorldDialog from '../AgentWorld/WorldDialog';
import {Select} from '../common/Select';
import {combatCommand, combatKey} from '../../api/combat';
import type {CombatProfile} from '../../types/api/combat';
import type {useCombatActions} from '../../hooks/useCombatActions';

interface ReselectPreview {
    attributes: Record<string, number | string>;
    progression: {level: number; job: string};
    unequipped: string[];
}

const statRows = [
    {key: 'strength', label: '力量'},
    {key: 'dexterity', label: '敏捷'},
    {key: 'intelligence', label: '智力'},
    {key: 'vitality', label: '体质'},
    {key: 'spirit', label: '精神'},
    {key: 'luck', label: '运气'},
    {key: 'hpMax', label: '生命上限'},
    {key: 'mpMax', label: '魔力上限'},
    {key: 'physicalAttack', label: '物理攻击'},
    {key: 'magicAttack', label: '魔法攻击'},
    {key: 'physicalDefense', label: '物理防御'},
    {key: 'magicDefense', label: '魔法防御'},
] as const;

const slotLabels: Record<string, string> = {
    weapon: '武器',
    offhand: '副手',
    head: '头部',
    body: '身体',
    hands: '手部',
    feet: '脚部',
    accessory: '吊坠',
    ring_1: '戒指一',
    ring_2: '戒指二',
};

function value(record: Record<string, number | string>, key: string) {
    const raw = record[key];
    return raw == null || raw === '' ? null : Number(raw);
}

export default function CombatJobReselectDialog({
    profile,
    actions,
    onClose,
}: {
    profile: CombatProfile;
    actions: ReturnType<typeof useCombatActions>;
    onClose: () => void;
}) {
    const currentJob = profile.progression.job;
    const options = useMemo(
        () => profile.reselectOptions.filter(row => row.id !== currentJob).map(row => ({
            value: row.id,
            label: row.name || row.id,
            textLabel: row.name || row.id,
            description: '一转职业',
        })),
        [profile.reselectOptions, currentJob],
    );
    const [job, setJob] = useState(options[0]?.value || '');
    const [preview, setPreview] = useState<{job: string; data: ReselectPreview} | null>(null);
    const [failure, setFailure] = useState<{job: string; message: string} | null>(null);

    useEffect(() => {
        if (!job) return;
        let active = true;
        const controller = new AbortController();
        combatCommand<ReselectPreview>(
            profile.actorId,
            {operation: 'preview_reselect', jobId: job},
            combatKey(),
            controller.signal,
        )
            .then(result => {
                if (active) setPreview({job, data: result});
            })
            .catch((e: unknown) => {
                if (!active || controller.signal.aborted) return;
                setFailure({job, message: e instanceof Error ? e.message : '职业预览失败'});
            });
        return () => {
            active = false;
            controller.abort();
        };
    }, [job, profile.actorId]);

    const data = preview && preview.job === job ? preview.data : null;
    const error = failure && failure.job === job ? failure.message : '';
    const loading = Boolean(job) && !data && !error;

    const confirm = async () => {
        if (!job) return;
        const result = await actions.act({operation: 'reselect_job', jobId: job, reason: '账号管理员更换一转职业'});
        if (result) onClose();
    };

    const currentName = profile.reselectOptions.find(row => row.id === currentJob)?.name || currentJob;
    const targetName = options.find(option => option.value === job)?.textLabel || '';

    return (
        <WorldDialog
            title="更换职业"
            description="保留等级与经验，按新职业的成长重算属性；只在探索空闲时可用。"
            size="compact"
            fixedHeight={false}
            onClose={onClose}
        >
            <div className="space-y-3">
                {options.length === 0 ? (
                    <p className="rounded-xl border border-amber-200/70 bg-amber-50/70 px-3 py-2 text-xs text-amber-800">
                        当前没有可更换的一转职业。
                    </p>
                ) : (
                    <div className="space-y-1.5" role="group" aria-labelledby="combat-reselect-target">
                        <span id="combat-reselect-target" className="text-[11px] font-semibold text-slate-500">目标职业</span>
                        <Select
                            value={job}
                            options={options}
                            onChange={setJob}
                            placeholder="选择一转职业"
                            menuPortal
                            showSelectedDescription={false}
                            disabled={actions.busy}
                        />
                    </div>
                )}

                <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-600">
                    <span className="font-semibold text-slate-800">{currentName}</span>
                    <Shuffle className="h-3.5 w-3.5 text-orange-500" />
                    <span className="font-semibold text-orange-700">{targetName || '待选择'}</span>
                    <span className="text-slate-400">Lv.{profile.progression.level}</span>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white">
                    <div className="flex items-center justify-between border-b border-slate-100 px-3 py-1.5">
                        <span className="text-[11px] font-semibold text-slate-600">属性变化（当前 → 重算后）</span>
                        <span className="text-[10px] text-slate-400">{loading ? '计算中…' : '含当前装备'}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 px-3 py-2">
                        {statRows.map(row => {
                            const before = value(profile.attributes, row.key);
                            const after = value(data?.attributes || {}, row.key);
                            const delta = before != null && after != null ? after - before : 0;
                            return (
                                <div key={row.key} className="flex items-center justify-between text-[11px]">
                                    <span className="text-slate-500">{row.label}</span>
                                    <span className="flex items-center gap-1 font-mono">
                                        <span className="text-slate-400">{before ?? '-'}</span>
                                        <span className="text-slate-300">→</span>
                                        <span className="font-bold text-slate-800">{after ?? '-'}</span>
                                        {delta !== 0 && (
                                            <span className={delta > 0 ? 'text-emerald-600' : 'text-rose-600'}>
                                                {delta > 0 ? '+' : ''}{delta}
                                            </span>
                                        )}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {data && data.unequipped.length > 0 && (
                    <p className="rounded-xl border border-amber-200/70 bg-amber-50/70 px-3 py-2 text-[11px] leading-5 text-amber-800">
                        新职业无法穿戴，将自动卸下：{data.unequipped.map(slot => slotLabels[slot] || slot).join('、')}
                    </p>
                )}

                <p className="flex items-start gap-1.5 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-[11px] leading-5 text-slate-500">
                    <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span>原路线技能会被移除并换成新职业路线技能；二转后不能再用此功能更换一转职业。</span>
                </p>

                {(error || actions.error) && (
                    <p className="rounded-xl border border-rose-200/70 bg-rose-50/70 px-3 py-2 text-[11px] text-rose-700">
                        {error || actions.error}
                    </p>
                )}

                <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                    >
                        取消
                    </button>
                    <button
                        type="button"
                        disabled={!job || Boolean(error) || actions.busy || loading}
                        onClick={() => void confirm()}
                        className="inline-flex items-center gap-1 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <Sparkles className="h-3 w-3" />
                        {actions.busy ? '更换中…' : '确认更换'}
                    </button>
                </div>
            </div>
        </WorldDialog>
    );
}
