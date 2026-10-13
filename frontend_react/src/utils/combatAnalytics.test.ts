import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import {sortCombatResidents, combatDuration} from './combatAnalytics.ts';
import type {CombatAnalyticsResident} from '../types/api/residentAnalytics.ts';
const resident=(id:string,kills:number,bossKills:number,experience:number,successRate:number|null)=>({id,kills,bossKills,experience,successRate} as CombatAnalyticsResident);
test('kill ranking uses boss, experience and stable identity for ties without mutating input',()=>{
    const rows=[resident('b',5,1,100,50),resident('a',5,1,100,100),resident('c',5,2,0,null),resident('d',8,0,0,0)];
    assert.deepEqual(sortCombatResidents(rows,'kills',true).map(row=>row.id),['d','c','a','b']);
    assert.deepEqual(rows.map(row=>row.id),['b','a','c','d']);
});
test('success rate keeps unknown last in either direction and supports empty data',()=>{
    const rows=[resident('a',0,0,0,null),resident('b',0,0,0,0),resident('c',0,0,0,100)];
    assert.deepEqual(sortCombatResidents(rows,'successRate',true).map(row=>row.id),['c','b','a']);
    assert.deepEqual(sortCombatResidents(rows,'successRate',false).map(row=>row.id),['b','c','a']);
    assert.deepEqual(sortCombatResidents([],'kills',true),[]);
    assert.equal(combatDuration(0),'0 秒'); assert.equal(combatDuration(3660),'1 小时 1 分');
});
