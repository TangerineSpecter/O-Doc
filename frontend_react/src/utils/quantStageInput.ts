export interface StageInputScope {
    status:'ready'|'blocked';
    hash?:string;
    material?:{mode:'provided_declaration_closure'|'complete_source';notice:string;parts?:{name:string;start_line:number;end_line:number}[]};
}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export function readStageInput(json:string):StageInputScope {
    const fail=():never=>{throw new Error('阶段分析输入依据不完整，请重新读取。');};
    if(json.length>200000)return fail();
    const value:unknown=JSON.parse(json);
    if(!record(value)||value.version!==1)return fail();
    if(value.status==='blocked') {
        if(value.reason!=='model_context_rejected')return fail();
        return {status:'blocked'};
    }
    if(value.status!=='ready'||typeof value.prompt_hash!=='string'||!/^[a-f0-9]{64}$/.test(value.prompt_hash)||value.max_tokens!==32000||value.json_output!==true)return fail();
    const result:StageInputScope={status:'ready',hash:value.prompt_hash};
    if(value.material_scope!==undefined) {
        const scope=value.material_scope;
        if(!record(scope)||!['provided_declaration_closure','complete_source'].includes(String(scope.mode))||typeof scope.notice!=='string'||!scope.notice.trim()||scope.notice.length>2000)return fail();
        if(scope.mode==='provided_declaration_closure') {
            if(!Array.isArray(scope.parts)||!scope.parts.length||scope.parts.length>256||!scope.parts.every(part=>record(part)&&typeof part.name==='string'&&!!part.name&&part.name.length<=30000
                &&typeof part.start_line==='number'&&Number.isSafeInteger(part.start_line)&&part.start_line>0&&typeof part.end_line==='number'&&Number.isSafeInteger(part.end_line)&&part.end_line>=part.start_line))return fail();
        } else if(scope.parts!==undefined)return fail();
        result.material=scope as unknown as StageInputScope['material'];
    }
    return result;
}
