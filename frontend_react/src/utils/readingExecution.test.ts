import assert from 'node:assert/strict';
import {test} from 'node:test';
import {executionDuration, mergeExecutionEvents, modelOutputProgress, pendingModelRequest} from './readingExecution.ts';
import type {ReadingExecutionEvent, ReadingRun} from '../types/bookAnalysis.ts';

const event = (id: number, kind: string, requestId = 'request1'): ReadingExecutionEvent => ({id, kind, title: kind, level: 'info', details: {requestId}, createdAt: '2026-09-15T14:00:00Z'});
const run = (events: ReadingExecutionEvent[], state: ReadingRun['state'] = 'running'): ReadingRun => ({id: 'run1', state, events, stage: '分段抽取', error: '', total: 1, completed: 0, cancelRequested: false, indexState: '', kind: 'analyze'});

test('pending requests end on matching response or request failure', () => {
    const start = event(1, 'model_request_started');
    assert.equal(pendingModelRequest(run([start]))?.id, 1);
    assert.equal(pendingModelRequest(run([start, event(2, 'model_response')])), undefined);
    assert.equal(pendingModelRequest(run([start, event(2, 'model_request_failed')])), undefined);
    assert.equal(pendingModelRequest(run([start], 'failed')), undefined);
});
test('stream progress belongs to the active request, not an earlier failed attempt', () => {
    const start = event(1, 'model_request_started');
    const first = {...event(2, 'model_first_output'), details: {requestId: 'request1', chars: 12}};
    const more = {...event(3, 'model_progress'), details: {requestId: 'request1', chars: 420}};
    assert.equal(modelOutputProgress([start, first, more], start)?.details.chars, 420);
    const retry = event(5, 'model_request_started', 'request2');
    assert.equal(modelOutputProgress([start, first, more, event(4, 'model_request_failed'), retry], retry), undefined);
    assert.equal(pendingModelRequest(run([start, first, more, event(4, 'model_request_failed'), retry]))?.id, 5);
});
test('repair calls and worker recovery do not display an abandoned request as pending', () => {
    const events = [event(1, 'model_request_started'), event(2, 'model_response'), event(3, 'model_request_started', 'repair')];
    assert.equal(pendingModelRequest(run(events))?.id, 3);
    assert.equal(pendingModelRequest(run([...events, event(4, 'worker_claimed')])), undefined);
});
test('overlapping execution pages are deduplicated and sorted by sequence', () => {
    assert.deepEqual(mergeExecutionEvents([event(3, 'last'), event(2, 'middle')], [event(1, 'first'), event(2, 'middle')]).map(e => e.id), [1, 2, 3]);
    assert.equal(executionDuration(125), '2 分 5 秒');
    assert.equal(executionDuration(-5), '0 秒');
});
