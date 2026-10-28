/** Match the list API's optional summary projection without mutating fixtures. */
export function projectArticleList<T extends {content?: string; mindMap?: unknown}>(items: T[], url: URL) {
    if (!['1', 'true'].includes(url.searchParams.get('summary') || '')) return items;
    return items.map(article => {
        const {content, mindMap, ...summary} = article;
        void content;
        void mindMap;
        return summary;
    });
}
