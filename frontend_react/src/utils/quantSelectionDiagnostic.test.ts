import assert from 'node:assert/strict';
import {test} from 'node:test';
import {analyzeSelectionBlocks,readSelectionDiagnostic,selectionPolicy} from './quantSelectionDiagnostic.ts';
const blocks=(a:number[],b:number[])=>analyzeSelectionBlocks({a,b});
test('fixed block ranks expose reversal and ambiguity instead of treating ties as zero risk',()=>{
    const stable=blocks(Array(8).fill(.02),Array(8).fill(.01));assert.equal(stable.retained_count,70);assert.equal(stable.ambiguity_upper,0);
    const reverse=blocks([.02,.02,.02,.02,-.01,-.01,-.01,-.01],[-.01,-.01,-.01,-.01,.02,.02,.02,.02]);
    assert.equal(reverse.reversal_count,34);assert.equal(reverse.ambiguous_count,36);assert.equal(reverse.reversal_fraction_resolved,1);assert.equal(reverse.ambiguity_upper,1);
    const tied=blocks(Array(8).fill(0),Array(8).fill(0));assert.equal(tied.status,'insufficient');assert.equal(tied.reversal_fraction_resolved,null);assert.equal(tied.ambiguity_upper,1);
});
test('decoder rejects forged low risk, missing combinations, inflated independence and source mismatch',()=>{
    const core=blocks(Array(8).fill(0),Array(8).fill(0));
    const fixture={version:1,method:'cscv-fixed-family-mean-net-v1',policy:selectionPolicy,scope:'one_recorded_request_per_fold_fixed_development_family',status:'insufficient',
        binding:{request_id:'source',request_hash:'hash',result_id:'result',result_hash:'hash',dataset_hash:'hash'},final_holdout_used:false,independent_validation:false,limitations:[],
        families:[{fold:null,attempt_ids:['a','b','bad'],attempted:3,status_counts:{evaluated:2,rejected:1,cancelled:0,budget_stopped:0},distinct_evaluated:2,evaluated_duplicates:0,evaluated_ids:['a','b'],
            partitions:{train:[1,61],validation:[63,83]},status:'insufficient',reason:'all_combinations_ambiguous',matrix_hash:'a'.repeat(64),analysis:{available_intervals:80,used_intervals:80,dropped_oldest_intervals:0,block_intervals:10,...core}}]};
    assert.equal(readSelectionDiagnostic(JSON.stringify(fixture),'source').families[0].analysis?.ambiguous_count,70);
    assert.throws(()=>readSelectionDiagnostic(JSON.stringify(fixture),'different'));
    const mutate=(fn:(v:typeof fixture)=>void)=>{const value=structuredClone(fixture);fn(value);assert.throws(()=>readSelectionDiagnostic(JSON.stringify(value),'source'));};
    mutate(v=>{v.families[0].analysis.ambiguity_upper=0;});mutate(v=>{v.families[0].analysis.splits.pop();});
    mutate(v=>{v.independent_validation=true;});mutate(v=>{v.families[0].status_counts.rejected=0;});
    mutate(v=>{v.policy={...v.policy,tie_absolute_tolerance:1};});
});
