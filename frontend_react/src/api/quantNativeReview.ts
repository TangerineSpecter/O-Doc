import request from '../utils/request';
import type {NativeReviewEvidence,NativeReviewStage} from '../types/api/quantNativeReview';
export const nativeReviewApi={evidence:(collection:string,entry:string,run:string,stage:NativeReviewStage,signal?:AbortSignal)=>request.get<never,NativeReviewEvidence>(
    `/quant/${encodeURIComponent(collection)}/entries/${encodeURIComponent(entry)}/runs/${encodeURIComponent(run)}/workflow/${stage}/`,{signal})};
