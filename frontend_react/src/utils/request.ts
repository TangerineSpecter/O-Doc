import { ResultEnum } from '@/constants/httpEnum';
import axios, {
    AxiosInstance,
    AxiosError,
    AxiosResponse,
    InternalAxiosRequestConfig
} from 'axios';

// 扩展AxiosError类型，添加自定义数据类型
type CustomAxiosError = AxiosError<{
    msg?: string;
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

        // 示例：从 localStorage 获取 token 并添加到 headers
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }

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
    (response: AxiosResponse<ApiResponse>) => {
        // 2xx 范围内的状态码都会触发该函数
        const res = response.data;

        // 根据后端约定的状态码判断逻辑
        // 假设 code === 200 代表成功
        if (res.code === ResultEnum.SUCCESS) {
            // 直接返回 data 核心数据，调用时不需要再 .data
            return res.data;
        } else {
            // 处理业务错误
            console.error('API Error:', res.msg);

            // 示例：处理 Token 过期 (401)
            if (res.code === ResultEnum.TIMEOUT) {
                // 清除本地信息并跳转登录
                localStorage.removeItem('token');
                window.location.href = '/login';
            }
            
            return Promise.reject(new Error(res.msg || 'Error'));
        }
    },
    (error: CustomAxiosError) => {
        // 超出 2xx 范围的状态码都会触发该函数
        // 安全获取错误信息
        let errorMsg = '网络请求错误';
        if (error.response) {
            // 服务器返回了错误响应
            errorMsg = error.response.data?.msg || error.response.statusText || errorMsg;
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