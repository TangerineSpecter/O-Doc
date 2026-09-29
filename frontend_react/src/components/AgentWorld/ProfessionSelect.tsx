import { useEffect, useMemo, useState } from 'react';
import { Briefcase } from 'lucide-react';
import { getWorldProfessions } from '../../api/agentWorld';
import type { WorldProfession } from '../../types/api/agentWorld';
import { Select, type SelectOption } from '../common/Select';

interface ProfessionSelectProps {
    value?: string | null;
    onChange: (value: string | null) => void;
    label?: string;
    hideLabel?: boolean;
}

export function ProfessionSelect({
    value,
    onChange,
    label = '职业',
    hideLabel = false,
}: ProfessionSelectProps) {
    const [items, setItems] = useState<WorldProfession[]>([]);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let live = true;
        getWorldProfessions()
            .then(p => {
                if (live) setItems(p);
            })
            .catch(e => {
                if (live) setError(e.message || '职业加载失败');
            })
            .finally(() => {
                if (live) setLoading(false);
            });
        return () => {
            live = false;
        };
    }, []);

    const options = useMemo<SelectOption<string>[]>(() => {
        const professionOptions: SelectOption<string>[] = [
            {
                value: '',
                label: '无职业',
                description: '不绑定职业与收益、产量加成',
            },
        ];

        const availableProfessions = items.filter(p => p.enabled || p.id === value);
        for (const p of availableProfessions) {
            professionOptions.push({
                value: p.id,
                label: p.enabled ? p.name : `${p.name}（已停用）`,
                description: p.description || undefined,
                icon: <Briefcase className="w-3.5 h-3.5 text-orange-500 shrink-0" />,
            });
        }

        return professionOptions;
    }, [items, value]);

    return (
        <div className="space-y-2">
            {!hideLabel && (
                <label className="block text-sm font-semibold text-slate-700">
                    {label}
                </label>
            )}
            <Select
                value={value || ''}
                options={options}
                onChange={val => onChange(val ? val : null)}
                placeholder={loading ? '加载职业中…' : '请选择职业（可选）'}
                emptyMessage="暂无可绑定的职业"
                accentClassName="bg-orange-50 text-orange-700 font-medium"
                buttonClassName="bg-slate-50"
                menuPortal={true}
            />
            {error && <span className="text-xs text-red-600 block mt-1">{error}</span>}
        </div>
    );
}
