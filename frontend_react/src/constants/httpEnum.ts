// 后端业务自定义状态码（res.data.code）
export enum ResultEnum {
    SUCCESS = 200,          // 业务成功
    TIMEOUT = 401,          // 登录过期/未授权
}
