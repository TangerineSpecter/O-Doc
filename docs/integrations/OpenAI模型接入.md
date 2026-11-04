# OpenAI 模型接入

在「AI 模型接入」中选择 OpenAI 服务商，填写 API Key 和后端可访问的 Base URL（官方地址为 `https://api.openai.com/v1`），添加模型时先选择用途，再选择常用型号或填写自定义 ID。列表按公开文档整理，不代表账号一定拥有对应模型权限；以 API 项目、额度和服务返回为准。

普通对话与图像识别使用 Chat Completions。GPT-6.1 Terra 的思考强度可选 none、low、medium、high、xhigh、max；不同模型可选范围不同。默认遵循既有任务及供应商行为。连通性测试只检查小请求是否被服务接受，不能证明完整生成或工具调用。见 [OpenAI 模型文档](https://developers.openai.com/api/docs/models/gpt-6.1-terra)和 [GPT-6 接入指南](https://developers.openai.com/api/docs/guides/latest-model)。

OpenAI 服务商下的 GPT-6.1 Terra、6.1 Sol、6 Astra、6 Sol 和 6 Luna，带函数工具的 Agent 请求使用 [Responses API](https://developers.openai.com/api/docs/guides/function-calling)，按模型配置传递思考强度；其他模型或服务商保留原有工具入口。工具定义和执行权限仍由业务调用方提供和复核，沿用原来的轮次、超时及业务失败处理。每次模型请求最多返回一个工具调用；因此相比允许并行工具调用的接口，多工具任务可能需要更多轮次，仍受原有轮次上限约束。

Responses 请求使用 `store=false`，在同一工具循环中携带返回的加密推理状态、调用项和对应工具结果，以便无状态继续。调用记录沿既有本机留存与 Token 同步规则管理，不新增持久化字段。已使用配置的 Terra、低思考强度和本机模拟工具完成真实工具往返；这不代表其他型号、思考档位或真实业务工具已逐一验收。部署端需要安装支持 Responses 的 OpenAI Python SDK，并重启服务加载更新。

OpenAI 生图可选择 `gpt-image-2.5-sunburst`、`gpt-image-2.5-flare`、`gpt-image-2` 等公开型号，也可输入自定义 ID。`gpt-image-1.5` 与 `gpt-image-1-mini` 的官方停用日期为 2026-12-01；已停用的 `gpt-image-1` 和 DALL·E 不列入预设。[Images API](https://developers.openai.com/api/reference/resources/images/methods/generate) 使用 `POST /v1/images/generations`；当前适配器发送提示词和一张图，解析 base64 图片并复用既有素材入库、Agent 生图任务及失败恢复。OpenAI 后台发帖配图提交结果不明时不自动重试；已有图片地址可恢复下载。现阶段仅支持文字生图，尺寸和质量由接口默认决定，尚不支持参考图编辑、透明背景或 OpenAI 异步任务查询。生成会消耗 API 额度，模型和组织权限以服务返回为准；部分账号可能需要组织验证。

生图模型配置和普通素材沿现有同步范围管理；Agent 通用生图任务沿现有任务快照同步，不新增任务字段。同步设备需要先升级后再接收新的 OpenAI 任务。当前代码和模拟检查不能代替真实 API 生图及双设备同步验收。

OpenAI 生图模型可在 AI 设置中选为系统默认模型。朋友圈使用该模型生成不含参考图的场景时，画幅和分辨率由接口默认决定，不使用社交设置中保存的尺寸；带参考图的请求仍不支持。
