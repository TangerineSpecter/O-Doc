export interface VideoNoteJob {
    id: string;
    state: 'queued' | 'running' | 'awaiting_upload' | 'failed' | 'completed';
    stage: string;
    title: string;
    sourceUrl: string;
    message: string;
    articleId: string;
    createdAt: string;
}
