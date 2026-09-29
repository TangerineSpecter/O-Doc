import { useState } from 'react';
import { Briefcase, Loader2, X, Sparkles } from 'lucide-react';
import type { WorldBonus, WorldCategory, WorldProfession } from '../../types/api/agentWorld';
import { useEscapeDismissal } from '../../hooks/useEscapeDismissal';
import { Checkbox } from '../common/Checkbox';
import {useProfessionDescription} from '../../hooks/useProfessionDescription';

interface WorldProfessionModalProps {
    profession?: Partial<WorldProfession>;
    categories: WorldCategory[];
    saving: boolean;
    onClose: () => void;
    onSave: (profession: Partial<WorldProfession>) => Promise<void>;
}

export function WorldProfessionModal({
    profession,
    categories,
    saving,
    onClose,
    onSave,
}: WorldProfessionModalProps) {
    const [name, setName] = useState(profession?.name ?? '');
    const [description, setDescription] = useState(profession?.description ?? '');
    const [farmYieldPercentage, setFarmYieldPercentage] = useState(profession?.farmYieldPercentage ?? '0');
    const ai = useProfessionDescription();
    const [bonuses, setBonuses] = useState<WorldBonus[]>(
        () => (profession?.bonuses ? profession.bonuses.map(b => ({ ...b })) : [])
    );

    useEscapeDismissal(true, () => {
        if (!saving) onClose();
    });

    const isEdit = Boolean(profession?.id);

    const handleToggleCategory = (catId: string, checked: boolean) => {
        if (checked) {
            setBonuses(prev => [...prev, { category: catId, percentage: '0' }]);
        } else {
            setBonuses(prev => prev.filter(b => b.category !== catId));
        }
    };

    const handleUpdateBonus = (catId: string, percentage: string) => {
        setBonuses(prev => prev.map(b => (b.category === catId ? { ...b, percentage } : b)));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim() || ai.generating) return;
        await onSave({
            ...(profession?.id ? { id: profession.id } : {}),
            name: name.trim(),
            description: description.trim(),
            ...(profession?.id ? {} : {enabled: true}),
            farmYieldPercentage,
            bonuses,
        });
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm animate-in fade-in duration-200"
            role="dialog"
            aria-modal="true"
            aria-labelledby="profession-modal-title"
        >
            <div className="w-full max-w-xl max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-xl border border-slate-100 animate-in zoom-in-95 duration-150">
                {/* 头部 */}
                <div className="flex items-center justify-between p-6 pb-4 border-b border-slate-100 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-orange-50 text-orange-600 rounded-lg">
                            <Briefcase className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 id="profession-modal-title" className="font-bold text-slate-800">
                                {isEdit ? '编辑职业' : '新增职业'}
                            </h3>
                            <p className="text-xs text-slate-500 mt-0.5">
                                配置帖子收益与农场产量，两类加成独立生效
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                        className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors disabled:opacity-50"
                        aria-label="关闭"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* 表单滚动内容 */}
                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                            职业名称 <span className="text-orange-500">*</span>
                        </label>
                        <input
                            type="text"
                            required
                            disabled={ai.generating}
                            maxLength={50}
                            placeholder="例如：财经分析师、科技博主、旅行摄影师"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                        />
                    </div>

                    <div>
                        <div className="mb-1.5 flex items-center justify-between gap-3">
                            <label htmlFor="profession-description" className="text-xs font-semibold text-slate-700">职业说明</label>
                            <button type="button" disabled={!name.trim() || saving || ai.generating}
                                onClick={() => void ai.generate({name: name.trim(), farmYieldPercentage: farmYieldPercentage || '0', categories: categories.filter(c => bonuses.some(b => b.category === c.id)).map(c => c.name)}, setDescription)}
                                className="inline-flex items-center gap-1 rounded-lg bg-orange-50 px-2 py-1 text-xs font-medium text-orange-600 disabled:opacity-50">
                                {ai.generating ? <Loader2 className="h-3 w-3 animate-spin"/> : <Sparkles className="h-3 w-3"/>}{ai.generating ? '生成中…' : 'AI生成'}
                            </button>
                        </div>
                        <textarea
                            id="profession-description"
                            disabled={ai.generating}
                            rows={3}
                            placeholder="简短描述该职业的职责或定位（选填）"
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-sm text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all resize-none"
                        />
                        {ai.error && <p role="alert" className="mt-2 text-xs text-red-600">{ai.error}</p>}
                    </div>

                    <div className="rounded-xl border border-lime-200 bg-lime-50/40 p-4">
                        <label htmlFor="farm-yield-percentage" className="block text-xs font-semibold text-slate-700">农场产量加成 (%)</label>
                        <input id="farm-yield-percentage" type="number" min="0" step="0.0001" required
                            value={farmYieldPercentage} onChange={e => setFarmYieldPercentage(e.target.value)}
                            className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800" />
                        <p className="mt-2 text-xs leading-5 text-slate-500">0 表示无增产。覆盖作物、鸡蛋、羊毛、牛奶等收获产物；不足1个的加成按居民和具体产物分别累计，品质分别计算。购买、交易、赠送不产生加成。</p>
                    </div>

                    {/* 分类收益加成配置 */}
                    <div className="pt-2 border-t border-slate-100">
                        <div className="mb-3">
                            <label className="block text-xs font-semibold text-slate-700">
                                帖子分类收益加成 (%)
                            </label>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                                勾选要产生加成的分类，并填写百分比数值（如填写 15 表示获得 15% 额外收益）
                            </p>
                        </div>

                        {categories.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
                                暂无可选分类，请先在“分类管理”中创建分类
                            </div>
                        ) : (
                            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                                {categories.map(c => {
                                    const bonus = bonuses.find(b => b.category === c.id);
                                    const isChecked = Boolean(bonus);
                                    return (
                                        <div
                                            key={c.id}
                                            className={`flex items-center justify-between gap-3 p-3 rounded-xl border transition-all ${
                                                isChecked
                                                    ? 'border-orange-200 bg-orange-50/30'
                                                    : 'border-slate-200/80 bg-slate-50/40 hover:bg-slate-50'
                                            }`}
                                        >
                                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                                <Checkbox
                                                    checked={isChecked}
                                                    onChange={checked => handleToggleCategory(c.id, checked)}
                                                    label={c.name}
                                                    labelClassName="text-xs font-semibold text-slate-700 truncate"
                                                />
                                                {!c.enabled && (
                                                    <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
                                                        已停用
                                                    </span>
                                                )}
                                            </div>

                                            {isChecked && (
                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    <span className="text-xs text-slate-400">+</span>
                                                    <div className="relative">
                                                        <input
                                                            aria-label={`${c.name}收益加成`}
                                                            type="number"
                                                            min="0"
                                                            step="0.0001"
                                                            value={bonus?.percentage ?? '0'}
                                                            onChange={e => handleUpdateBonus(c.id, e.target.value)}
                                                            className="w-24 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-800 pr-6 text-right focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 font-mono"
                                                        />
                                                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                                                            %
                                                        </span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* 底部操作 */}
                    <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 shrink-0">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={saving}
                            className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50"
                        >
                            取消
                        </button>
                        <button
                            type="submit"
                            disabled={saving || ai.generating || !name.trim()}
                            className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white rounded-xl text-xs font-medium transition-all shadow-sm shadow-orange-500/20 disabled:opacity-50"
                        >
                            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                            {saving ? '保存中…' : '保存职业'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
