import {useEffect, useState} from 'react';
import {getDiaryPhotoLibrary} from '../api/diaryLibrary';
import type {DiaryLibraryResponse} from '../types/api/diary';
export function useDiaryPhotoLibrary(collId: string, keyword: string, page: number) {
    const [result, setResult] = useState<{key: string; data?: DiaryLibraryResponse; error?: string}>({key: ''});
    const [revision, setRevision] = useState(0);
    const key = JSON.stringify([collId, keyword, page, revision]);
    useEffect(() => {
        const controller = new AbortController();
        const timer = setTimeout(() => {
            getDiaryPhotoLibrary(collId, keyword, page, controller.signal).then(data => {
                if (!controller.signal.aborted) setResult({key, data});
            }).catch(() => {if (!controller.signal.aborted) setResult({key, error: '图片文集加载失败，请重试'});});
        }, keyword ? 250 : 0);
        return () => {clearTimeout(timer); controller.abort();};
    }, [collId, keyword, page, key]);
    return {collections: result.data?.collections || [], data: result.key === key ? result.data : undefined, error: result.key === key ? result.error : '', loading: result.key !== key, retry: () => setRevision(n => n + 1)};
}
