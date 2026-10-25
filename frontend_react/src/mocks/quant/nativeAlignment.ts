/** Artificial positions for local UI, never a computation of uploaded prices. */
import type {NativeAlignmentAck} from '../../types/api/quantNativeReview';
export function nativeAlignmentFixture(size:number,start:number,available=true,tailMissing=false):NativeAlignmentAck {
    return {method:'fixed-output-missing-alignment-v1',status:available?'available':'unavailable',sample_row_count:size,compared_start_index:start,
        left_first_valid_index:available?20:null,right_first_valid_index:available?20:null,
        missing_mismatch_total:available?(tailMissing?1:0):null,missing_mismatch_indices:available&&tailMissing?[size-1]:[],omitted_missing_mismatches:available?0:null};
}
