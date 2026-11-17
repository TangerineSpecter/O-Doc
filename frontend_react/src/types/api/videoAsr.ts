export interface VideoASRStatus {
    state: 'missing' | 'downloading' | 'verifying' | 'ready' | 'failed';
    downloadedBytes: number;
    totalBytes: number;
    model: string;
    source: string;
    message: string;
    canDownload: boolean;
}
