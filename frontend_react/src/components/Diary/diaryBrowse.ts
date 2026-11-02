import type {DiaryEntry} from '../../types/api/diary';
export type DiaryBrowseMode = 'all' | 'mood' | 'weather' | 'tags';
export interface DiaryBrowseSelection {mode: DiaryBrowseMode; value: string | null}
export function matchesDiarySelection(entry: DiaryEntry, selection: DiaryBrowseSelection): boolean {
    if (selection.mode === 'all' || selection.value === '') return true;
    if (selection.mode === 'tags') return selection.value === null ? entry.tags.length === 0 : entry.tags.includes(selection.value);
    return selection.value === null ? !entry[selection.mode] : entry[selection.mode] === selection.value;
}

