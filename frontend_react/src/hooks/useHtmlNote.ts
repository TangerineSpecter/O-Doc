import {useEffect, useState} from 'react';
import {getHtmlPreview} from '../api/htmlNote';

export const useHtmlNote = (articleId?: string) => {
    const [html, setHtml] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [revision, setRevision] = useState(0);
    useEffect(() => {
        const controller = new AbortController();
        setHtml('');
        setError('');
        setLoading(true);
        if (!articleId) { setLoading(false); return; }
        getHtmlPreview(articleId, controller.signal).then(value => {
            if (!controller.signal.aborted) setHtml(value);
        }).catch(reason => {
            if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '预览加载失败');
        }).finally(() => {
            if (!controller.signal.aborted) setLoading(false);
        });
        return () => controller.abort();
    }, [articleId, revision]);
    return {html, error, loading, retry: () => setRevision(value => value + 1)};
};
