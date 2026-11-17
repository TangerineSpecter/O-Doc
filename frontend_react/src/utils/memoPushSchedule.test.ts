import assert from 'node:assert/strict';
import {test} from 'node:test';
import {runScheduledMemoPush} from './memoPushSchedule';
import type {MemosPushConfig} from '../types/api/setting';

test('同一时段按账号去重，隔天推送按当地日历跨过夏令时', async t => {
    const previousZone = process.env.TZ;
    process.env.TZ = 'America/New_York';
    t.after(() => {
        if (previousZone) process.env.TZ = previousZone;
        else delete process.env.TZ;
        Reflect.deleteProperty(globalThis, 'localStorage');
    });
    const stored = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {configurable: true, value: {
        getItem: (key: string) => stored.get(key), setItem: (key: string, value: string) => stored.set(key, value),
    }});
    t.mock.timers.enable({apis: ['Date'], now: new Date('2026-03-07T10:00:00-05:00')});
    const config: MemosPushConfig = {enabled: true, frequency: 'everyTwoDays', pushTime: '10:00', weekday: '1', monthDay: '1'};
    const pushed: string[] = [];
    const push = async (key: string) => pushed.push(key);
    await runScheduledMemoPush('a', config, () => false, push);
    await runScheduledMemoPush('a', config, () => true, push);
    await runScheduledMemoPush('a', config, () => true, push);
    await runScheduledMemoPush('b', config, () => true, push);
    t.mock.timers.setTime(new Date('2026-03-08T10:00:00-04:00').getTime());
    await runScheduledMemoPush('a', config, () => true, push);
    t.mock.timers.setTime(new Date('2026-03-09T10:00:00-04:00').getTime());
    await runScheduledMemoPush('a', config, () => true, push);
    assert.deepEqual(pushed, ['2026-03-07:everyTwoDays:10:00', '2026-03-07:everyTwoDays:10:00', '2026-03-09:everyTwoDays:10:00']);
});
