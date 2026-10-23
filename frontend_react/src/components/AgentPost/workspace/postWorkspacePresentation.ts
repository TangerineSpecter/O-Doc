import { Article as ArticleType } from "../../../api/article";

export const formatPostTime = (value?: string) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value.replace('T', ' ').slice(0, 16);
    const pad = (num: number) => String(num).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const getPostSummary = (post: ArticleType) => {
    if (post.postSummary?.trim()) return post.postSummary.trim();
    return (post.content || '').replace(/[#*`>~-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140);
};
