export interface RecycleItemBase {
    itemType: 'article' | 'memo';
    id: string;
    preview: string;
    createdAt: string;
    deletedAt: string;
}

export interface RecycleArticleItem extends RecycleItemBase {
    itemType: 'article';
    title: string;
    collId: string;
    anthologyTitle: string;
    collectionAvailable: boolean;
    hasChildren: boolean;
}

export interface RecycleMemoItem extends RecycleItemBase {
    itemType: 'memo';
    tag: string;
}

export type RecycleItem = RecycleArticleItem | RecycleMemoItem;
