import type {useCombatActions} from '../../hooks/useCombatActions';
import type {CombatProfile} from '../../types/api/combat';
import {Coins, Info, ShoppingBag, Store} from 'lucide-react';

export default function CombatMarketPanel({
    profile,
    actions,
    disabled,
}: {
    profile: CombatProfile;
    actions: ReturnType<typeof useCombatActions>;
    disabled: boolean;
}) {
    const availablePotions = profile.potions.filter(
        r => Number(r.requiredLevel || 1) <= profile.progression.level
    );
    const ownedMaterials = profile.materials.filter(r => r.owned > 0);

    return (
        <div className="space-y-4">
            {/* 市场体力与会话规则横幅 */}
            <div className="flex items-center justify-between gap-3 rounded-xl bg-orange-50/70 p-3 border border-orange-100 text-xs">
                <div className="flex items-center gap-2 text-slate-600">
                    <Info className="h-4 w-4 shrink-0 text-orange-500" />
                    <span>
                        同一次市场会话多次交易仅扣除 <strong>5</strong> 体力入场费；完成补给后点击右侧结束会话即可。
                    </span>
                </div>
                <button
                    type="button"
                    disabled={actions.busy}
                    onClick={() => void actions.finishMarket()}
                    className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-orange-700 border border-orange-200/80 shadow-2xs hover:bg-orange-50 active:scale-95 transition-all whitespace-nowrap shrink-0"
                >
                    结束市场会话
                </button>
            </div>

            {/* 左右两个交易区域 */}
            <div className="grid gap-3.5 sm:grid-cols-2">
                {/* 1. 药剂补给站 */}
                <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                            <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                <ShoppingBag className="w-3.5 h-3.5 text-orange-500" />
                                <span>药剂补给站</span>
                            </h4>
                            <span className="text-[11px] text-slate-400">已解锁 {availablePotions.length} 种</span>
                        </div>
                        <div className="mt-2.5 space-y-2">
                            {availablePotions.map(potion => (
                                <div
                                    key={potion.id}
                                    className="flex items-center justify-between rounded-lg bg-slate-50/80 p-2.5 border border-slate-100 text-xs"
                                >
                                    <div>
                                        <p className="font-semibold text-slate-800">{potion.name}</p>
                                        <p className="mt-0.5 text-[11px] text-slate-500">
                                            库存 <strong className="text-slate-700 font-bold">{potion.owned}</strong> 瓶 · 单价 ¥{potion.purchasePrice}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        disabled={disabled}
                                        onClick={() =>
                                            void actions.trade({
                                                kind: 'buy_potion',
                                                potionId: potion.id,
                                                quantity: 1,
                                            })
                                        }
                                        className="rounded-md bg-orange-500 px-3 py-1 text-xs font-medium text-white shadow-2xs hover:bg-orange-600 active:scale-95 transition-colors disabled:opacity-40 whitespace-nowrap shrink-0"
                                    >
                                        购买一瓶
                                    </button>
                                </div>
                            ))}
                            {availablePotions.length === 0 && (
                                <p className="py-4 text-center text-xs text-slate-400">暂无可购买药剂</p>
                            )}
                        </div>
                    </div>
                </div>

                {/* 2. 战利品回收处 */}
                <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                            <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                <Coins className="w-3.5 h-3.5 text-amber-500" />
                                <span>战利品材料回收</span>
                            </h4>
                            <span className="text-[11px] text-slate-400">待回收 {ownedMaterials.length} 种</span>
                        </div>
                        <div className="mt-2.5 space-y-2">
                            {ownedMaterials.map(mat => (
                                <div
                                    key={mat.id}
                                    className="flex items-center justify-between rounded-lg bg-slate-50/80 p-2.5 border border-slate-100 text-xs"
                                >
                                    <div>
                                        <p className="font-semibold text-slate-800">{mat.name}</p>
                                        <p className="mt-0.5 text-[11px] text-slate-500">
                                            持有 <strong className="text-slate-700 font-bold">{mat.owned}</strong> 个 · 回收 ¥{mat.salePrice}/个
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        disabled={disabled}
                                        onClick={() =>
                                            void actions.trade({
                                                kind: 'sell_combat_material',
                                                materialId: mat.id,
                                                quantity: Math.min(99, mat.owned),
                                            })
                                        }
                                        className="rounded-md bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200 active:scale-95 transition-colors disabled:opacity-40 whitespace-nowrap shrink-0"
                                    >
                                        全部出售
                                    </button>
                                </div>
                            ))}
                            {ownedMaterials.length === 0 && (
                                <div className="py-8 text-center text-xs text-slate-400">
                                    <Store className="mx-auto mb-1.5 h-6 w-6 text-slate-300" />
                                    <span>背包中暂无待出售的迷宫材料</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
