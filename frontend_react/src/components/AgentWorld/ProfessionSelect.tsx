import { useEffect, useState } from 'react';
import { getWorldProfessions } from '../../api/agentWorld';
import type { WorldProfession } from '../../types/api/agentWorld';
export function ProfessionSelect({ value, onChange }: { value?: string | null; onChange: (value: string | null) => void }) {
    const [items, setItems] = useState<WorldProfession[]>([]); const [error, setError] = useState('');
    useEffect(() => { let live = true; getWorldProfessions().then(p => { if (live) setItems(p); }).catch(e => { if (live) setError(e.message || '职业加载失败'); }); return () => { live = false; }; }, []);
    return <label className="block text-sm font-semibold text-slate-700">职业<select className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 font-normal" value={value || ''} onChange={e => onChange(e.target.value || null)}><option value="">无职业</option>{items.filter(p => p.enabled || p.id === value).map(p => <option key={p.id} value={p.id}>{p.name}{!p.enabled && '（已停用）'}</option>)}</select>{error && <span className="text-xs text-red-600">{error}</span>}</label>;
}
