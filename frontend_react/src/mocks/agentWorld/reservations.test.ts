import assert from 'node:assert/strict';
import {test} from 'node:test';
import {reservationItems} from './reservations';
import {lifeScheduleResponse} from './lifeSchedule';
import {resolveLocalRoute} from './routes';
import {lifeStatusReason} from '../../components/AgentLife/lifeReasonText';
import {lifeItems} from './residents';

test('reservation source is separate from main/free activities before pagination', () => {
    const result=lifeScheduleResponse(reservationItems,new URL('http://local.test/?source=reservation&view=today'));
    assert.equal(result.items.length,3);assert.equal(result.counts?.main,0);assert.equal(result.counts?.interleaved,0);assert.equal(result.counts?.reservation,3);
    assert.equal(lifeScheduleResponse(reservationItems,new URL('http://local.test/?source=main')).items.length,0);
});
test('reservation date, counts and order use its preparation time instead of a displaced item date', () => {
    const original = reservationItems[0];
    const prepared = original.reservation!.prepareAt.slice(0, 10);
    const next = new Date(`${prepared}T00:00:00+08:00`);
    next.setUTCDate(next.getUTCDate() + 1);
    const later = new Date(next.getTime() + 24 * 60 * 60 * 1000);
    const nextDate = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Shanghai'}).format(next);
    const laterDate = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Shanghai'}).format(later);
    const displaced = {...original, scheduledAt: `${nextDate}${original.scheduledAt.slice(10)}`};
    const actual = lifeScheduleResponse([displaced], new URL(`http://local.test/?start=${prepared}&end=${nextDate}&source=reservation`));
    const wrong = lifeScheduleResponse([displaced], new URL(`http://local.test/?start=${nextDate}&end=${laterDate}&source=reservation`));
    assert.equal(actual.items.length, 1); assert.equal(actual.counts?.reservation, 1);
    assert.equal(wrong.items.length, 0); assert.equal(wrong.counts?.reservation, 0);
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
        assert.equal(value.statusReason,'测试取消预约');
    }
    const list=await resolveLocalRoute(new Request(root+'?source=reservation&view=today')) as {items: typeof reservationItems};
    assert.equal(list.items[0].statusReason,'测试取消预约');
});

test('deferred reason comes from the latest revision and legacy text does not claim a cause', () => {
    const item=lifeItems.find(row=>row.status==='deferred')!;
    const list=lifeScheduleResponse([item],new URL('http://local.test/?view=today'));
    assert.equal(lifeStatusReason(list.items[0])?.text,'居民正在执行其他任务，请稍后重试');
    assert.match(lifeStatusReason({...item,statusReason:'故障或离线后顺延，保持原顺序'})!.text,/未记录具体延迟原因/);
    assert.match(lifeStatusReason({...item,statusReason:'',result:{reason:'旧结果'}})!.text,/未记录具体原因/);
});
