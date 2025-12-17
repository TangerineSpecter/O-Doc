// frontend_react/src/api/ai.ts

// 定义 Chat 接口的返回类型（如果需要处理流式，这里可能需要特殊处理，但简单起见我们假设非流式或手动拼接）
// 注意：之前的 ChatView 是 StreamingHttpResponse，前端 fetch 需要处理流。
// 为了简化“生成标签”这种短任务，我们可以封装一个非流式的辅助函数，或者直接使用流式读取。

export const generateTagsWithAI = async (title: string, content: string): Promise<string[]> => {
    // 截取内容防止超长
    const truncatedContent = content.slice(0, 2000);

    const prompt = `请阅读以下文章，提取最核心的 3 个标签。
要求：
1. 只返回标签名称
2. 用英文逗号分隔
3. 不要包含任何 "标签："、"Tags:" 等前缀
4. 标签应简练精准
5. 如果内容太少无法提取，返回 "笔记"

文章标题：${title}
文章内容：${truncatedContent}`;

    try {
        const response = await fetch('/api/ai/chat/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // 如果有鉴权 token，记得带上
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
                message: prompt,
                history: [], // 不需要历史记录
                use_knowledge_base: false
            })
        });

        if (!response.ok) {
            throw new Error('AI 请求失败');
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let resultText = '';

        if (reader) {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value);
                // 处理 SSE 格式 (data: ...) 或者直接文本，取决于后端 ChatView 实现
                // 您之前的 ChatView 是 yield content，所以前端收到的直接是 content 片段
                resultText += chunk;
            }
        }

        // 清洗数据：有时候流式返回可能包含 "data: " 前缀或者换行，需要解析
        // 您的 ChatView 返回的是纯文本流（yield content），但如果是 SSE 格式 (text/event-stream)
        // 通常会有 "data: "。让我们简单处理一下

        // 假设 resultText 是纯文本拼接的结果。
        // 分割并清理
        const tags = resultText
            .replace(/data:\s*/g, '') // 去除可能的 SSE 前缀
            .replace(/[\[\]"]/g, '')  // 去除可能的 JSON 符号
            .split(/[,，]/)           // 支持中英文逗号
            .map(t => t.trim())
            .filter(t => t && t.length > 0 && t !== 'DONE');

        return tags.slice(0, 3); // 限制最多3个

    } catch (error) {
        console.error("AI 生成标签失败:", error);
        return [];
    }
};