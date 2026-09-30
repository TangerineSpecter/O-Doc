import type {PublishMaterial} from '@/types/api/agentPublish';

export function publishMaterialTime(material: PublishMaterial): string {
    if (material.publishedAt) return `发布时间：${material.publishedAt}`;
    const window = material.searchWindow;
    if (window?.startDate) return `搜索接口未返回发布时间 · 检索起始：${window.startDate}${window.endDate ? `（截止 ${window.endDate} 前）` : ''}`;
    if (window?.days) return `搜索接口未返回发布时间 · 已按近 ${window.days} 天检索`;
    if (window?.timeRange) return `搜索接口未返回发布时间 · 检索范围：${window.timeRange}`;
    return '搜索接口未返回发布时间';
}
