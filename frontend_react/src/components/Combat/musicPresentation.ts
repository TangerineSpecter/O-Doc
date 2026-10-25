import type {CombatAction} from '../../types/api/combat';

export function musicActionText(action:CombatAction):string|undefined {
    if(!action.music)return undefined;
    if(action.kind==='bard_beats')return `节拍 ${action.stacks||0}/3`;
    if(action.kind==='bard_resonance')return `共振 ${action.stacks||0}/3`;
    if(action.kind==='bard_silence')return `封声 ${action.duration||1}回合（可普攻）`;
    if(action.kind==='bard_melody_extend')return '主旋律延长1回合';
    if(action.kind==='modifier') {
        const labels:Record<string,string>={attack:'物攻／魔攻',accuracy:'命中',critical:'暴击',reduction:'减伤',outgoing_reduction:'对友方伤害降低'};
        const v=Number(action.value||0)*100;
        return `${labels[action.stat||'']||'音律效果'} ${v>0?'+':''}${Number(v.toFixed(2))}%`;
    }
    return undefined;
}
