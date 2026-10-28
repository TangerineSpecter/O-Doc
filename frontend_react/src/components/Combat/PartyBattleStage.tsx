import {useEffect, useRef, useState} from 'react';
import type {AdventurePartySnapshot} from '../../types/api/combat';
import {reportDiagnostic} from '../../utils/diagnostics';
import CombatFighterStatus from './CombatFighterStatus';
import type {PartyBattleScene} from './animation/observation/PartyBattleScene';

export default function PartyBattleStage({party, personalKills}: {party: AdventurePartySnapshot; personalKills: number}) {
    const host = useRef<HTMLDivElement>(null), scene = useRef<PartyBattleScene | null>(null), latest = useRef(party);
    const [error, setError] = useState(false), [errorMessage, setErrorMessage] = useState('');
    const [ready, setReady] = useState(false);
    const [attempt, setAttempt] = useState(0), [paused, setPaused] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
    const pauseRef = useRef(paused);
    useEffect(() => {
        latest.current = party;
        const instance = scene.current;
        if (!instance) return;
        let stale = false;
        void instance.update(party).then(() => {
            if (!stale && scene.current === instance) {
                setError(false);
                setErrorMessage('');
            }
        }).catch(error => {
            if (stale || scene.current !== instance) return;
            console.error('[PartyBattleStage:update failed]', error);
            reportDiagnostic({errorType: 'runtime', module: 'combat', operation: 'party-scene:update'}, error);
            setError(true);
            setErrorMessage(error instanceof Error ? error.message : String(error));
        });
        return () => {stale = true;};
    }, [party]);
    useEffect(() => {
        let active = true;
        let instance: PartyBattleScene | null = null;
        void import('./animation/observation/PartyBattleScene').then(async ({PartyBattleScene}) => {
            if (!active || !host.current) return;
            instance = new PartyBattleScene(host.current, latest.current);
            instance.setPaused(pauseRef.current);
            // Keep polling out until initialization and snapshot catch-up both finish.
            await instance.init();
            if (!active) return;
            let snapshot;
            do {
                snapshot = latest.current;
                await instance.update(snapshot);
                if (!active) return;
            } while (snapshot !== latest.current);
            scene.current = instance;
            instance.setPaused(pauseRef.current);
            setError(false);
            setErrorMessage('');
            setReady(true);
        }).catch(error => {
            if (!active) return;
            console.error('[PartyBattleStage:init failed]', error);
            reportDiagnostic({errorType: 'runtime', module: 'combat', operation: 'party-scene:init'}, error);
            setError(true);
            setErrorMessage(error instanceof Error ? error.message : String(error));
        });
        return () => {active = false; scene.current = null; instance?.dispose();};
    }, [attempt]);
    useEffect(() => {pauseRef.current = paused; scene.current?.setPaused(paused);}, [paused]);
    useEffect(() => {
        const preference = matchMedia('(prefers-reduced-motion: reduce)');
        const change = () => {if (preference.matches) setPaused(true);};
        preference.addEventListener('change', change);
        return () => preference.removeEventListener('change', change);
    }, []);
    const names = new Map([...party.players, ...party.enemies].map(unit => [unit.id, unit.name]));
    const hud = <>
        <div className="grid content-start gap-2" style={{gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 10rem), 1fr))'}}>
            {party.players.map(unit => <div key={unit.id}><CombatFighterStatus entity={unit} round={party.round} label={unit.jobName || '居民'}/>{unit.hp <= 0 && <p className="rounded bg-slate-950/65 px-2 py-1 text-[10px] text-rose-200">倒地 · 等待队友救援</p>}</div>)}
        </div>
        <div className="grid content-start gap-2" style={{gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 10rem), 1fr))'}}>
            {party.enemies.map(unit => <div key={unit.id}><CombatFighterStatus entity={unit} round={party.round} label={unit.rank === 'boss' ? '首领' : unit.rank === 'elite' ? '精英' : '普通'} enemy/>{unit.taunt && unit.taunt.expires > party.round && <p className="rounded bg-slate-950/65 px-2 py-1 text-[10px] text-orange-200">嘲讽目标：{names.get(unit.taunt.actorId)}</p>}</div>)}
        </div>
    </>;
    return <section className="relative w-full min-w-0 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-[#304642] lg:w-[min(100cqw,170.212766cqh)]" aria-label="组队冒险">
        <div className="relative aspect-[720/423]">
            <div ref={host} className="absolute inset-0"/>
            <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
                <div className="min-w-0 rounded-lg border border-white/10 bg-slate-950/50 px-2.5 py-1.5 text-[10px] text-white/90 backdrop-blur-sm">
                    <p>第{party.wave}波 · 第{party.round}回合 · {party.roundSeconds}秒/回合</p>
                    <p className="mt-1 hidden sm:block">{party.phase === 'searching' ? '寻敌中，等待下一波' : `行动顺序：${party.actionOrder.map(id => names.get(id) || '已离场').join(' → ') || '等待下一回合'}`}</p>
                    <p className="mt-1 hidden text-white/70 sm:block">队伍击败 {party.teamKills} 只 · 本人参与 {personalKills} 只</p>
                </div>
                <button type="button" aria-pressed={paused} onClick={() => setPaused(value => !value)} className="shrink-0 rounded-lg border border-white/10 bg-slate-950/50 px-2 py-1.5 text-[10px] text-white backdrop-blur-sm">{paused ? '继续画面' : '暂停画面'}</button>
            </div>
            {!ready && !error && <p role="status" className="absolute inset-0 flex items-center justify-center text-xs text-white">加载战斗画面…</p>}
            {error && <div role="status" className="absolute inset-x-4 top-[35%] rounded-xl bg-white/95 px-3 py-2 text-xs text-amber-800">
                <p>画面暂未加载，战斗状态与记录仍可查看。</p>
                {errorMessage && <p className="mt-1 text-[10px] text-rose-600/80 font-mono break-all">{errorMessage}</p>}
                <button type="button" onClick={() => {setError(false); setErrorMessage(''); setReady(false); setAttempt(value => value + 1);}} className="mt-2 rounded-lg border border-amber-200 px-2 py-1">重新加载画面</button>
            </div>}
            <div className="scrollbar-hide absolute inset-x-3 bottom-3 hidden max-h-[42%] grid-cols-2 gap-[12%] overflow-y-auto sm:grid" aria-label="场景内战斗状态">{hud}</div>
        </div>
        <div className="grid grid-cols-2 gap-2 p-2 sm:hidden" aria-label="窄屏战斗状态">{hud}</div>
    </section>;
}
