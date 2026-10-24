import assert from 'node:assert/strict';
import {test} from 'node:test';
import {PartyEventCursor} from './partyEventCursor';

const event=(sequence:number)=>({id:`event-${sequence}`,sequence,kind:'round',payload:{}});

test('opening history does not replay it; subsequent overlapping snapshots animate once',()=>{
    const cursor=new PartyEventCursor();
    assert.deepEqual(cursor.take(Array.from({length:40},(_,i)=>event(i+1))),[]);
    assert.deepEqual(cursor.take([event(39),event(40),event(41)]),[event(41)]);
    assert.deepEqual(cursor.take([event(40),event(41)]),[]);
    assert.deepEqual(cursor.take([event(42)]),[event(42)]);
});

test('an empty initial snapshot still allows the first future event to animate',()=>{
    const cursor=new PartyEventCursor();
    assert.deepEqual(cursor.take([]),[]);
    assert.deepEqual(cursor.take([event(1)]),[event(1)]);
    assert.deepEqual(cursor.take([]),[]);
    assert.deepEqual(cursor.take([event(1),event(2)]),[event(2)]);
});
