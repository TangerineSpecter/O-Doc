import type {MT4Event} from '../../types/api/mt4Archive';

/** Sample at most 1000 bars while preserving the minimum and maximum in each interval. */
export function sampleLotEvents(events: MT4Event[]): {event: MT4Event; index: number}[] {
    if (events.length <= 1000) return events.map((event, index) => ({event, index}));
    const size = Math.ceil(events.length / 500);
    const sample: {event: MT4Event; index: number}[] = [];
    for (let start = 0; start < events.length; start += size) {
        const end = Math.min(events.length, start + size);
        let low = start, high = start;
        for (let i = start + 1; i < end; i++) {
            if (Number(events[i].lots) < Number(events[low].lots)) low = i;
            if (Number(events[i].lots) > Number(events[high].lots)) high = i;
        }
        for (const index of [...new Set([low, high])].sort((a, b) => a - b)) sample.push({event: events[index], index});
    }
    return sample;
}
