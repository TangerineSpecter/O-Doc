/** Keep full history; the common incremental page needs no full-history sort. */
export function mergeEventHistory<T extends {id: string; sequence: number}>(previous: T[], incoming: T[]): T[] {
    if (!incoming.length) return previous;
    const page = [...new Map(incoming.map(event => [event.id, event])).values()]
        .sort((a, b) => a.sequence - b.sequence);
    if (!previous.length) return page;
    const ids = new Set(previous.map(event => event.id));
    if (page[0].sequence > previous[previous.length - 1].sequence && page.every(event => !ids.has(event.id))) {
        return [...previous, ...page];
    }
    const records = new Map(previous.map(event => [event.id, event]));
    for (const event of page) records.set(event.id, event);
    return [...records.values()].sort((a, b) => a.sequence - b.sequence);
}
