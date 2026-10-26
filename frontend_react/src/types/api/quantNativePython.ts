export type NativeScalar=number|boolean|string|null;
export type NativeColumn='open'|'high'|'low'|'close'|'volume';
export type NativeArgument={name:string;kind:'series';column:NativeColumn}|{name:string;kind:'dataframe';columns:(NativeColumn|'timestamp')[]}|{name:string;kind:'parameter';parameter:string}|{name:string;kind:'literal';value:NativeScalar};
export interface NativeOptions {
    source:{id:string;contentHash:string;files:string[];entrypoints:string[];signatures:{name:string;supported:boolean;arguments:{name:string;defaultText:string}[]}[];textEncoding:string;note:string}|null;
    runner:{available:boolean;environmentJson:string|null;reason:string};supported:string;
    otherPlatforms:{platform:string;available:false;reason:string}[];
}
export interface NativePythonInput {
    requestKey:string;name:string;sourceId:string;datasetId:string;bindings:{name:string;column:NativeColumn}[];
    parameters:{name:string;value:Exclude<NativeScalar,null>}[];entrypoint:string;arguments:NativeArgument[];
    index:'range'|'timestamps';outputColumn:string;offset:number;rowCount:number;seconds:number;
    absoluteTolerance:number;relativeTolerance:number;warmupBars:number;analyze:boolean;
}
export interface NativePythonRecord {
    id:string;candidateId:string;name:string;createdAt:string;status:string;cancelRequested:boolean;error:string;
    verdict:'pass'|'fail'|'inconclusive'|null;contentHash:string;planJson?:string;resultJson?:string|null;
    analysis?:{sourceId:string;entryId:string;runId:string|null;status:string;error:string;reportId:string|null;previousReportId?:string|null;audit?:import('./quantNativeReview').NativeReviewWorkflow|null;historyTotal?:number;history?:NativeReviewHistoryItem[]}|null;
}
export interface NativeReviewHistoryItem {runId:string;status:string;error:string;createdAt:string;modelName:string;reportId:string|null;audit:import('./quantNativeReview').NativeReviewWorkflow|null}
export interface NativeEnvironment {
    image_id:string;os:string;architecture:string;runtime:{protocol:string;python:string;numpy:string;pandas:string;machine:string;supervisor_sha256:string;child_sha256:string};
    limits:{network:string;source_uid:number;host_mounts:false;memory_mib:number;cpus:number;pids:number;tmp_mib:number;maximum_seconds:number;root_filesystem:string};
}
export interface NativeComparison {
    status:'pass'|'fail'|'inconclusive';counts:Record<string,number>;start:string;end:string;max_abs_error:string|null;max_relative_error:string|null;
    differences:{index:number;timestamp:string;left:NativeScalar;right:NativeScalar;kind:string}[];limitations:string[];
}
export interface NativePlan {
    version:1;method:'original-python-fixed-output-v1';candidate:{id:string;hash:string;parameters:Record<string,NativeScalar>;bindings:Record<string,string>};
    source:{id:string;hash:string;main:string;files:{path:string;sha256:string;role:string}[]};
    dataset:{id:string;hash:string;offset:number;row_count:number};native:{entrypoint:string;arguments:NativeArgument[];index:string;output_column:string;seconds:number;argument_policy:string};
    policy:{absolute_tolerance:number;relative_tolerance:number;warmup_bars:number};environment:NativeEnvironment;analyze:boolean;
}
export interface NativeResult {
    version:1;method:'original-python-fixed-output-v1';status:'completed'|'failed'|'cancelled';reason:string;
    native_values:(number|boolean|null)[]|null;comparison:NativeComparison|null;independent_validation:false;platform_equivalence:'unverified';
}
