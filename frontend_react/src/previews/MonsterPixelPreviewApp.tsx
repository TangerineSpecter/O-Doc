import {MonsterPortrait} from '../components/Combat/atlas/MonsterPortrait';
import {getMonsterPixelArt} from '../components/Combat/art/monsterPixelArt';
import type {CombatCatalog} from '../types/api/combat';
import fixture from './combatAtlasFixture.json';

const catalog: CombatCatalog = fixture;
const rankNames: Record<string, string> = {normal: '普通', elite: '精英', boss: '首领 Boss'};
const rankStyles: Record<string, string> = {
    normal: 'border-slate-200 bg-slate-50 text-slate-500',
    elite: 'border-purple-200 bg-purple-50 text-purple-700',
    boss: 'border-amber-200 bg-amber-50 text-amber-800',
};

/** Static artwork review uses existing catalog relationships; it does not alter discoveries. */
export default function MonsterPixelPreviewApp() {
    return <main className="mx-auto max-w-6xl px-4 py-10 text-slate-800 sm:px-8">
        <header className="mb-10 flex flex-wrap items-end justify-between gap-4">
            <div><p className="text-xs font-semibold tracking-[.2em] text-slate-400">MONSTER ATELIER / PIXEL 01</p>
                <h1 className="mt-3 text-3xl font-bold">像素魔物 · 20 只新形象</h1>
                <p className="mt-3 max-w-xl text-sm leading-6 text-slate-500">沿用冒险者与装备的像素质感，先看形象。已确认的苔石洞窟四只保留原版。</p>
            </div>
            <a href="./combat-atlas-preview.html?tab=monsters" className="rounded-full border border-orange-200 bg-orange-50 px-5 py-3 text-sm font-semibold text-orange-700">查看图鉴尺寸与详情 ↗</a>
        </header>
        {catalog.tables.dungeons.map(dungeon => {
            const ids = new Set(catalog.tables.dungeonMonsters.filter(row => row.dungeonId === dungeon.id).map(row => row.monsterId));
            if (dungeon.bossId) ids.add(dungeon.bossId);
            const monsters = catalog.tables.monsters.filter(monster => ids.has(monster.id) && getMonsterPixelArt(monster.id));
            if (!monsters.length) return null;
            return <section key={dungeon.id} className="mb-10" aria-label={dungeon.name}>
                <div className="mb-4 flex items-baseline justify-between gap-3"><h2 className="text-lg font-bold">{dungeon.name}</h2>
                    <span className="text-xs text-slate-400">Lv.{dungeon.recommendedLevelMin}–{dungeon.recommendedLevelMax}</span></div>
                <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
                    {monsters.map(monster => <a key={monster.id} href={`./combat-atlas-preview.html?tab=monsters&monster=${encodeURIComponent(monster.id)}`}
                        className="group overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition-colors hover:border-orange-300 focus-visible:outline-orange-500 sm:p-4">
                        <div className="flex items-center justify-between gap-1"><span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${rankStyles[monster.rank ?? 'normal'] || rankStyles.normal}`}>{rankNames[monster.rank ?? 'normal'] || '普通'}</span>
                            <span className="text-[10px] text-slate-400">Lv.{monster.levelMin}–{monster.levelMax}</span></div>
                        <MonsterPortrait monsterId={monster.id} name={monster.name} rank={monster.rank} decorative className="my-3 aspect-square w-full" />
                        <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-bold">{monster.name}</h3><span aria-hidden="true" className="text-sm text-slate-300 group-hover:text-orange-500">↗</span></div>
                    </a>)}
                </div>
            </section>;
        })}
        <footer className="border-t border-slate-200 py-5 text-xs leading-6 text-slate-400">静态 PNG 形象已确认并接入图鉴 · 动作帧与技能特效后续独立制作</footer>
    </main>;
}
