import {readStageInput} from '../../../utils/quantStageInput';

export function StageInputScope({json,reused}:{json:string;reused:boolean}) {
    let value;
    try{value=readStageInput(json);}catch(cause){return <p role="alert" className="text-sm text-red-700">{cause instanceof Error?cause.message:'阶段输入无法读取'}</p>;}
    if(value.status==='blocked')return <p className="text-sm leading-7 text-amber-800">本阶段的分析材料未通过输入检查，尚未取得可复用结果。</p>;
    return <section className="space-y-3 text-sm leading-7" aria-label="本阶段分析范围">
        {reused?<p className="text-slate-700">本阶段的 AI 分析输入与此前相同，已按当前来源重新核对定义与引文，因此沿用成功结果，没有再次调用模型。</p>:<p className="text-slate-600">本阶段按实际分析输入核对复用条件；输入变化时重新分析。</p>}
        {value.material&&<><p className="font-medium text-slate-700">{value.material.mode==='provided_declaration_closure'?'修订范围：选中候选与已提供的依赖声明':'修订范围：完整来源'}</p><p className="text-xs leading-6 text-slate-500">{value.material.notice}</p>
            {value.material.parts&&<ul className="space-y-1 text-xs leading-6 text-slate-600">{value.material.parts.map((part,i)=><li className="break-words" key={i}>{part.name} · L{part.start_line}–{part.end_line}</li>)}</ul>}</>}
        <p className="text-xs leading-6 text-slate-500">沿用静态研究意见不会增加实证证据；全局评分仍按其完整输入判断。</p>
    </section>;
}
