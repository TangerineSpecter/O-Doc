# Grsai 生图接入

## 配置

1. 在「设置 → AI 服务商」新增 **Grsai**，填写 API Key。Base URL 可用 `https://grsaiapi.com/v1` 或 `https://grsai.dakka.com.cn/v1`。
2. 在该服务商下新增类型为「图像生成」的模型，模型实际名称填写 Grsai 文档中的模型 ID，例如 `nano-banana-2`。
3. 在「默认模型」中选择该生图模型并保存。
4. 打开提示词库中的「生图」模板，填写字段后点击「用默认模型生图」。完成后的图片会存为素材，并显示在该模板的历史效果中。

默认模型配置、服务商与模型记录、提示词历史效果和素材沿用现有 WebDev 同步机制。生成中的第三方任务凭证只临时保存在当前浏览器会话，关闭模板后重新打开可继续查询；会话结束或凭证超过一小时后需重新提交。

## 当前接口范围

- 使用 Grsai 的 `POST /v1/api/generate` 和 `GET /v1/api/result`，支持同步返回和异步查询。
- 当前固定为纯文字生图：`images: []`、`aspectRatio: "1:1"`、`imageSize: "1K"`、`replyType: "json"`。负向提示词拼接到请求的 `prompt` 中。
- 仅保存 PNG、JPEG、WebP 格式的图片；远程图片下载遵循现有公共地址校验和大小限制。
- 不在「测试连接」中触发付费生图。配置完成后应在提示词库执行一次真实生成来确认账号权限、额度和出图效果。

接口依据：[nano-banana 接口](https://qmy27nhsd9.apifox.cn/452392911e0)、[异步结果查询接口](https://qmy27nhsd9.apifox.cn/452409577e0)。
