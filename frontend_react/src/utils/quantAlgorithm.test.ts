import test from 'node:test';
import assert from 'node:assert/strict';
import sourceAlgorithms from '../mocks/quant/sourceAlgorithmSamples.json' with {type: 'json'};
import type {QuantFactorData, QuantFactorCandidate} from '../types/api/quant';
import {algorithmCode, algorithmProfile, algorithmSimilarity, readAlgorithmProgram, containsAlgorithmProgram} from './quantAlgorithm';
import {mockFactorExport} from '../mocks/quant/exports';
import {mockQualification} from '../mocks/quant/qualification';
const samples = sourceAlgorithms as QuantFactorData[];

test('source algorithm samples contain full computation and external OHLCV inputs', () => {
    for (const sample of samples) {
        const program = readAlgorithmProgram(sample.expression)!;
        assert.ok(program.steps.length > 20);
        assert.deepEqual(sample.inputs.map(row => row.name), ['close']);
        assert.match(algorithmCode(program), /estimate/);
        assert.ok(!sample.inputs.some(row => ['testStatistic','isAnomaly'].includes(row.name)));
        const proof = mockQualification({data:sample,contentHash:'artificial-compiled-source'} as QuantFactorCandidate);
        assert.equal(proof.automatic_experiment_ready,true);
        assert.equal(algorithmProfile(sample)!.definitionScore,100);
    }
});
test('algorithm property similarity is explicit and does not require an embedding', () => {
    const a = samples[2], b = samples[3];
    const value = algorithmSimilarity(a,b)!;
    assert.ok(value.score > .7);
    assert.equal(Object.values(value.axes).reduce((sum,row) => sum + row.weight,0),100);
    assert.deepEqual(value.shared.inputs,['close']);
    assert.equal(algorithmSimilarity({...a,expression:null},b),null);
});
test('reading rejects malformed algorithm steps without executing code strings', () => {
    assert.equal(readAlgorithmProgram({op:'input',name:'close'}),null);
    assert.equal(readAlgorithmProgram({op:'program',version:1,steps:[],output:'close',output_type:'numeric_series'})!.outputType,'numeric_series');
    assert.throws(() => readAlgorithmProgram({op:'program',version:1,steps:[{kind:'execute',code:'anything'}],output:'value',outputType:'numeric_series'}));
});

test('composite program exports are limited to Python in local mode', () => {
    const data: QuantFactorData = {...samples[0], expression: {op:'add',args:[samples[0].expression!,samples[1].expression!]}};
    assert.equal(containsAlgorithmProgram(data.expression),true);
    assert.equal(containsAlgorithmProgram({op:'input',name:'close'}),false);
    const candidate = {id:'composite-program',sourceId:'local-source',data} as QuantFactorCandidate;
    const result = mockFactorExport(candidate,'python');
    assert.ok(!(result instanceof Response));
    assert.match(result.code,/LOCAL/);
    for(const target of ['pine','mql4','tongdaxin']) {
        const rejected=mockFactorExport(candidate,target);
        assert.ok(rejected instanceof Response);
        assert.equal(rejected.status,400);
    }
});
