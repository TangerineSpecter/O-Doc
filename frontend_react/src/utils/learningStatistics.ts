import type {CourseData, Evidence} from '../types/api/learning';

export type LearningStatisticsRange = '30d' | '90d' | 'all';

export interface LearningSkillTrend {
    independent: Evidence[];
    assistedCount: number;
    firstScore: number | null;
    lastScore: number | null;
    change: number | null;
    latestDate: string;
}

export interface LearningKnowledgeTrend {
    id: string;
    name: string;
    recognition: LearningSkillTrend;
    expression: LearningSkillTrend;
    latestDate: string;
}

export interface LearningStatistics {
    exerciseCount: number;
    studyDayCount: number;
    reviewPassCount: number;
    knowledge: LearningKnowledgeTrend[];
}

function dateInTimeZone(now: Date, timeZone: string): string {
    let parts: Intl.DateTimeFormatPart[];
    try {
        parts = new Intl.DateTimeFormat('en', {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).formatToParts(now);
    } catch {
        parts = new Intl.DateTimeFormat('en', {
            timeZone: 'Asia/Shanghai',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).formatToParts(now);
    }
    const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value || '';
    return `${value('year')}-${value('month')}-${value('day')}`;
}

function startDateForRange(today: string, range: LearningStatisticsRange): string | null {
    if (range === 'all') return null;
    const [year, month, day] = today.split('-').map(Number);
    const days = range === '30d' ? 30 : 90;
    return new Date(Date.UTC(year, month - 1, day - days + 1)).toISOString().slice(0, 10);
}

function skillTrend(evidence: Evidence[], startDate: string | null, today: string): LearningSkillTrend {
    const selected = evidence.filter(item => item.date <= today && (!startDate || item.date >= startDate));
    // The API returns evidence in submission order; a stable date sort preserves same-day order.
    const independent = selected.filter(item => !item.assisted).sort((a, b) => a.date.localeCompare(b.date));
    const firstScore = independent[0]?.score ?? null;
    const lastScore = independent[independent.length - 1]?.score ?? null;
    return {
        independent,
        assistedCount: selected.filter(item => item.assisted).length,
        firstScore,
        lastScore,
        change: firstScore === null || lastScore === null || independent.length < 2 ? null : Math.round((lastScore - firstScore) * 10) / 10,
        latestDate: selected.reduce((latest, item) => item.date > latest ? item.date : latest, ''),
    };
}

export function buildLearningStatistics(
    course: CourseData,
    range: LearningStatisticsRange,
    now = new Date(),
): LearningStatistics {
    const today = dateInTimeZone(now, course.config?.timezone || 'Asia/Shanghai');
    const startDate = startDateForRange(today, range);
    const sourceSkills = course.skills || [];
    const knowledge = (course.skills || []).map(point => {
        const recognition = skillTrend(point.recognition.evidence, startDate, today);
        const expression = skillTrend(point.expression.evidence, startDate, today);
        return {
            id: point.id,
            name: point.name,
            recognition,
            expression,
            latestDate: recognition.latestDate > expression.latestDate ? recognition.latestDate : expression.latestDate,
        };
    }).filter(point => point.latestDate);

    const exerciseIds = new Set<string>();
    const studyDays = new Set<string>();
    const reviewPasses = new Set<string>();
    for (const point of sourceSkills) {
        for (const kind of ['recognition', 'expression'] as const) {
            const selected = point[kind].evidence.filter(item => item.date <= today && (!startDate || item.date >= startDate));
            for (const evidence of selected) {
                exerciseIds.add(evidence.exerciseId);
                studyDays.add(evidence.date);
                if (!evidence.assisted && evidence.review && evidence.score >= 80) {
                    reviewPasses.add(`${point.id}:${kind}:${evidence.exerciseId}`);
                }
            }
        }
    }

    return {
        exerciseCount: exerciseIds.size,
        studyDayCount: studyDays.size,
        reviewPassCount: reviewPasses.size,
        knowledge: knowledge.sort((a, b) => b.latestDate.localeCompare(a.latestDate) || a.name.localeCompare(b.name)),
    };
}
