import assert from 'node:assert/strict';
import {test} from 'node:test';
import {reservationItems} from './reservations';
import {lifeScheduleResponse} from './lifeSchedule';
import {resolveLocalRoute} from './routes';

test('reservation source is separate from main/free activities before pagination', () => {
    const result=lifeScheduleResponse(reservationItems,new URL('http://local.test/?source=reservation&view=today'));
    assert.equal(result.items.length,3);assert.equal(result.counts?.main,0);assert.equal(result.counts?.interleaved,0);assert.equal(result.counts?.reservation,3);
    assert.equal(lifeScheduleResponse(reservationItems,new URL('http://local.test/?source=main')).items.length,0);
});
test('local detail and cancellation update the whole team', async () => {
    Object.defineProperty(globalThis,'location',{value:{search:''},configurable:true});
    const root='http://local.test/api/settings/agent-world/life/schedule/';
    const detail=await resolveLocalRoute(new Request(root+reservationItems[0].id+'/')) as typeof reservationItems[number];
    assert.equal(detail.reservation?.members.length,3);
    await resolveLocalRoute(new Request(root+detail.id+'/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'cancel',reason:'测试取消预约'})}));
    for (const item of reservationItems) {
        const value=await resolveLocalRoute(new Request(root+item.id+'/')) as typeof item;
        assert.equal(value.reservation?.status,'cancelled');assert.equal(value.status,'cancelled');
    }
});
