/**
 * MT4 回测档案文件校验与格式化工具函数
 */

export function formatFileSize(bytes: number): string {
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function isReportFile(file: { name: string }): boolean {
    const name = file.name.toLowerCase();
    return name.endsWith('.htm') || name.endsWith('.html') || name.endsWith('.zip');
}

export function isImageFile(file: { name: string; type?: string }): boolean {
    return (file.type ? file.type.startsWith('image/') : false) || /\.(png|jpe?g|webp|gif)$/i.test(file.name);
}
