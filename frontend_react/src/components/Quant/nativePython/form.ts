import type {NativeArgument,NativeColumn,NativeOptions} from '../../../types/api/quantNativePython';
import type {QuantFactorCandidate} from '../../../types/api/quant';
export const columns:NativeColumn[]=['open','high','low','close','volume'];
export interface ArgumentDraft {name:string;kind:''|NativeArgument['kind'];column:NativeColumn;columns:(NativeColumn|'timestamp')[];parameter:string;literalType:'number'|'boolean'|'string'|'null';literal:string}
export function argumentDraft(name='',candidate?:QuantFactorCandidate):ArgumentDraft {
    const parameter=candidate?.data.parameters.find(row=>row.name===name)?.name||'';
    const column=columns.find(value=>value===name.toLowerCase());
    return {name,kind:parameter?'parameter':column?'series':'',column:column||'close',columns:['open','high','low','close','volume'],parameter,literalType:'number',literal:''};
}
export function signatureArguments(options:NativeOptions,candidate:QuantFactorCandidate,entrypoint:string) {
    return options.source?.signatures.find(row=>row.name===entrypoint)?.arguments.map(row=>argumentDraft(row.name,candidate))||[argumentDraft('',candidate)];
}
export function buildArguments(rows:ArgumentDraft[]):NativeArgument[] {
    const names=new Set<string>();
    return rows.map(row=>{
        if (!/^[A-Za-z_][A-Za-z0-9_]{0,99}$/.test(row.name)||names.has(row.name))throw new Error('请填写不重复的函数参数名');
        names.add(row.name);
        if (row.kind==='series')return {name:row.name,kind:row.kind,column:row.column};
        if (row.kind==='dataframe'){
            if (!row.columns.length)throw new Error(`${row.name} 请至少选择一列行情`);
            return {name:row.name,kind:row.kind,columns:row.columns};
        }
        if (row.kind==='parameter'){
            if (!row.parameter)throw new Error(`${row.name} 请选择本次实际参数`);
            return {name:row.name,kind:row.kind,parameter:row.parameter};
        }
        if (row.kind!=='literal')throw new Error(`${row.name} 尚未指定映射方式`);
        let value:number|boolean|string|null=null;
        if (row.literalType==='string')value=row.literal;
        else if (row.literalType==='boolean'){
            if (!['true','false'].includes(row.literal))throw new Error(`${row.name} 请填写 true 或 false`);
            value=row.literal==='true';
        } else if (row.literalType==='number'){
            if (!row.literal.trim())throw new Error(`${row.name} 请明确填写数值`);
            value=Number(row.literal);if (!Number.isFinite(value))throw new Error(`${row.name} 必须为有限数值`);
        }
        return {name:row.name,kind:row.kind,value};
    });
}
