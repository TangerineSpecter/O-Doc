import type {QuantReportReading} from '../types/api/quantReading';
import {useCallback,useState} from 'react';
import {quantApi} from '../api/quant';
import type {QuantController} from './useQuant';
import {useQuantDraftRegistration,type QuantRegisterDraft} from './useQuantNavigation';

export function useQuantReportDraft(report:QuantReportReading,collection:string,entryId:string,safe:QuantController['safe'],register:QuantRegisterDraft) {
    const[draft,setDraft]=useState(report.markdown);
    const[baseline,setBaseline]=useState(report.markdown);
    const[revisionId,setRevisionId]=useState(report.currentRevisionId);
    const[editing,changeEditing]=useState(false);
    const dirty=draft!==baseline;
    const setEditing=(value:boolean)=>{
        if(value&&!dirty){setDraft(report.markdown);setBaseline(report.markdown);setRevisionId(report.currentRevisionId);}
        changeEditing(value);
    };
    const save=useCallback(async()=>safe(async()=>{
        const saved=await quantApi.reviseReport(collection,entryId,report.id,draft,revisionId,report.documentRevision);
        setBaseline(saved.markdown);setRevisionId(saved.currentRevisionId);changeEditing(false);
    }),[collection,entryId,report.id,report.documentRevision,draft,revisionId,safe]);
    useQuantDraftRegistration('research-report',draft!==baseline,save,register,()=>setDraft(baseline));
    return {draft:dirty||editing?draft:report.markdown,setDraft,revisionId:dirty||editing?revisionId:report.currentRevisionId,editing,setEditing,dirty,save};
}
