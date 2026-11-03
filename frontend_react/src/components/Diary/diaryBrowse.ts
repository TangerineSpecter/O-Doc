import {diaryMoods, diaryWeather, type DiaryEntry, type DiaryMood} from '../../types/api/diary';

export type DiaryBrowseMode = 'all' | 'mood' | 'weather' | 'tags';

export interface DiaryBrowseSelection {
    mode: DiaryBrowseMode;
    value: string | null;
}

export function matchesDiarySelection(entry: DiaryEntry, selection: DiaryBrowseSelection): boolean {
    if (selection.mode === 'all' || selection.value === '') return true;
    if (selection.mode === 'tags') {
        return selection.value === null ? entry.tags.length === 0 : entry.tags.includes(selection.value);
    }
    return selection.value === null ? !entry[selection.mode] : entry[selection.mode] === selection.value;
}

export interface MoodTheme {
    fill: string;
    ring: string;
    badgeBg: string;
    badgeText: string;
    dot: string;
    phrase: string;
    en: string;
}

export const MOOD_THEMES: Record<DiaryMood, MoodTheme> = {
    '': {
        fill: '#F4F4F5',
        ring: '#D4D4D8',
        badgeBg: 'bg-zinc-100 border-zinc-200',
        badgeText: 'text-zinc-600',
        dot: '#A1A1AA',
        phrase: '未标记',
        en: 'UNMARKED',
    },
    happy: {
        fill: '#FEF08A',
        ring: '#EAB308',
        badgeBg: 'bg-white border-zinc-200',
        badgeText: 'text-zinc-900',
        dot: '#EAB308',
        phrase: '明朗愉悦',
        en: 'JOYFUL',
    },
    calm: {
        fill: '#BBF7D0',
        ring: '#10B981',
        badgeBg: 'bg-white border-zinc-200',
        badgeText: 'text-zinc-900',
        dot: '#10B981',
        phrase: '松弛平静',
        en: 'SERENE',
    },
    excited: {
        fill: '#FED7AA',
        ring: '#F97316',
        badgeBg: 'bg-white border-zinc-200',
        badgeText: 'text-zinc-900',
        dot: '#F97316',
        phrase: '灵感雀跃',
        en: 'INSPIRED',
    },
    tired: {
        fill: '#E2E8F0',
        ring: '#64748B',
        badgeBg: 'bg-white border-zinc-200',
        badgeText: 'text-zinc-900',
        dot: '#64748B',
        phrase: '需要放空',
        en: 'RESTING',
    },
    sad: {
        fill: '#BFDBFE',
        ring: '#3B82F6',
        badgeBg: 'bg-white border-zinc-200',
        badgeText: 'text-zinc-900',
        dot: '#3B82F6',
        phrase: '安静独处',
        en: 'MELANCHOLY',
    },
    angry: {
        fill: '#FECDD3',
        ring: '#F43F5E',
        badgeBg: 'bg-white border-zinc-200',
        badgeText: 'text-zinc-900',
        dot: '#F43F5E',
        phrase: '情绪释放',
        en: 'INTENSE',
    },
};

export function getMoodLabel(mood: DiaryEntry['mood']): string {
    return diaryMoods.find(m => m.value === mood)?.label || '';
}

export function getWeatherLabel(weather: DiaryEntry['weather']): string {
    return diaryWeather.find(w => w.value === weather)?.label || '';
}
