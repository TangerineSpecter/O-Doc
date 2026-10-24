import {useCallback,useMemo,useState} from 'react';
import WorldDialog from '../AgentWorld/WorldDialog';
import {useCombatObservation} from '../../hooks/useCombatObservation';
import {explorationCommand} from '../../api/combat';
import CombatObservationView from './CombatObservationView';
import CombatObservationSummary from './CombatObservationSummary';
import {elapsed} from './presentation';

export default function CombatObservation({id,onClose}:{id:string;onClose:()=>void}) {
    const state=useCombatObservation(id);
    const [commandError,setCommandError]=useState(''),[busy,setBusy]=useState(false);
    const command=useCallback(async (operation:'recall'|'resume'|'leave')=>{
        setBusy(true);setCommandError('');
        try {await explorationCommand(id,operation);} catch(error) {setCommandError(error instanceof Error?error.message:'操作失败');} finally {setBusy(false);}
    },[id]);
    const ended=state.snapshot&&!['preparing','active','paused'].includes(state.snapshot.status);
    const detail=state.snapshot?.reason||(!ended&&state.snapshot?.remainingSeconds!=null?`预计剩余 ${elapsed(state.snapshot.remainingSeconds)}`:'');
    const waitingPromotion=state.snapshot?.status==='paused'&&['promotion','promotion_failed'].includes(state.snapshot.stage);
    const promotionMessage=state.snapshot?.promotionBusy?'Agent 正在选择职业，完成后会自动继续当前探索':'Agent 尚未完成转职选择，可在冒险档案中重试';
    const description=[ended?'本次探索已结束，可查看全部记录':waitingPromotion?promotionMessage:state.snapshot?.status==='paused'?'探索已暂停':'关闭窗口后探索继续',detail,'动作与数值以已确认战报为准'].filter(Boolean).join(' · ');
    const summary=useMemo(()=>state.snapshot?<CombatObservationSummary snapshot={state.snapshot} busy={busy} onCommand={command}/>:undefined,[state.snapshot,busy,command]);
    return <WorldDialog title="探索观察" titleAction={summary} description={description} size="extra-wide" onClose={onClose}>
        <div className="flex h-full min-h-0 flex-col gap-3">
            {state.snapshot?.party&&state.snapshot.status==='active'&&state.snapshot.canControl&&<div className="flex shrink-0 items-center justify-between gap-2 text-xs text-slate-600"><span>立即召回会退出当前战斗；也可等本波结束再离开。</span><button type="button" disabled={busy} onClick={()=>{void command('leave');}} className="shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1">本波后离队</button></div>}
            {(state.error||commandError)&&<p role="alert" className="shrink-0 rounded-xl bg-red-50 p-3 text-xs text-red-700">{state.error?`连接中断，保留最后确认状态：${state.error}`:commandError}</p>}
            {state.snapshot?<CombatObservationView snapshot={state.snapshot} events={state.events} disconnected={Boolean(state.error)}/>:
                <p className="p-6 text-sm text-slate-500">读取最后确认的探索状态…</p>}
        </div>
    </WorldDialog>;
}
