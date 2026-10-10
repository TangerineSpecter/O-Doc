import type {CombatEquipment} from '../../types/api/combat';
import {qualityLabels, slotLabels, statLabels} from './presentation';
export default function EquipmentCard({item, worn, disabled, onEquip, onUnequip, onFavorite, onSell}: {item: CombatEquipment; worn?: boolean; disabled?: boolean; onEquip?: () => void; onUnequip?: () => void; onFavorite?: () => void; onSell?: () => void}) {
    const gear = item.snapshot;
    return <article className={`rounded-2xl border bg-white p-4 ${gear.quality === 'gold' ? 'border-amber-300' : gear.quality === 'blue' ? 'border-sky-200' : 'border-slate-200'}`}>
        <div className="flex items-center justify-between gap-2"><strong className="text-sm text-slate-800">{gear.name}</strong><span className="text-xs text-slate-500">Lv.{gear.level} · {qualityLabels[gear.quality]}</span></div>
        <p className="mt-1 text-xs text-slate-500">{slotLabels[gear.slot]}{worn ? ' · 已穿戴' : ''}{item.bound ? ' · 绑定' : ''}{item.locked ? ' · 收藏' : ''}</p>
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">{Object.entries(gear.stats).filter(([,value]) => value).map(([key,value]) => <div key={key} className="flex justify-between"><dt className="text-slate-500">{statLabels[key] || key}</dt><dd>{value < 1 ? `${(value * 100).toFixed(1)}%` : value}</dd></div>)}</dl>
        <ul className="mt-2 space-y-1 text-xs text-orange-700">{gear.affixes.map(affix => <li key={affix.id}>{statLabels[affix.stat] || '辅助属性'} +{['accuracy','evasion','critical','critical_damage'].includes(affix.stat) ? `${(affix.value*100).toFixed(1)}%` : affix.value}</li>)}</ul>
        <p className="mt-2 text-xs text-slate-500">随机词条 {gear.affixes.length} 条 · 回收 ¥{item.value}</p>
        <div className="mt-3 flex flex-wrap gap-3 text-xs font-medium text-orange-700">
            {onEquip && <button disabled={disabled || worn} onClick={onEquip}>{worn ? '已穿戴' : '穿戴并预览'}</button>}
            {worn && onUnequip && <button disabled={disabled} onClick={onUnequip}>卸下并预览</button>}
            {onFavorite && <button disabled={disabled} onClick={onFavorite}>{item.locked ? '取消收藏' : '收藏'}</button>}
            {onSell && <button disabled={disabled || worn || item.bound || item.locked} onClick={onSell}>出售</button>}
        </div>
    </article>;
}
