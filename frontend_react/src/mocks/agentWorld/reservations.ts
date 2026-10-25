import type {LifeItem} from '../../types/api/agentLife';
import {at, residents} from './residents';

export const reservationItems: LifeItem[] = residents.slice(0, 3).map((resident, i) => ({
    id: `local-reservation-item-${i}`, actorId: resident.id, source: 'reservation',
    originalAt: at(18), scheduledAt: at(18), activity: 'exploration', taskId: 'local-task-exploration',
    status: 'pending', intent: '约好同伴一起探索新芽草甸', budget: '0', spent: '0', recordId: '', result: {},
    context: {adventureReservationId: 'local-reservation', reservationRevision: 1},
    reservation: {id: 'local-reservation', status: 'reserved', dungeonId: 'dungeon.sprout_meadow', dungeonName: '新芽草甸', prepareAt: at(18), startsAt: new Date(new Date(at(18)).getTime()+600_000).toISOString(), endsAt: new Date(new Date(at(18)).getTime()+4_200_000).toISOString(), durationSeconds: 3600, reason: '', runId: 'local-party-exploration',
        members: residents.slice(0, 3).map((r, index) => ({actorId: r.id, name: r.name, jobId: ['job.warrior','job.mage','job.priest'][index], durationSeconds: index === 2 ? 1800 : 3600, status: 'reserved'}))},
}));
