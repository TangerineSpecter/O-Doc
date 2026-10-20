type RequestErrorLike = {
    message?: string;
    msg?: string;
    code?: number;
    status?: number;
    response?: {status?: number; data?: {code?: number; msg?: string} | null};
};

const NOT_FOUND_HINTS = ['资源不存在', 'not found', 'does not exist'];

function readMessage(error: unknown): string {
    if (typeof error === 'string') return error;
    if (!error || typeof error !== 'object') return '';
    const err = error as RequestErrorLike;
    return err.response?.data?.msg || err.msg || err.message || '';
}

/**
 * 判断请求错误是否代表「资源不存在 / 已被删除」。
 * 后端有两种返回形态：HTTP 404，或 HTTP 200 但响应体 code 为 404；
 * 业务码分支在 request.ts 中已被转换为普通 Error，只能依赖提示文案兜底。
 */
export function isResourceNotFoundError(error: unknown): boolean {
    if (!error) return false;
    if (typeof error === 'object') {
        const err = error as RequestErrorLike;
        if (err.response?.status === 404) return true;
        if (err.response?.data?.code === 404) return true;
        if (err.status === 404 || err.code === 404) return true;
    }
    const message = readMessage(error).toLowerCase();
    return NOT_FOUND_HINTS.some(hint => message.includes(hint));
}

export default isResourceNotFoundError;
