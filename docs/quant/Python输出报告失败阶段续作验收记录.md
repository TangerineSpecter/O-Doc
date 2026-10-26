# Python输出报告失败阶段续作验收

日期：2026-10-26。应用1.5.51、量化schema54、迁移0029。现行规则见[Python输出报告事实审查](./Python输出报告事实审查说明.md#从失败阶段继续)。本批补齐显式阶段续作，未部署，也未对真实业务数据库执行迁移；完整重构仍有功能待实现。

## 行为与自动检查

技术失败、合同错误或中断的workflow2反馈任务使用native_resume_run_id新建续作。来源、模型选择、研究要求、历史上下文、策略与已有报告引用保持固定，复用连续完整的原稿及修订；未完成阶段重新请求。完整reject不能作为续作父任务，须“重新生成完整AI解读”，从新原稿重新审查，不能只重复复核原被拒文字。没有完整原稿时只重新生成AI原稿，原Python计算事实继续使用。修订次数不因续作重置，复核只能accept/reject。所有模型阶段通过而发布失败时可0次新模型调用重新发布。

| 检查 | 结果与覆盖 |
| --- | --- |
| 量化与共享同步 | 619项通过，量化571项与SyncManagerTests 48项；随后补强父链、复制前中断、明确拒绝及历史展示，相关56项再次通过 |
| 前端量化 | 138项通过，含草稿/修订复用、祖先检查点、幂等/错误重试、明确拒绝后新完整解读及历史保留 |
| 兼容与恢复 | 原native_alignment_replay及native_review_replay通过；本次native_resume_replay核对真实提示/返回并恢复新身份合同，模型/Docker/源码均禁止调用 |
| API消费 | 隔离APIClient的实际JSON响应由TypeScript解码器读取：复用outcome3、0次新增调用、最终reject禁止捷径续作，以及有界旧记录/日期字段保持一致 |

11项新增后端测试还覆盖第一次原稿失败、审查取消但没有完成结果、最终复核再次提出修订被拒、完整阶段通过后发布异常、原审查reject不能续作但可从完整新稿开始、重复请求、权限与修改输入/超限上下文拒绝、重算哈希后的引用/正文/记忆/类型伪造，以及旧备份不借用新指针。若续作在复制前中断，下次仍从同一父链找到完整原稿和修订；较新的正文变化后不能复用旧正文的后续核对。读取详情识别过期AI租约，不复活任务。恢复清空Job/NativePythonJob，不自动执行。

TypeScript、变更前端文件eslint、生产构建与makemigrations --check --dry-run单独核对；构建保留已有大包提示，不声称全项目eslint或正式部署通过。测试使用内存数据库、临时媒体与禁用真实调度设置。

## 真实deepseek-flash续作

只读本机Docker PostgreSQL中已有模型配置，使用独立内存数据库与临时媒体。此前[位置与原文区间批次](./Python输出报告位置与原文区间验收记录.md)的第二个真实请求`775d6f88b3a84f408e962f06922b96ad`已保存完整原稿，但审查输出按当时合同失败。本次绑定该父任务，固定同一参数period=21、200行样本及已冻结历史，直接复用原稿，没有重新生成原稿或运行原始函数。

| 阶段 | 新模型调用 | 记录tokens | 结果 |
| --- | --- | --- | --- |
| 原稿 | 0 | 不新增 | 原已解析正文保持一致，引用原步骤/结果指纹 |
| 审查与一次修订 | 1 | 33006 | revise：指出document去重被误解为空、正收益低于基线被称为亏损等文字问题，并生成完整修订 |
| 最终复核 | 1 | 29496 | reject：修订仍称候选“前period行”缺失；本次period=21，但保存事实为缺失20行、首个有效下标20，不能混用 |

共2次真实调用、62502记录tokens，原始源码执行0次。最终审查拒绝，不能把本批表述为成功报告或模型质量放行。同模型复核不是独立验证；本例只是排错样本，不构成专家基线或金融有效性证明。服务端的直接计算判定、实际参数和旧报告未因文字修订而提升层级。

## 捕获异常与证据边界

验收脚本在两次真实调用及阶段原件保存后，因直接序列化API响应中的datetime退出，未导出原始任务完整快照。原始模型返回与三个阶段原件均保留，未为修复导出再调用模型。此前的准备脚本错误均在模型调用前退出，未产生其他付费调用或真实业务写入。

[捕获清单](./验收记录/2026-10-26-native-resume-manifest.json)分别保留真实[模型返回](./验收记录/2026-10-26-native-resume-provider-responses.json)、[阶段原件](./验收记录/2026-10-26-native-resume-review-stages.json)，以及离线重建的[业务增量](./验收记录/2026-10-26-native-resume-replay-delta.json)、[API响应](./验收记录/2026-10-26-native-resume-replay-wire.json)和[结果](./验收记录/2026-10-26-native-resume-replay-summary.json)。完整父链以原位置批次清单及其快照为基础，不复制或替换原件。

离线重建创建**新任务身份**，核对固定输入哈希、完整提示、真实原始返回、解析正文和记录用量完全一致；最终reject/无新报告、父任务/旧报告不改、恢复后无执行队列均通过。重建阶段的本地耗时不冒充真实调用耗时，真实耗时仍在原阶段文件。业务增量是当前合同的重放证据，不能冒充原始任务完整快照或原任务ID恢复验收。哈希是内部一致性记录，不是提供商签名。

## 复现与后续

```bash
UV_CACHE_DIR=/private/tmp/odoc-uv-cache uv run --python 3.11 python -m quant.acceptance.native_resume_replay
UV_CACHE_DIR=/private/tmp/odoc-uv-cache uv run --python 3.11 python manage.py test quant.test_native_resume --settings=quant.test_settings --noinput
UV_CACHE_DIR=/private/tmp/odoc-uv-cache uv run --python 3.11 python manage.py test quant.test_native_resume quant.test_native_reviews quant.test_native_python quant.test_feedback --settings=quant.test_settings --noinput
```

离线命令校验捕获哈希、原批次与重放增量，禁止模型/Docker/源码；不需要提供商密钥。实际API JSON与纯local页面是不同验收范围，不相互替代。

纯local保留已有31条研究，新增一条仅有说明的资料和一条带源码的“原始Python · 复核失败续作验收”，共33条；源码/说明和报告均为人工流程样例。后者走通固定130行人工行情、period显式映射lookback、最终复核失败、显式续作、复用两阶段并只模拟1次新增调用。复用详情可直接打开原阶段记录，不必手工复制任务ID。最初未录入完整源码的资料未被用作执行证据。

另以`LOCAL_NATIVE_RESUME_ERROR_ONCE`验证请求创建中的禁用状态、首次500且未创建任务、同一请求键重试成功；初始无验证记录、异步读取、失败审查与详情弹窗也已检查，均由local mock处理，没有501或真实后端回落。390/768/1440像素下核对换行、卡片/弹窗与无页面横向溢出、无原生select。临时截图为`/private/tmp/odoc-native-resume-1440.png`、`/private/tmp/odoc-native-resume-768.png`、`/private/tmp/odoc-native-resume-390.png`及`/private/tmp/odoc-native-resume-390-detail.png`，仅作人工UI证据，与真实deepseek-flash最终拒绝分开。

完整重生成也从新原稿开始；多次人工local重生成后，前次AI解读与失败记录均保留，历史区只读，当前显示4条。138项前端测试包含明确reject不能续作、完整新稿不复用旧稿和拒绝历史继续可见。新增界面的手机图为`/private/tmp/odoc-native-regenerate-390.png`，历史图为`/private/tmp/odoc-native-resume-history-1440.png`；没有新增真实模型调用。控制台保留本批故意制造500的两条请求错误日志，重试成功与这些日志分开记录。

本批不完成原生Pine/MQ4/通达信/聚宽执行、全局语义依赖增量、跨请求多重检验和完整嵌套验证、专家/模型质量基线或真实后端/远端多设备验收；完整目标见[整体规格](../requirements/007-AI量化研究系统重构.md)。
