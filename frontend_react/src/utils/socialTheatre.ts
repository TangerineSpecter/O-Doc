import type {SocialTheatreEvent} from '../types/api/social';

/** The history endpoint sorts future schedules before the current discussion. */
export function selectTheatreEvent(items: readonly SocialTheatreEvent[]): SocialTheatreEvent | null {
    const scheduled = items.filter(row => row.status === 'scheduled')
        .sort((left, right) => Date.parse(left.scheduledAt) - Date.parse(right.scheduledAt));
    return items.find(row => row.status === 'running')
        || items.find(row => row.status === 'searching')
        || scheduled[0] || items[0] || null;
}

export function theatrePollInterval(status?: SocialTheatreEvent['status']): number {
    return status === 'running' || status === 'searching' ? 6000 : 30000;
}
