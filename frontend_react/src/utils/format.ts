// frontend_react/src/utils/format.ts

/**
 * 格式化文件大小
 * @param bytes 文件字节数 (number)
 * @returns 格式化后的字符串 (e.g., "1.5 MB")
 */
export const formatFileSize = (bytes?: number): string => {
    if (bytes === undefined || bytes === null) return '-';
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    // 保留2位小数 (parseFloat 可以去掉末尾多余的0，比如 "1.00" -> "1")
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};