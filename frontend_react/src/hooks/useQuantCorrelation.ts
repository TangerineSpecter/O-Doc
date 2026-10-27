import {useState} from 'react';
import {quantApi} from '../api/quant';
import type {QuantComparison,QuantCorrelation} from '../types/api/quantComparison';
export function useQuantCorrelation(collection:string,comparison:QuantComparison) {
    const key=JSON.stringify([collection,comparison.id,comparison.contentHash]);
    const[state,setState]=useState<{key:string;busy:boolean;error:string;record?:QuantCorrelation}>({key:'',busy:false,error:''});
    const create=async()=>{
        setState({key,busy:true,error:''});
        try {const record=await quantApi.correlateComparison(collection,comparison.id);setState({key,busy:false,error:'',record});}
        catch(cause){setState({key,busy:false,error:cause instanceof Error?cause.message:'样本相关分析失败'});}
    };
    return {record:state.key===key?state.record||comparison.correlation:comparison.correlation,
        busy:state.key===key&&state.busy,error:state.key===key?state.error:'',create};
}
