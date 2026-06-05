// --- 资源相关类型定义 ---

export interface ArticleSource {
    id: string;
    title: string;
    collId: string;
}

export interface ImageSource {
    id: string;
    title: string;
    collId: string;
}

export interface AgentSource {
    id: string;
    title: string;
}

export interface ResourceItem {
    id: string;
    name: string;
    type: string;
    size: number;
    date: string;
    linked: boolean;
    sourceArticle: ArticleSource | null;
    sourceImage?: ImageSource | null;
    sourceAgent?: AgentSource | null;
    duplicate?: boolean; // 标记是否为重复文件
    sourceType?: string; // 资源来源类型：attachment(附件)、content(内容)、image(图片文集)
}

export interface GetResourcesParams {
    type?: string;
    searchQuery?: string;
    linked?: boolean;
    page?: number;
    pageSize?: number;
}

export interface ResourceUploadResponse {
    id: string;
    name: string;
    type: string;
    size: number;
    date: string;
    linked: boolean;
    sourceArticle: ArticleSource | null;
    sourceImage?: ImageSource | null;
    sourceAgent?: AgentSource | null;
    duplicate?: boolean;
    sourceType?: string; // 资源来源类型
}

export interface FormattedSize {
    size: number;
    unit: string;
}

export interface ResourceListResponse {
    list: ResourceItem[];
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
    totalSize: number; // 总文件大小（字节）
    formattedTotalSize: FormattedSize; // 格式化的总文件大小
    typeSizes: Record<string, FormattedSize>; // 按类型统计的空间大小
}
