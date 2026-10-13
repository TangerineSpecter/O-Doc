import type {CombatAnalyticsResident} from '../types/api/residentAnalytics';
export type CombatRankingColumn = 'kills' | 'bossKills' | 'explorations' | 'successRate' | 'elapsedSeconds' | 'experience';
export const combatDuration = (seconds: number) => seconds < 60 ? `${seconds} 秒` : seconds < 3600 ? `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒` : `${Math.floor(seconds / 3600)} 小时 ${Math.floor(seconds % 3600 / 60)} 分`;
export function sortCombatResidents(rows: CombatAnalyticsResident[], column: CombatRankingColumn, descending: boolean) {
    return [...rows].sort((a,b) => {
        const left = a[column], right = b[column];
        if (left === null || right === null) return left === right ? a.id.localeCompare(b.id) : left === null ? 1 : -1;
        return (left - right) * (descending ? -1 : 1) || b.kills - a.kills || b.bossKills - a.bossKills || b.experience - a.experience || a.id.localeCompare(b.id);
    });
}
