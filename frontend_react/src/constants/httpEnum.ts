// src/enums/httpEnum.ts

// 1. HTTP 基础状态码（Axios 抛出的 error.response.status）
export enum HttpStatus {
    SUCCESS = 200,
    NOT_FOUND = 404,
    INTERNAL_SERVER_ERROR = 500,
    UNAUTHORIZED = 401,
    FORBIDDEN = 403,
}

// 2. 后端业务自定义状态码（res.data.code）
// 跟后端约定好，统一定义在这里
export enum ResultEnum {
    SUCCESS = 200,          // 业务成功
    ERROR = -1,             // 通用业务错误
    TIMEOUT = 401,          // 登录过期/未授权
    TYPE = 'success',

    // 具体的业务错误码
    USER_NOT_EXIST = 10001, // 用户不存在
    PASSWORD_ERROR = 10002, // 密码错误
}