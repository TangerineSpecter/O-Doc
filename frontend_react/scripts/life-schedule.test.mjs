import assert from 'node:assert/strict';
import {after, test} from 'node:test';
import {setupServer} from 'msw/node';
import {localHandlers, unhandledLocalApi} from '../src/mocks/local.ts';
import {lifeItems, day} from '../src/mocks/agentWorld/residents.ts';
const location = new URL('http://localhost/?mockState=populated');
const previousLocation = Object.getOwnPropertyDescriptor(globalThis, 'location');
Object.defineProperty(globalThis, 'location', {value: location, configurable: true});
const original = lifeItems.slice();
const sample = lifeItems[0];
lifeItems.splice(0, lifeItems.length, ...Array.from({length: 122}, (_, i) => ({...sample,
    id:`overflow-${i}`, source: i<10 || i>=100 && i<110 ? 'schedule' : 'interleaved',
    activity: i<10 || i>=100 && i<110 ? 'farm' : 'cooking',
    scheduledAt:`${day}T${String(8+Math.floor(i/60)).padStart(2,'0')}:${String(i%60).padStart(2,'0')}:00+08:00`,
    status:i<100?'completed':'pending', actorId:i%2?'a':'b',
})));
const server = setupServer(...localHandlers, unhandledLocalApi);
server.listen({onUnhandledRequest:'error'});
after(() => {server.close();lifeItems.splice(0,lifeItems.length,...original);if(previousLocation)Object.defineProperty(globalThis,'location',previousLocation);else Reflect.deleteProperty(globalThis,'location');});
async function get(query='') {
 const response = await fetch(`http://localhost/api/settings/agent-world/life/schedule/?start=${day}&end=${day}&${query}`);
 return {status:response.status,...await response.json()};
}
test('full today and source filtering include records after the first 100',async()=>{
 const all=await get('view=today&source=all');
 assert.equal(all.data.items.length,122);assert.deepEqual(all.data.counts,{main:20,interleaved:102});
 const main=await get('view=today&source=main');assert.equal(main.data.total,20);assert.equal(main.data.summary.pending,10);
 const completed=await get('view=today&source=main&status=completed');assert.equal(completed.data.total,10);assert.equal(completed.data.summary.pending,10);
 const page1=await get('source=interleaved');const page2=await get('source=interleaved&page=2');
 assert.equal(page1.data.total,102);assert.equal(page1.data.items.length,100);assert.equal(page2.data.items.length,2);
 const actor=await get('source=main&actorId=a');assert.equal(actor.data.total,10);
 assert.ok(actor.data.items.every(i=>i.actorId==='a'));
});
test('empty, error and slow use mocks and retain fail-closed fallback',async()=>{
 location.search='?mockState=empty';assert.equal((await get('view=today&source=main')).data.total,0);
 location.search='?mockState=error';assert.equal((await get()).status,503);
 location.search='?mockState=slow';const started=Date.now();assert.equal((await get('view=today')).data.total,122);assert.ok(Date.now()-started>=1600);
 location.search='?mockState=populated';
 assert.equal((await fetch('http://localhost/api/settings/agent-world/unmatched-life/')).status,501);
});
