import type {AdventurePartySnapshot, CombatEvent} from '../../types/api/combat';

type PartyEvents = AdventurePartySnapshot['events'];

export function mergePartyHistory(previous: PartyEvents, incoming: PartyEvents): PartyEvents {
    return [...new Map([...previous, ...incoming].map(event => [event.id, event])).values()]
        .sort((a, b) => a.sequence - b.sequence);
}

/** Shared actions join the personal receipt, whose elapsed time and rewards are authoritative. */
export function partyObservationRecords(personal: CombatEvent[], shared: PartyEvents): CombatEvent[] {
    const byId = new Map(shared.map(event => [event.id, event]));
    const linked = new Set(personal.map(event => event.payload.sharedEventId).filter(Boolean));
    const result: CombatEvent[] = [];
    let cursor = 0;
    const appendHistory = (before = Infinity) => {
        while (cursor < shared.length && shared[cursor].sequence < before) {
            const event = shared[cursor++];
            if (linked.has(event.id) || !event.payload.events?.length) continue;
            // Older shared facts have no personal clock (e.g. before joining). Never invent one.
            result.push({id: `party:${event.id}`, sequence: event.sequence, kind: event.kind,
                elapsedSeconds: 0, createdAt: '', timelineLabel: `队伍历史 · ${event.payload.round != null ? `第${event.payload.round}回合` : `记录${event.sequence}`}`,
                payload: {events: event.payload.events}});
        }
    };
    for (const event of personal) {
        const partyEvent = byId.get(event.payload.sharedEventId || '');
        if (partyEvent) appendHistory(partyEvent.sequence);
        result.push(partyEvent ? {...event, payload: {...event.payload,
            events: [...(partyEvent.payload.events || []), ...(event.payload.events || [])]}} : event);
    }
    appendHistory();
    return result;
}
