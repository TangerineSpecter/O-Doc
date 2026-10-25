import assert from 'node:assert/strict';
import {test} from 'node:test';
import {freezeCriteria,readCriteria,assessCriteria,readCriteriaAssessment} from './quantValidationCriteria.ts';
import type {QuantCriteriaInput} from '../types/api/quantValidationCriteria.ts';
const output={final:{total_return:.06,max_drawdown:.08,entries:3,bars:10,missing_signals:0,start:'a',end:'b'},baseline:{total_return:.04,bars:10,start:'a',end:'b'}};
const request={mode:'fresh',imported_after_registration:true,audit:{complete_scan:true,conflict_count:0}};
const audit={complete_scan:true,conflict_count:0};
test('registration rejects unknown, empty, boolean, nonfinite and out of range inputs',()=>{
    for (const value of [{},{maxDrawdown:2},{minEntries:true},{minTotalReturn:NaN},{minTotalReturn:Infinity},{surprise:0}]) assert.throws(()=>freezeCriteria(value as QuantCriteriaInput));
    const rules=freezeCriteria({maxDrawdown:.1});assert.deepEqual(readCriteria(rules),rules);
    assert.throws(()=>readCriteria({...rules,version:true}));assert.throws(()=>readCriteria({...rules,fraction_tolerance:.5}));
});
test('verdict uses conjunction, exact interval baseline and unknown metrics without zero substitution',()=>{
    const rules=freezeCriteria({minTotalReturn:.1,maxDrawdown:.1,minExcessReturn:0});
    const packet={...output,final:{...output.final,max_drawdown:undefined},baseline:{...output.baseline,end:'different'}};
    const value=assessCriteria(rules,'completed',packet,request,audit);
    assert.equal(value.status,'not_met');assert.deepEqual(value.rules.map(row=>row.status),['not_met','unknown','unknown']);
    const stopped=assessCriteria(rules,'cancelled',output,request,audit);
    assert.equal(stopped.status,'insufficient');assert.ok(stopped.rules.every(row=>row.observed===null));
});
test('metric success is separate from scope eligibility and weak rules do not imply positive returns',()=>{
    const rules=freezeCriteria({maxDrawdown:.1,minEntries:3,minSignalCoverage:1});
    const value=assessCriteria(rules,'completed',{...output,final:{...output.final,total_return:-.2}},request,audit);
    assert.equal(value.status,'met');assert.equal(value.eligibility,'fresh_scope_criteria_met');assert.equal(value.independent_validation,false);
    assert.equal(assessCriteria(rules,'completed',output,{...request,mode:'replication'},audit).eligibility,'criteria_met_reuse_or_audit_unknown');
    assert.equal(assessCriteria(rules,'completed',output,request,{complete_scan:true,conflict_count:false}).eligibility,'criteria_met_reuse_or_audit_unknown');
    assert.equal(assessCriteria(rules,'completed',output,request,{...audit,complete_scan:false}).eligibility,'criteria_met_reuse_or_audit_unknown');
});
test('fixed tolerance is honored and altered verdict or observations cannot be decoded',()=>{
    const rules=freezeCriteria({minTotalReturn:.06}),near={...output,final:{...output.final,total_return:.06-1e-13}};
    const value=assessCriteria(rules,'completed',near,request,audit);assert.equal(value.status,'met');
    assert.deepEqual(readCriteriaAssessment(value,rules,'completed',near,request,audit),value);
    assert.throws(()=>readCriteriaAssessment({...value,status:'not_met'},rules,'completed',near,request,audit));
    const forged=structuredClone(value);forged.rules[0].observed=.2;
    assert.throws(()=>readCriteriaAssessment(forged,rules,'completed',near,request,audit));
});
