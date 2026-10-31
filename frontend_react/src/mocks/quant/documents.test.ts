import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {resetQuantStateForTests,quantState} from './state.ts';
import {initDocument,offerDocument,resolveDocument} from './documents.ts';
import {seedDemoEntry} from './demoSeed.ts';
import type {QuantDocument} from '../../types/api/quantDocument.ts';
import {collectMockFactors} from './factors.ts';
import {mockDirectory,mockOverview} from './reading.ts';
import type {QuantDirectory} from '../../types/api/quantReading.ts';
beforeEach(()=>resetQuantStateForTests());
function setup(){
    const entry=quantState().entries[0];
    seedDemoEntry(entry);
    const base=entry.reports![0];assert.ok(base);
    const doc=initDocument(entry);
    const next=structuredClone(base);next.id='document-next';next.runId='document-next-run';next.currentRevisionId='';next.revisions=[];
    next.data.totalScore=88;next.data.summary='新的正文说明';next.markdown=next.originalMarkdown='# 新的正文说明';
    entry.reports!.unshift(next);offerDocument(entry,next);
    const get=()=>resolveDocument(new Request('http://localhost/document/'),entry,{}) as QuantDocument;
    const change=(body:Record<string,unknown>)=>resolveDocument(new Request('http://localhost/document/',{method:'POST'}),entry,{expectedRevision:doc.revision,...body});
    return {entry,base,next,doc,get,change};
}
test('local document keeps pending output out of the current reading and factor library',()=>{
    const {entry,base,next,get,change}=setup();
    const before=get();assert.equal(before.report!.markdown,base.markdown);assert.equal(before.pending.length,1);
    assert.ok(!collectMockFactors([entry]).some(row=>row.reportId===next.id));
    const adopted=change({action:'adopt',identity:next.id,sections:['review']}) as QuantDocument;
    assert.equal(adopted.report!.data.totalScore,88);assert.equal(adopted.report!.markdown,before.report!.markdown);
    assert.equal(adopted.sections.factors!.reportId,before.sections.factors!.reportId);
    const restored=change({action:'restore',identity:adopted.history[0].id,sections:['review']}) as QuantDocument;
    assert.equal(restored.report!.data.totalScore,before.report!.data.totalScore);
    assert.equal(restored.report!.markdown,before.report!.markdown);
});
test('local document handles stale submissions, history deletion and no-change sections',()=>{
    const {next,get,change}=setup();const before=get();
    const comparison=change({action:'adopt',identity:next.id,sections:['reading']}) as QuantDocument;
    assert.equal((change({action:'discard',identity:next.id,expectedRevision:before.revision}) as Response).status,409);
    const clear=change({action:'clear_history'}) as QuantDocument;assert.equal(clear.history.length,0);
    assert.equal(clear.report!.markdown,comparison.report!.markdown);
});

test('score-only generated Markdown leaves reading untouched and clears pending after adoption',()=>{
    const {base,next,doc,get,change}=setup();
    base.currentRevisionId='';doc.sections.reading!.revisionId='';
    next.data.summary=base.data.summary;
    const before=get();assert.deepEqual(before.pending[0].changedSections,['review']);
    const adopted=change({action:'adopt',identity:next.id,sections:['review']}) as QuantDocument;
    assert.equal(adopted.pending.length,0);
    assert.equal(adopted.report!.markdown,before.report!.markdown);
    assert.equal(adopted.sections.reading!.reportId,base.id);
});

test('review notes, source changes and memory follow adoption and restoration together',()=>{
    const {entry,base,next,doc,get,change}=setup();
    base.currentRevisionId='';doc.sections.reading!.revisionId='';
    next.data.summary=base.data.summary;next.data.totalScore=base.data.totalScore;
    base.researchMemoryJson=JSON.stringify({items:[{id:'old-evidence'}]});
    next.researchMemoryJson=JSON.stringify({items:[{id:'new-evidence'}]});
    next.data.sourceFindingsNote='本次新审查范围';next.data.memoryNote='本次历史核查说明';
    next.data.sourceChangeReviewVersion=2;
    next.data.sourceChangeFactsJson='{"new":true}';
    next.data.sourceChangeAssessment={summary:'本次源码变化',nodes:[],limitations:[]};
    offerDocument(entry,next);
    assert.deepEqual(get().pending[0].changedSections,['review']);
    const accepted=change({action:'adopt',identity:next.id,sections:['review']}) as QuantDocument;
    assert.equal(accepted.report!.researchMemoryJson,next.researchMemoryJson);
    assert.equal(accepted.report!.data.memoryNote,next.data.memoryNote);
    assert.equal(accepted.report!.data.sourceFindingsNote,next.data.sourceFindingsNote);
    assert.deepEqual(accepted.report!.data.sourceChangeAssessment,next.data.sourceChangeAssessment);
    assert.equal(accepted.report!.markdown,base.originalMarkdown);
    const restored=change({action:'restore',identity:accepted.history[0].id,sections:['review']}) as QuantDocument;
    assert.equal(restored.report!.researchMemoryJson,base.researchMemoryJson);
    assert.equal(restored.report!.data.sourceFindingsNote,base.data.sourceFindingsNote);
    assert.equal(restored.report!.data.sourceChangeAssessment,base.data.sourceChangeAssessment);
});

test('directory and entry overview follow adopted review while the reading report stays old',()=>{
    const {entry,base,next,change,get}=setup();
    const check=(score:number|null)=>{
        assert.equal(mockOverview(entry).researchScore,score);
        assert.equal((mockDirectory([entry],new URLSearchParams()) as QuantDirectory).items[0].researchScore,score);
    };
    check(base.data.totalScore!);
    const adopted=change({action:'adopt',identity:next.id,sections:['review']}) as QuantDocument;
    check(88);assert.equal(mockOverview(entry).defaultReportId,base.id);
    assert.equal(get().report!.data.totalScore,88);
    change({action:'restore',identity:adopted.history[0].id,sections:['review']});
    check(base.data.totalScore!);
});
