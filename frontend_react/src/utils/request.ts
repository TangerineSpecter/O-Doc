import { createDiagnosticId, reportDiagnostic } from './diagnostics';
import {ResultEnum} from '@/constants/httpEnum';
import axios, {
    AxiosInstance,
    AxiosError,
    AxiosResponse,
    InternalAxiosRequestConfig
} from 'axios';
import {clearAuthToken, getAuthToken} from './authStorage';

// 扩展AxiosError类型，添加自定义数据类型
type CustomAxiosError = AxiosError<{
    msg?: string;
    detail?: string;
    code?: number;
    data?: any;
}>;


// 1. 定义后端接口返回的标准格式
// 根据你实际后端的约定修改，比如有的后端是用 code: 0 表示成功
export interface ApiResponse<T = any> {
    code: number;
    msg: string;
    data: T;
}

// 2. 创建 axios 实例
const service: AxiosInstance = axios.create({
    // 环境变量中的 API 地址，一体项目，无代理，直接请求 /api 即可
    baseURL: '/api',
    timeout: 10000, // 请求超时时间：10s
    headers: {
        'Content-Type': 'application/json;charset=utf-8'
    }
});

// 3. 请求拦截器
service.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
        // 在发送请求之前做些什么

        // Let the browser add the multipart boundary for uploads. Keeping the global
        // application/json header makes Django's request.FILES empty for FormData.
        if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
            config.headers.delete('Content-Type');
        }

        // 从本地登录态读取 token；普通登录 7 天过期，记住我长期有效。
        const token = getAuthToken();
        if (token) {
            config.headers.Authorization = `Token ${token}`;
        }

        if (!config.url?.includes('/system/logs/')) config.headers['X-Request-ID'] = createDiagnosticId();
        return config;
    },
    (error: CustomAxiosError) => {
        // 对请求错误做些什么
        console.error('Request Error:', error);
        return Promise.reject(error);
    }
);

// 4. 响应拦截器
service.interceptors.response.use(
    (response: AxiosResponse<any>) => {
        // 检查响应类型，如果是 blob 或 arraybuffer (下载文件)，直接返回 data
        if (response.config.responseType === 'blob' || response.config.responseType === 'arraybuffer') {
            return response.data;
        }
        
        // 2xx 范围内的状态码都会触发该函数
        const res = response.data;

        // 根据后端约定的状态码判断逻辑
        // 假设 code === 200 代表成功
        if (res.code === ResultEnum.SUCCESS) {
            // 直接返回 data 核心数据，调用时不需要再 .data
            return res.data;
        } else {
            // 处理业务错误
            const errorMessage = typeof res.data === 'string' && res.data.trim()
                ? res.data
                : (res.data?.detail ? `${res.msg || 'Error'}：${res.data.detail}` : (res.msg || 'Error'));
            console.error('API Error:', errorMessage);

            // 示例：处理 Token 过期 (401)
            if (res.code === ResultEnum.TIMEOUT) {
                // 清除本地信息并跳转登录
                clearAuthToken();
                window.location.href = '/login';
            }

            const businessError = Object.assign(new Error(errorMessage), { diagnosticHandled: true });
            if ([500, 5001, 5002, 5003, 600, 6002, 6003, 6004].includes(res.code)) reportDiagnostic({ errorType: 'system_error', module: 'network', path: `/api${response.config.url || ''}`, requestId: response.headers['x-request-id'] || response.config.headers['X-Request-ID'], operation: response.config.method }, businessError);
            return Promise.reject(businessError);
        }
    },
    (error: CustomAxiosError) => {
        // 超出 2xx 范围的状态码都会触发该函数
        // 安全获取错误信息
        Object.assign(error, { diagnosticHandled: true });
        if (!axios.isCancel(error) && (!error.response || error.response.status >= 500)) reportDiagnostic({ errorType: error.code === 'ECONNABORTED' ? 'timeout' : error.response ? 'http' : 'network', module: 'network', path: `/api${error.config?.url || ''}`, requestId: String(error.response?.headers['x-request-id'] || error.config?.headers['X-Request-ID'] || ''), httpStatus: error.response?.status, operation: error.config?.method }, error);
        let errorMsg = '网络请求错误';
        if (error.response) {
            // --- 针对 Blob 类型的错误处理优化 ---
            // 如果下载接口报错(比如404)，返回的是 Blob 类型的 json，需要转成文本才能看到错误信息
            if (error.request.responseType === 'blob' && error.response.data instanceof Blob) {
                const reader = new FileReader();
                reader.onload = () => {
                    try {
                        const errorData = JSON.parse(reader.result as string);
                        console.error('Download Error:', errorData.msg || errorMsg);
                    } catch (e) {
                        console.error('Download Error:', errorMsg);
                    }
                };
                reader.readAsText(error.response.data);
                return Promise.reject(error);
            }
            // ------------------------------------
            // 服务器返回了错误响应
            const responseData = error.response.data;
            errorMsg = responseData?.msg
                || responseData?.detail
                || error.response.statusText
                || errorMsg;
            error.message = errorMsg;
            console.error('Response Error:', errorMsg);

            // 可以根据 status code 做统一提示
            switch (error.response.status) {
                case 404:
                    console.error('资源不存在');
                    break;
                case 500:
                    console.error('服务器内部错误');
                    break;
                default:
                    console.error('网络连接故障');
            }
        }
        return Promise.reject(error);
    }
);

export default service;
