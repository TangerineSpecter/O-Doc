import {useCallback,useState} from 'react';
import {quantApi} from '../api/quant';
import type {QuantReport} from '../types/api/quant';
import type {QuantController} from './useQuant';
import {useQuantDraftRegistration,type QuantRegisterDraft} from './useQuantNavigation';

export function useQuantReportDraft(report:QuantReport,collection:string,entryId:string,safe:QuantController['safe'],register:QuantRegisterDraft) {
    const[draft,setDraft]=useState(report.markdown);
    const[baseline,setBaseline]=useState(report.markdown);
    const[revisionId,setRevisionId]=useState(report.currentRevisionId);
    const[editing,setEditing]=useState(false);
    const save=useCallback(async()=>safe(async()=>{
        const saved=await quantApi.reviseReport(collection,entryId,report.id,draft,revisionId);
        setBaseline(saved.markdown);setRevisionId(saved.currentRevisionId);setEditing(false);
    }),[collection,entryId,report.id,draft,revisionId,safe]);
    useQuantDraftRegistration('research-report',draft!==baseline,save,register,()=>setDraft(baseline));
    return {draft,setDraft,revisionId,editing,setEditing,dirty:draft!==baseline,save};
}
