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
        const resultText = await fetchAIResponse(prompt);
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
        if (error instanceof AIConfigError) {
            throw error;
        }
        return [];
    }
};

export const recommendImageTagsWithAI = async (
    title: string,
    description: string,
    existingTags: string[]
): Promise<string[]> => {
    const normalizedTags = Array.from(new Set(existingTags.map(tag => tag.trim()).filter(Boolean)));
    if (normalizedTags.length === 0) return [];

    const prompt = `请根据图片标题和描述，从“已有标签”中推荐最匹配的 1 到 5 个标签。
要求：
1. 只能返回已有标签列表中出现过的标签，不能创造新标签
2. 如果没有任何已有标签匹配，返回 "无"
3. 只返回标签名称，用英文逗号分隔，不要解释

图片标题：${title || '未填写'}
图片描述：${description || '未填写'}
已有标签：${normalizedTags.join(', ')}`;

    try {
        const resultText = await fetchAIResponse(prompt);
        const lowerNoneValues = ['无', 'none', 'no', 'no match', '无匹配'];
        const cleaned = stripThinkingBlocks(resultText)
            .replace(/data:\s*/g, '')
            .replace(/[\[\]"]/g, '')
            .trim();

        if (!cleaned || lowerNoneValues.includes(cleaned.toLowerCase())) return [];

        const allowed = new Map(normalizedTags.map(tag => [tag.toLowerCase(), tag]));
        return Array.from(new Set(
            cleaned
                .split(/[,，、\n]/)
                .map(tag => tag.trim())
                .map(tag => allowed.get(tag.toLowerCase()))
                .filter((tag): tag is string => Boolean(tag))
        )).slice(0, 5);
    } catch (error) {
        console.error("AI 推荐图片标签失败:", error);
        if (error instanceof AIConfigError) {
            throw error;
        }
        return [];
    }
};

/**
 * AI 生成标题
 */
export const generateTitleWithAI = async (content: string): Promise<string> => {
    // 截取前 3000 字作为参考
    const truncatedContent = content.slice(0, 3000);

    const prompt = `请根据以下文章内容，生成一个简练、概括性强且具有吸引力的标题。
要求：
1. 只返回标题文本，不要包含任何引号、"标题："前缀。
2. 长度控制在 5 到 25 个字之间。
3. 语言与文章内容保持一致（中文或英文）。

文章内容：
${truncatedContent}`;

    try {
        const result = await fetchAIResponse(prompt);
        // 清理可能产生的多余符号
        return result.replace(/^["'《]|["'》]$/g, '').trim();
    } catch (error) {
        console.error("AI 生成标题失败:", error);
        if (error instanceof AIConfigError) {
            throw error;
        }
        return "";
    }
};

/**
 * AI 润色文章
 */
export const polishArticleWithAI = async (content: string): Promise<string> => {
    try {
        const response = await fetch('/api/article/polish', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
                content: content
            })
        });

        if (!response.ok) {
            if (response.status === 400) {
                try {
                    const errorData = await response.json();
                    throwAIConfigErrorIfMatched(errorData.error || errorData.msg || errorData.data || '');
                } catch (e) {
                    if (e instanceof AIConfigError) throw e;
                }
            }
            throw new Error('AI 润色请求失败');
        }

        const result = await response.json();
        if (result.code !== 200) {
            throwAIConfigErrorIfMatched([result.msg, result.data].filter(Boolean).join(' '));
            throw new Error(result.msg || 'AI 润色失败');
        }

        return stripThinkingBlocks(result.data.polishedContent || result.data.polished_content || '');
    } catch (error) {
        console.error("AI 润色文章失败:", error);
        throw error;
    }
};

/**
 * AI 续写文章
 */
export const continueWritingWithAI = async (content: string, instruction: string): Promise<string> => {
    const truncatedContent = content.slice(-4000);
    const prompt = `请基于以下 Markdown 文档内容继续写作。
要求：
1. 只返回需要插入到光标位置的新内容。
2. 保持原文语言、语气和 Markdown 风格。
3. 不要解释你的写作过程，不要添加“好的”等对话文本。
4. 如果用户给了具体要求，优先按要求续写。

用户要求：${instruction || '自然续写当前内容'}

当前文档末尾内容：
${truncatedContent}`;

    try {
        return await fetchAIResponse(prompt);
    } catch (error) {
        console.error("AI 续写失败:", error);
        throw error;
    }
};

/**
 * 提取公共的 Fetch 逻辑
 */
const SYSTEM_ERROR_PATTERN = /\[System Error\]/;
const THINK_BLOCK_PATTERN = /<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi;

const stripThinkingBlocks = (content: string): string => {
    return content.replace(THINK_BLOCK_PATTERN, '').trim();
};

export class AIConfigError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AIConfigError';
    }
}

const throwAIConfigErrorIfMatched = (message: string) => {
    if (message.includes('No default model configured') || message.includes('default model')) {
        throw new AIConfigError('未配置大模型，请先在系统设置中配置 AI 模型');
    }
};

const fetchAIResponse = async (prompt: string): Promise<string> => {
    const response = await fetch('/api/ai/chat/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
            message: prompt,
            history: [],
            use_knowledge_base: false
        })
    });

    if (!response.ok) {
        if (response.status === 400) {
            try {
                const errorData = await response.json();
                const errorMsg = errorData.error || '';
                if (errorMsg.includes('No default model configured') || errorMsg.includes('model')) {
                    throw new AIConfigError('未配置大模型，请先在系统设置中配置 AI 模型');
                }
                throw new AIConfigError(errorMsg || 'AI 配置错误');
            } catch (e) {
                if (e instanceof AIConfigError) throw e;
                throw new AIConfigError('未配置大模型，请先在系统设置中配置 AI 模型');
            }
        }
        throw new Error('AI 请求失败');
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let resultText = '';
    let buffer = '';

    const appendLine = (line: string) => {
        if (!line.trim()) return;

        try {
            const event = JSON.parse(line);
            if (event.type === 'error') {
                resultText += `\n\n[System Error]: ${event.content || ''}`;
                return;
            }

            if (event.type === 'answer') {
                resultText += event.content || '';
            }
        } catch (error) {
            if (error instanceof SyntaxError) {
                resultText += line;
            } else {
                throw error;
            }
        }
    };

    if (reader) {
        while (true) {
            const {done, value} = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);
            buffer += chunk;
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                appendLine(line);
            }
        }
    }

    if (buffer.trim()) {
        appendLine(buffer);
    }

    const cleanedText = resultText
        .replace(/data:\s*/g, '')
        .trim();

    if (SYSTEM_ERROR_PATTERN.test(cleanedText)) {
        if (cleanedText.includes('No default model configured')) {
            throw new AIConfigError('未配置大模型，请先在系统设置中配置 AI 模型');
        }
        throw new AIConfigError('AI 服务异常，请检查配置');
    }

    return cleanedText;
};
