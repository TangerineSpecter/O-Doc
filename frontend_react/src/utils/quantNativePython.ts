import type {NativePlan,NativeResult,NativeComparison} from '../types/api/quantNativePython';
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const finite=(value:unknown)=>typeof value==='number'&&Number.isFinite(value);
const strings=(value:unknown):value is string[]=>Array.isArray(value)&&value.every(row=>typeof row==='string');
export const nativeVerdictLabels={pass:'本次样本一致',fail:'发现输出差异',inconclusive:'证据不足'};
export const nativeStatusLabels:Record<string,string>={pending:'等待本机运行',running:'正在隔离运行',completed:'已完成',failed:'运行失败',cancelled:'已取消',interrupted:'本机任务中断'};
export const nativeReasonLabels:Record<string,string>={dependency_unavailable:'缺少运行依赖；未替换为其他实现',output_index_mismatch:'返回序列索引与输入不一致',all_function_arguments_must_be_explicit:'函数包含未明确映射的参数',explicit_output_column_required:'多列输出需要指定输出列',source_wall_time_exceeded:'超过源码运行秒数',source_output_exceeded:'源码输出过量',source_execution_error:'原始源码执行失败',runner_image_unavailable:'本机尚未安装固定运行镜像',docker_unavailable:'本机Docker尚不可用',runner_rebuild_required:'运行器脚本已更新，需要重新构建镜像',native_runtime_changed:'运行环境与冻结方案不一致',one_output_per_input_row_required:'输出长度与输入行情不一致',native_execution_failed:'本机执行失败',cancelled:'用户取消'};
export function readNativeComparison(value:unknown):NativeComparison {
    if (!object(value)||!['pass','fail','inconclusive'].includes(String(value.status))||!object(value.counts)||!Object.values(value.counts).every(finite)
        ||!strings(value.limitations)||typeof value.start!=='string'||typeof value.end!=='string'||!Array.isArray(value.differences)||value.differences.length>12
        ||!value.differences.every(row=>object(row)&&finite(row.index)&&typeof row.timestamp==='string'&&typeof row.kind==='string'&&['left','right'].every(key=>row[key]===null||typeof row[key]==='boolean'||finite(row[key])))
        || ![value.max_abs_error,value.max_relative_error].every(row=>row===null||typeof row==='string'))throw new Error('Python输出对照记录不完整');
    return value as unknown as NativeComparison;
}
export function readNativePlan(text:string):NativePlan {
    if (text.length>3000000)throw new Error('Python方案超过读取上限');
    const value:unknown=JSON.parse(text);
    if (!object(value)||value.version!==1||value.method!=='original-python-fixed-output-v1'||!object(value.candidate)||!object(value.candidate.parameters)||!object(value.candidate.bindings)
        ||!object(value.source)||!Array.isArray(value.source.files)||!object(value.dataset)||!finite(value.dataset.offset)||!finite(value.dataset.row_count)
        ||!object(value.native)||typeof value.native.entrypoint!=='string'||!Array.isArray(value.native.arguments)||!object(value.policy)||!object(value.environment)||!object(value.environment.runtime)
        ||typeof value.environment.image_id!=='string'||!['python','numpy','pandas'].every(key=>object(value.environment)&&object(value.environment.runtime)&&typeof value.environment.runtime[key]==='string'))throw new Error('Python固定方案版本或环境不完整');
    return value as unknown as NativePlan;
}
export function readNativeResult(text:string):NativeResult {
    if (text.length>6000000)throw new Error('Python输出超过读取上限');
    const value:unknown=JSON.parse(text);
    if (!object(value)||value.version!==1||value.method!=='original-python-fixed-output-v1'||value.independent_validation!==false||value.platform_equivalence!=='unverified'
        ||typeof value.reason!=='string'||!['completed','failed','cancelled'].includes(String(value.status)))throw new Error('Python结果版本或证据边界无效');
    if (value.status==='completed'){
        readNativeComparison(value.comparison);
        if (!Array.isArray(value.native_values)||value.native_values.length>20000||!value.native_values.every(row=>row===null||typeof row==='boolean'||finite(row)))throw new Error('Python输出序列无效');
    }else if (value.comparison!==null||value.native_values!==null)throw new Error('失败或取消不能附加成功输出');
    return value as unknown as NativeResult;
}
