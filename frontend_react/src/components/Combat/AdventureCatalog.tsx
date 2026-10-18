import {useCallback, useEffect, useMemo, useState} from 'react';
import {ChevronLeft, ChevronRight} from 'lucide-react';
import {useAdventureCatalog} from '../../hooks/useAdventureCatalog';
import CombatAtlas from './CombatAtlas';
import DataExportButton from '../common/DataExportButton';
import {adventureCatalogExportSheets} from './adventureCatalogExport';

export default function AdventureCatalog({residents, initialAgentId = '', active}: {
    residents: {id: string; name: string}[]; initialAgentId?: string; active: boolean;
}) {
    const [actorId, setActorId] = useState(residents.some(row => row.id === initialAgentId) ? initialAgentId : residents[0]?.id || '');
    const state = useAdventureCatalog(actorId, active);
    const catalog = state.data?.catalog;
    const exportSheets = useMemo(() => catalog ? adventureCatalogExportSheets(catalog) : [], [catalog]);

    const currentIndex = useMemo(() => {
        const idx = residents.findIndex(r => r.id === actorId);
        return idx >= 0 ? idx : 0;
    }, [residents, actorId]);

    const currentResident = residents[currentIndex];

    const handlePrev = useCallback(() => {
        if (residents.length <= 1) return;
        setActorId(prev => {
            const idx = residents.findIndex(r => r.id === prev);
            const nextIdx = idx <= 0 ? residents.length - 1 : idx - 1;
            return residents[nextIdx]?.id || prev;
        });
    }, [residents]);

    const handleNext = useCallback(() => {
        if (residents.length <= 1) return;
        setActorId(prev => {
            const idx = residents.findIndex(r => r.id === prev);
            const nextIdx = idx >= residents.length - 1 ? 0 : idx + 1;
            return residents[nextIdx]?.id || prev;
        });
    }, [residents]);

    // 键盘左右方向键切换居民探索记录
    useEffect(() => {
        if (!active || residents.length <= 1) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            // 输入框打字时不拦截左右光标移动
            const target = e.target as HTMLElement | null;
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
                return;
            }

            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                handlePrev();
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                handleNext();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [active, residents.length, handlePrev, handleNext]);

    return <div className="flex h-full min-h-0 flex-col gap-3">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
            <div className="space-y-1 text-xs text-slate-500">
                <p>查阅地牢、怪物与成长路线，了解装备和材料的来源。</p>
                {residents.length > 0 && <p id="adventure-discovery-hint">人物选择仅切换“已遭遇 / 已击败 / 已获得”标记，图鉴内容全世界共享。</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
                {residents.length > 0 && (
                    <div className="flex items-center gap-2">
                        <span id="adventure-discovery-label" className="text-xs font-medium text-slate-600">
                            查看居民探索记录
                        </span>
                        <div
                            role="group"
                            aria-labelledby="adventure-discovery-label"
                            aria-describedby="adventure-discovery-hint"
                            className="inline-flex items-center rounded-xl border border-slate-200 bg-white p-0.5 shadow-2xs"
                        >
                            <button
                                type="button"
                                onClick={handlePrev}
                                disabled={residents.length <= 1}
                                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                                title="上一个居民 (快捷键 ←)"
                                aria-label="上一个居民"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </button>

                            <div
                                className="flex min-w-[76px] items-center justify-center gap-1.5 px-2 text-xs font-semibold text-slate-800 select-none"
                                title={`当前居民：${currentResident?.name || '未知'} (按键盘 ← / → 快速切换)`}
                            >
                                <span className="truncate max-w-[100px]">{currentResident?.name || '—'}</span>
                                {residents.length > 1 && (
                                    <span className="text-[10px] font-normal text-slate-400 tabular-nums">
                                        {currentIndex + 1}/{residents.length}
                                    </span>
                                )}
                            </div>

                            <button
                                type="button"
                                onClick={handleNext}
                                disabled={residents.length <= 1}
                                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                                title="下一个居民 (快捷键 →)"
                                aria-label="下一个居民"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>

                        {residents.length > 1 && (
                            <span
                                className="hidden items-center gap-1 rounded-md border border-slate-200/80 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-400 sm:inline-flex select-none"
                                title="可使用键盘左右方向键切换"
                            >
                                <kbd className="font-sans">←</kbd>
                                <kbd className="font-sans">→</kbd>
                            </span>
                        )}
                    </div>
                )}
                <DataExportButton sheets={exportSheets} fileName="冒险图鉴" disabled={!state.data || Boolean(state.error)}/>
            </div>
        </div>
        {state.error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-xs text-red-700">{state.error}<button type="button" onClick={state.reload} className="ml-3 font-semibold underline">重新加载</button></p>}
        <div className="min-h-0 flex-1">{state.data ? <CombatAtlas catalog={state.data.catalog} discoveries={state.data.discoveries}/> : !state.error ? <p className="p-6 text-sm text-slate-500">正在翻开冒险图鉴…</p> : null}</div>
    </div>;
}
