import {useEffect, useState} from 'react';
import {getFarmRules, saveCropRule} from '../../api/farm';
import type {CropKind, CropRule} from '../../types/api/farm';
import {useToast} from '../common/ToastProvider';
import WorldDialog from './WorldDialog';

export function CropRuleEditor({kind, onClose, onSaved}: {kind: CropKind; onClose: () => void; onSaved: () => void}) {
    const [rule, setRule] = useState<CropRule | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const toast = useToast();

    useEffect(() => {
        let live = true;
        getFarmRules().then(rules => {if (live) setRule(rules.crops[kind]);})
            .catch(() => {if (live) setError('作物规则加载失败，请关闭后重试。');})
            .finally(() => {if (live) setLoading(false);});
        return () => {live = false;};
    }, [kind]);

    const update = (field: keyof CropRule, value: number) => {
        if (rule) setRule({...rule, [field]: value});
    };

    const save = async () => {
        if (!rule) return;
        setSaving(true); setError('');
        try {
            await saveCropRule(kind, {growthSeconds: rule.growthSeconds, seedPrice: rule.seedPrice, yield: rule.yield, salePrice: rule.salePrice});
            toast.success('作物规则已保存');
            onSaved();
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : '保存失败，请检查数值后重试。');
        } finally {setSaving(false);}
    };

    const fields: {key: keyof CropRule; label: string}[] = [
        {key: 'growthSeconds', label: '生长秒数'}, {key: 'seedPrice', label: '种子价'},
        {key: 'yield', label: '产量'}, {key: 'salePrice', label: '回收价'},
    ];
    return <WorldDialog title={`编辑${rule?.name || '作物'}规则`} description="进行中的生长周期仍沿用开始时的配置。" onClose={() => {if (!saving) onClose();}}>
        {loading ? <p className="py-8 text-center text-sm text-slate-400">正在加载作物规则…</p> : rule ? <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {fields.map(field => <label key={field.key} className="block text-xs font-medium text-slate-600">{field.label}
                    <input type="number" min={1} max={1000000} value={rule[field.key] as number} disabled={saving}
                        onChange={event => update(field.key, Number(event.target.value))}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"/>
                </label>)}
            </div>
            {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-600">{error}</p>}
            <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
                <button type="button" disabled={saving} onClick={onClose} className="rounded-lg px-4 py-2 text-xs text-slate-500 hover:bg-slate-50">取消</button>
                <button type="button" disabled={saving} onClick={() => void save()} className="rounded-lg bg-orange-500 px-4 py-2 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-50">{saving ? '正在保存…' : '保存规则'}</button>
            </div>
        </> : <p role="alert" className="py-5 text-sm text-red-600">{error || '作物规则暂不可用。'}</p>}
    </WorldDialog>;
}
