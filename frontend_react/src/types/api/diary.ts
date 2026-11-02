export interface DiaryDraft {
    title: string;
    content: string;
    entryDate: string;
    coverUrl: string;
    coverAssetId: string | null;
    imageAssetIds: string[];
    mood: DiaryMood;
    weather: DiaryWeather;
    tags: string[];
}
export interface DiaryEntry extends DiaryDraft {
    diaryId: string;
    createdAt: string;
    updatedAt: string;
}
export const diaryMoods = [{value: 'happy', label: '开心'}, {value: 'calm', label: '平静'}, {value: 'excited', label: '兴奋'}, {value: 'tired', label: '疲惫'}, {value: 'sad', label: '低落'}, {value: 'angry', label: '生气'}] as const;
export const diaryWeather = [{value: 'sunny', label: '晴天'}, {value: 'cloudy', label: '多云'}, {value: 'overcast', label: '阴天'}, {value: 'rainy', label: '下雨'}, {value: 'snowy', label: '下雪'}, {value: 'windy', label: '有风'}] as const;
export type DiaryMood = typeof diaryMoods[number]['value'] | '';
export type DiaryWeather = typeof diaryWeather[number]['value'] | '';
export interface DiaryLibraryPhoto {imageId: string; assetId: string | null; title: string; selectable: boolean; reason: string}
export interface DiaryLibraryGroup {id: string; title: string; photos: DiaryLibraryPhoto[]}
export interface DiaryLibraryResponse {collections: {id: string; title: string; count: number}[]; groups: DiaryLibraryGroup[]; page: number; hasMore: boolean}
