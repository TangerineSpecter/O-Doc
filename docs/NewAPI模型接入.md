# New API 模型接入

New API 提供 OpenAI 兼容接口。O-Doc 中选择「New API」服务商，填写实例的 Base URL（如 `http://new-api:3000/v1`）、New API 颁发的 API Key，然后按实际模型 ID 添加对话、图像识别、向量、重排或生图模型。

对话、图像识别和向量沿用项目现有的 OpenAI 兼容调用；重排模型可配置并使用兼容接口做连接检测，当前业务没有实际重排调用。生图模板使用 New API 的 `POST /v1/images/generations`，提交模型 ID、提示词和 `n: 1`，接收返回的 `data[].b64_json` 或 `data[].url` 并保存到提示词历史效果及素材。尺寸和质量由 New API 的模型与上游渠道决定；当前不提供图像编辑或 New API 专有的异步任务查询。

若 O-Doc 与 New API 分别运行在容器中，Base URL 应填写 **O-Doc 后端可访问**的实例地址，例如同一容器网络中的 `http://new-api:3000/v1`，而非浏览器访问 New API 的地址。若接口返回图片 URL，该 URL 也需要可从 O-Doc 后端访问；返回 base64 图片则不需要额外下载地址。

New API 服务商及其模型、默认模型配置、生成的历史效果和素材沿用现有 WebDev 同步机制，无新增同步字段。同步后的各设备需能访问同一个 Base URL；若实例仅在某一台机器的 `localhost` 可访问，其他设备无法使用该配置。

接口依据：[New API 使用 API 与游乐场](https://docs.newapi.pro/zh/docs/guide/feature-guide/user/api)、[图像生成接口](https://docs.newapi.pro/zh/docs/api/ai-model/images/openai/post-v1-images-generations)。
