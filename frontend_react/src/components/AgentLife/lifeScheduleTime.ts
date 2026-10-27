import type {LifeItem} from '../../types/api/agentLife';

// Older recovery passes could move the life item without moving the appointment.
export function lifeScheduleTime(item: LifeItem): string {
    return item.reservation?.prepareAt || item.scheduledAt;
}
