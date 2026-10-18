import {Archive, Database} from 'lucide-react';
import type {CombatHistoryStorage} from '../../types/api/combat';

export function WorldAdventureHistory({storage}: {storage?: CombatHistoryStorage}) {
    if (!storage) return null;
    return (
        <section aria-label="冒险历史固化与规则版本" className="mt-5 border-t border-slate-100 pt-5">
            <h4 className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <Archive className="h-4 w-4 text-orange-500"/>历史固化与规则版本
            </h4>
            <p className="mt-2 text-xs leading-5 text-slate-500">
                装备保存自身属性和穿戴条件，已结束冒险保存历史结果。旧版本编号保留作来源记录，不再要求同步整套旧规则。
            </p>
            <dl className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(110px,1fr))] gap-2 text-xs">
                {[
                    ['居民已固化', `${storage.frozenResidents}/${storage.residentCount}`],
                    ['历史冒险', `${storage.frozenExplorations} 次`],
                    ['未结束冒险', `${storage.activeExplorations} 次`],
                    ['同步规则包', `${storage.syncCatalogCount}/${storage.catalogCount}`],
                ].map(([label, value]) => (
                    <div key={label} className="rounded-xl bg-slate-50 p-3">
                        <dt className="text-slate-500">{label}</dt><dd className="mt-1 font-semibold text-slate-800">{value}</dd>
                    </div>
                ))}
            </dl>
            <div className="scrollbar-hide mt-3 max-h-48 overflow-y-auto rounded-xl border border-slate-100">
                {storage.versions.map(row => (
                    <div key={row.version} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 text-xs last:border-0">
                        <div className="flex items-center gap-2">
                            <Database className="h-3.5 w-3.5 text-slate-400"/>
                            <span className="font-mono text-slate-700">{row.version}</span>
                            {row.version === storage.currentVersion && <span className="rounded-full bg-orange-50 px-2 py-0.5 text-orange-700">当前</span>}
                        </div>
                        <span className="text-slate-500">
                            {(row.bytes / 1024).toFixed(1)} KB · {row.synchronized ? '参与同步' : '仅本机留存'}
                            {row.activeExplorations > 0 && ` · ${row.activeExplorations}次冒险使用中`}
                        </span>
                    </div>
                ))}
                {storage.versions.length === 0 && <p className="p-3 text-xs text-slate-500">尚未安装战斗规则包。</p>}
            </div>
            <p className="mt-2 text-[11px] leading-5 text-slate-500">
                未结束冒险继续使用出发时规则，结束后固化。旧规则包暂保留在本机，不自动删除；历史明细压缩归档另行处理。
            </p>
        </section>
    );
}
