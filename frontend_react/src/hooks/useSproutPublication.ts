import {useEffect, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {getAnthologyList} from '../api/anthology';
import {saveSproutArticle} from '../api/sprout';
import type {Anthology} from '../types/api/anthology';

export function useSproutPublication(open: boolean, id: string | undefined, refresh: () => Promise<unknown>) {
    const navigate = useNavigate();
    const [collections, setCollections] = useState<Anthology[]>([]);
    const [collection, setCollection] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    useEffect(() => {
        if (!open) return;
        let disposed = false;
        getAnthologyList('article').then(rows => {if (!disposed) setCollections(rows.filter(row => row.canManage !== false));})
            .catch((e: Error) => {if (!disposed) setError(e.message);});
        return () => {disposed = true;};
    }, [open]);
    const save = async () => {
        if (!id || saving) return;
        setSaving(true); setError('');
        try {
            const article = await saveSproutArticle(id, {collId: collection});
            await refresh();
            navigate(`/article/${article.collId}/${article.articleId}`);
        } catch (e) {setError((e as Error).message);}
        finally {setSaving(false);}
    };
    return {collections, collection, setCollection, saving, error, save};
}
