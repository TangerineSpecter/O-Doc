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
    const command=useCallback(async (operation:'recall'|'resume')=>{
        setBusy(true);setCommandError('');
        try {await explorationCommand(id,operation);} catch(error) {setCommandError(error instanceof Error?error.message:'操作失败');} finally {setBusy(false);}
    },[id]);
    const ended=state.snapshot&&!['preparing','active','paused'].includes(state.snapshot.status);
    const detail=state.snapshot?.reason||(!ended&&state.snapshot?.remainingSeconds!=null?`预计剩余 ${elapsed(state.snapshot.remainingSeconds)}`:'');
    const description=[ended?'本次探索已结束，可查看全部记录。':'关闭窗口后探索继续。',detail,'动作与飘字仅作演示，数值与收益以已确认战报为准。'].filter(Boolean).join(' ');
    const summary=useMemo(()=>state.snapshot?<CombatObservationSummary snapshot={state.snapshot} busy={busy} onCommand={command}/>:undefined,[state.snapshot,busy,command]);
    return <WorldDialog title="探索观察" titleAction={summary} description={description} size="extra-wide" onClose={onClose}>
        <div className="flex h-full min-h-0 flex-col gap-3">
            {(state.error||commandError)&&<p role="alert" className="shrink-0 rounded-xl bg-red-50 p-3 text-xs text-red-700">{state.error?`连接中断，保留最后确认状态：${state.error}`:commandError}</p>}
            {state.snapshot?<CombatObservationView snapshot={state.snapshot} events={state.events} disconnected={Boolean(state.error)}/>:
                <p className="p-6 text-sm text-slate-500">读取最后确认的探索状态…</p>}
        </div>
    </WorldDialog>;
}
