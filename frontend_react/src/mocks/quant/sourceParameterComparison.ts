/** Explicit source fixtures only. This never runs the backend language parser. */
import type {QuantSource} from '../../types/api/quant';
import type {QuantExecutionParameterComparison,QuantSourceParameterDeclaration} from '../../types/api/quantPlatformEvidence';
import {mockSourceHash} from './sourceSnapshots';
export const sourceParameterDemoCode={
    pine:'//@version=6\n// LOCAL_SOURCE_PARAMETER_V2\nN = input.int(20, minval=1, maxval=50)\nRSIOverSold = 50\nMode = input.string("FAST")',
    python:'# LOCAL_SOURCE_PARAMETER_V2\nRSI_OVERSOLD = 50\ndef factor(close, N=20, *, Mode="FAST"):\n    return close',
};
function declaration(name:string,language:'pine'|'python'):QuantSourceParameterDeclaration {
    const defaults:Record<string,string>={N:'20',RSIOverSold:'50',RSI_OVERSOLD:'50',Mode:'"FAST"'};
    const literal=name==='RSIOverSold' || name==='RSI_OVERSOLD',kind=name==='Mode'?'string':'int';
    const quote=language==='pine'?{N:'N = input.int(20, minval=1, maxval=50)',RSIOverSold:'RSIOverSold = 50',Mode:'Mode = input.string("FAST")'}[name]!:
        {N:'N=20',RSI_OVERSOLD:'RSI_OVERSOLD = 50',Mode:'Mode="FAST"'}[name]!;
    return {name,type:kind,declaration:literal?'initial_assignment':language==='pine'?'input.'+kind:'python_default',default_raw:defaults[name],quote,
        line:language==='pine'?({N:3,RSIOverSold:4,Mode:5}[name]!):literal?2:3,
        binding_kind:literal?'module_literal':language==='pine'?'exposed_input':'function_default',scope:language==='python' && !literal?'factor':'<module>',
        default_value:{kind,value:name==='Mode'?'FAST':name==='N'?20:50},type_basis:language==='pine' && !literal?'input_declaration':'literal_syntax',declared_constraints:language==='pine' && name==='N'?{minval:{raw:'1',literal:{kind:'int',value:1}},maxval:{raw:'50',literal:{kind:'int',value:50}}}:{}};
}
export function mockSourceParameterComparison(parameters:{name:string;value:string}[],target:QuantSource):QuantExecutionParameterComparison {
    const language=target.payload.language || '';
    const fixture=(language==='pine' || language==='python') && target.payload.code===sourceParameterDemoCode[language]?language:undefined;
    const rows:QuantExecutionParameterComparison['rows']=parameters.map(row=>{
        const fact=fixture && ['N','RSIOverSold','RSI_OVERSOLD','Mode'].includes(row.name)?declaration(row.name,fixture):null;
        let configured:QuantExecutionParameterComparison['rows'][number]['configured']={kind:'string',value:row.value};
        let status:QuantExecutionParameterComparison['rows'][number]['status']='unresolved';
        if(fact) {
            if(fact.type==='int')configured=/^[+-]?\d+$/.test(row.value) && Number.isSafeInteger(Number(row.value))?{kind:'int',value:Number(row.value)}:{kind:'unknown',value:null};
            const same=configured.value===fact.default_value?.value;
            status=configured.kind!==fact.type?'type_mismatch':fact.binding_kind==='module_literal'?(same?'literal_same':'literal_differs'):same?'same':'different';
            if(fixture==='pine' && row.name==='N' && configured.kind==='int' && ((configured.value as number)<1 || (configured.value as number)>50))status='constraint_mismatch';
        }
        return {name:row.name,configured,declaration:fact,default:fact?.default_value || null,status};
    });
    const result:QuantExecutionParameterComparison={version:2,parser:'source-parameters-2',source_language:language,parser_status:fixture?'partial':'unsupported',source_id:target.id,source_hash:mockSourceHash(target),rows,
        missing:fixture?['N','Mode'].filter(name=>!parameters.some(row=>row.name===name)).map(name=>declaration(name,fixture)):[],
        limitations:['纯local人工声明对照，只对完整匹配的固定演示源码填入已定义事实；没有运行真实Python/Pine解析器或调用模型。',
            '初始赋值不是公开输入；报告缺失值不填默认值，声明与核算均不证明真实运行或参数最优。']};
    result.ref=`source-parameters:local-${target.id.slice(0,80)}`;
    result.rows.forEach((row,i)=>{row.ref=`source-parameter:local-row-${i}-${target.id.slice(0,80)}`;});
    result.missing.forEach((row,i)=>{row.ref=`source-parameter:local-missing-${i}-${target.id.slice(0,80)}`;});
    result.refs=[result.ref,...result.rows.map(row=>row.ref!),...result.missing.map(row=>row.ref!)];
    return result;
}
