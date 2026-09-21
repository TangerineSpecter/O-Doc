import {useEffect, useState} from 'react';
import {
    listArticleTemplates,
    loadUserArticleTemplates,
    persistUserArticleTemplates,
    removeUserArticleTemplate,
    saveUserArticleTemplate,
    subscribeUserArticleTemplates,
    type ArticleTemplate,
    type UserArticleTemplateInput,
} from '../utils/articleTemplates';

export function useUserArticleTemplates() {
    const [userTemplates, setUserTemplates] = useState<ArticleTemplate[]>(() => loadUserArticleTemplates());

    useEffect(() => {
        const reload = () => setUserTemplates(loadUserArticleTemplates());
        return subscribeUserArticleTemplates(reload);
    }, []);

    const templates = listArticleTemplates(userTemplates);

    const save = (input: UserArticleTemplateInput) => {
        const result = saveUserArticleTemplate(loadUserArticleTemplates(), input);
        if (result.ok) {
            persistUserArticleTemplates(result.templates);
            setUserTemplates(result.templates);
        }
        return result;
    };

    const remove = (id: string) => {
        const next = removeUserArticleTemplate(loadUserArticleTemplates(), id);
        persistUserArticleTemplates(next);
        setUserTemplates(next);
    };

    return {templates, userTemplates, save, remove};
}
