import test from 'node:test';
import assert from 'node:assert/strict';
import {findPath, cellKey, plotCell} from './pathfinding.ts';
test('A* avoids structures and preserves adjacent steps',()=>{
    const blocked=new Set(['3,1','3,2','3,3']);
    const path=findPath({x:1,y:2},{x:5,y:2},blocked,8,8);
    assert.ok(path.length>4);assert.deepEqual(path[path.length-1],{x:5,y:2});
    let previous={x:1,y:2};
    for(const p of path){assert.equal(Math.abs(p.x-previous.x)+Math.abs(p.y-previous.y),1);assert.equal(blocked.has(cellKey(p)),false);previous=p;}
});
test('unreachable target has no route',()=>assert.deepEqual(findPath({x:1,y:1},{x:3,y:3},new Set(['2,3','3,2','4,3','3,4']),6,6),[]));
test('sixteen plots have distinct fixed grid positions',()=>{
    assert.equal(new Set(Array.from({length:16},(_,i)=>cellKey(plotCell(String(i))))).size,16);
    assert.deepEqual(plotCell('0'),{x:3,y:4});assert.deepEqual(plotCell('15'),{x:9,y:10});
});
