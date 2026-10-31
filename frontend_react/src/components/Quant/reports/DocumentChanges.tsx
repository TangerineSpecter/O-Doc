import {useEffect,useState} from 'react';
import type {DocumentComparison,ResearchSection} from '../../../types/api/quantDocument';
import type {QuantDocumentController} from '../../../hooks/useQuantDocument';
import {quantDocumentApi} from '../../../api/quantDocument';
import {quantDate,quantError} from '../../../utils/quant';
import {QuantButton} from '../ui';
import {ReportMarkdown} from '../ReportMarkdown';

const sectionLabels:Record<ResearchSection,string>={reading:'正文解读',parameters:'参数分析',factors:'因子算法',review:'评价与审查',plan:'实验规划'};
function content(value:Record<string,unknown>) {
    if(typeof value.markdown==='string')return value.markdown;
    return Object.entries(value).map(([key,item])=>`### ${key}\n\n${typeof item==='string'?item:'```json\n'+JSON.stringify(item,null,2)+'\n```'}`).join('\n\n')||'暂无内容';
}
export function DocumentChanges({collection,entry,state,historyId,close}:{collection:string;entry:string;state:QuantDocumentController;historyId?:string;close:()=>void}) {
    const pending=state.document?.pending[0];
    const identity=historyId||pending?.id||'';
    const [rows,setRows]=useState<DocumentComparison[]>([]);
    const [selected,setSelected]=useState<ResearchSection[]>([]);
    const [error,setError]=useState('');
    const [loading,setLoading]=useState(true);
    useEffect(()=>{
        const abort=new AbortController();
        void quantDocumentApi.get(collection,entry,historyId?{historyId}:{compareId:identity},abort.signal)
            .then(value=>{setRows(value.comparison||[]);setSelected([]);})
            .catch(cause=>{if(!abort.signal.aborted)setError(quantError(cause));}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});
        return()=>abort.abort();
    },[collection,entry,identity,historyId,state.document?.revision]);
    const act=async(action:'adopt'|'restore'|'discard')=>{
        try{await state.change({action,identity,sections:selected});close();}catch(cause){setError(quantError(cause));}
    };
    return <div className="space-y-4">
        <p className="text-sm leading-6 text-slate-500">{historyId?'勾选需要恢复的部分，其余当前内容保持不变。':'勾选需要采用的变更。未采用的正文、参数、评分和算法不会替换当前内容。'}{pending&&!historyId&&` 分析完成于 ${quantDate(pending.createdAt)}。`}</p>
        {loading&&<p role="status" className="text-sm text-slate-500">正在比对内容…</p>}
        {rows.map(row=><section key={row.section} className="rounded-2xl border border-slate-200 bg-white p-4">
            <label className="flex items-center gap-3 text-sm font-bold text-slate-800">
                <input type="checkbox" className="accent-orange-500" checked={selected.includes(row.section)} disabled={!row.changed||state.busy}
                    onChange={event=>setSelected(old=>event.target.checked?[...old,row.section]:old.filter(key=>key!==row.section))}/>
                {sectionLabels[row.section]}<span className={`ml-auto text-xs font-normal ${row.changed?'text-orange-600':'text-slate-400'}`}>{row.changed?'内容有变化':'内容相同'}</span>
            </label>
            {row.changed&&<details className="mt-3 text-xs text-slate-600"><summary className="cursor-pointer">展开前后内容</summary>
                <div className="mt-3 grid gap-4 lg:grid-cols-2">{([['当前采用',row.before],[historyId?'将恢复':'本次生成',row.after]] as const).map(([title,value])=><div key={title} className="min-w-0 rounded-xl bg-slate-50 p-3"><h4 className="mb-3 font-bold">{title}</h4><div className="max-h-96 overflow-auto scrollbar-hide"><ReportMarkdown text={content(value)}/></div></div>)}</div>
            </details>}
        </section>)}
        {error&&<p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-white py-3">
            {!historyId&&<QuantButton disabled={state.busy} onClick={()=>void act('discard')}>放弃本次变更</QuantButton>}
            <QuantButton primary disabled={state.busy||!selected.length} onClick={()=>void act(historyId?'restore':'adopt')}>{state.busy?'正在保存…':historyId?'恢复所选内容':'采用所选变更'}</QuantButton>
        </div>
    </div>;
}
