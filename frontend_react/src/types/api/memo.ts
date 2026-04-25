export interface MemoItem {
    memoId: string;
    content: string;
    tag: string;
    isPinned: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface CreateMemoParams {
    content: string;
    tag?: string;
    isPinned?: boolean;
}

export interface MemoListParams {
    keyword?: string;
}
