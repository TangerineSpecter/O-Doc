// frontend_react/src/components/AIChatWindow.tsx

import {useEffect, useRef, useState, useMemo} from 'react';
import {BookOpen, Bot, BrainCircuit, Camera, ChevronDown, Maximize2, Minimize2, Send, Trash2, User, X} from 'lucide-react';
import {useNavigate} from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

// 引入自定义组件和 API
import {AIConfigError} from '../api/ai';
import ConfirmationModal from './common/ConfirmationModal';
import {getArticleDetail} from '../api/article';
import {getAnthologyList, type Anthology} from '../api/anthology';
import {getImagesByAnthology, type Image} from '../api/image';
import {CodeBlock, MermaidChart} from './Article/MarkdownElements';
import {Select, type SelectOption} from './common/Select';

interface Message {
    role: 'user' | 'assistant';
    content: string;
    thinking?: string;
}

interface AIChatWindowProps {
    isOpen: boolean;
    onClose: () => void;
}

const parseImageTags = (image: Image) => {
    const source = image.tagsList?.length ? image.tagsList : (image.tags || '').split(/[,，、;；\n]/);
    return source.map(tag => tag.trim()).filter(Boolean);
};

const formatCountStats = (counts: Map<string, number>, unit: string, limit = 12) => {
    return Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
        .slice(0, limit)
        .map(([name, count]) => `${name}：${count}${unit}`)
        .join('、') || '暂无';
};

const normalizeFocalLengthLabel = (value: string) => {
    const trimmed = value.trim();
    const numeric = trimmed.match(/\d+(?:\.\d+)?/);
    if (!numeric) return trimmed;

    const numberValue = Number.parseFloat(numeric[0]);
    if (!Number.isFinite(numberValue)) return trimmed;

    return `${Number.isInteger(numberValue) ? numberValue : numberValue.toFixed(1)}mm`;
};

const inferTitleScenes = (title: string, tags: string[]) => {
    const text = `${title} ${tags.join(' ')}`;
    const sceneKeywords = [
        '动物', '鸟', '猫', '狗', '风光', '风景', '山', '海', '湖', '城市', '街拍', '人像',
        '建筑', '花', '微距', '夜景', '日落', '旅行', '纪实', '运动', '车', '美食', '雪',
    ];

    return sceneKeywords.filter(keyword => text.includes(keyword));
};

const buildPhotographyAnalysisPrompt = (
    userMessage: string,
    images: Image[],
    anthologyTitle: string
) => {
    const imagesWithFocalLength = images.filter(image => image.focalLength?.trim());
    const focalCounts = new Map<string, number>();
    const tagCounts = new Map<string, number>();
    const tagFocalCounts = new Map<string, Map<string, number>>();
    const titleSceneFocalCounts = new Map<string, Map<string, number>>();

    imagesWithFocalLength.forEach((image) => {
        const focalLength = normalizeFocalLengthLabel(image.focalLength || '');
        const tags = parseImageTags(image);
        focalCounts.set(focalLength, (focalCounts.get(focalLength) || 0) + 1);

        tags.forEach((tag) => {
            tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
            const current = tagFocalCounts.get(tag) || new Map<string, number>();
            current.set(focalLength, (current.get(focalLength) || 0) + 1);
            tagFocalCounts.set(tag, current);
        });

        inferTitleScenes(image.title || '', tags).forEach((scene) => {
            const current = titleSceneFocalCounts.get(scene) || new Map<string, number>();
            current.set(focalLength, (current.get(focalLength) || 0) + 1);
            titleSceneFocalCounts.set(scene, current);
        });
    });

    const tagFocalSummary = Array.from(tagFocalCounts.entries())
        .sort((a, b) => {
            const aTotal = Array.from(a[1].values()).reduce((sum, count) => sum + count, 0);
            const bTotal = Array.from(b[1].values()).reduce((sum, count) => sum + count, 0);
            return bTotal - aTotal || a[0].localeCompare(b[0], 'zh-CN');
        })
        .slice(0, 16)
        .map(([tag, counts]) => `- ${tag}：${formatCountStats(counts, '张', 8)}`)
        .join('\n') || '- 暂无';

    const titleSceneSummary = Array.from(titleSceneFocalCounts.entries())
        .sort((a, b) => {
            const aTotal = Array.from(a[1].values()).reduce((sum, count) => sum + count, 0);
            const bTotal = Array.from(b[1].values()).reduce((sum, count) => sum + count, 0);
            return bTotal - aTotal || a[0].localeCompare(b[0], 'zh-CN');
        })
        .slice(0, 16)
        .map(([scene, counts]) => `- ${scene}：${formatCountStats(counts, '张', 8)}`)
        .join('\n') || '- 暂无';

    const samples = imagesWithFocalLength.slice(0, 120).map((image, index) => {
        const tags = parseImageTags(image);
        const location = [image.country, image.city].filter(Boolean).join(' / ') || '未记录';
        return `${index + 1}. 标题：${image.title || '未命名'}；标签：${tags.join('、') || '无'}；焦段：${normalizeFocalLengthLabel(image.focalLength || '')}；地点：${location}`;
    }).join('\n');

    return `你是“摄影分析助手 MCP”，负责分析图片文集里的摄影统计数据与拍摄风格。

请严格基于下面的数据分析。注意：统计分析只使用“已填写焦段”的图片；未填写焦段的图片只能作为缺失数据说明，不参与焦段、标签焦段、标题场景焦段结论。

用户问题：${userMessage || '请分析我的图片文集摄影习惯'}

文集：${anthologyTitle}
图片总数：${images.length}
已填写焦段：${imagesWithFocalLength.length}
未填写焦段：${images.length - imagesWithFocalLength.length}

整体焦段统计：
${formatCountStats(focalCounts, '张', 20)}

标签统计：
${formatCountStats(tagCounts, '次', 20)}

按标签拆分的常用焦段：
${tagFocalSummary}

根据标题与标签推断的拍摄内容/场景焦段：
${titleSceneSummary}

样本明细（最多 120 条）：
${samples || '暂无有焦段的图片样本'}

请输出：
1. 先给出 3-5 条关键发现，必须包含“哪些标签/场景最常用哪些焦段”。
2. 分析标题透露出的拍摄内容习惯，例如偏动物、风光、人像、城市、纪实等。
3. 总结摄影风格：焦段偏好、距离感、构图/题材倾向，可用审美语言点评但不要编造不存在的数据。
4. 给出可执行建议：哪些题材可以尝试补充哪些焦段或拍法。
5. 如果数据量太少或焦段缺失较多，请明确提醒。`;
};

export const AIChatWindow = ({isOpen, onClose}: AIChatWindowProps) => {
    const navigate = useNavigate();

    // 窗口状态
    const [isMinimized, setIsMinimized] = useState(false);

    // 对话状态
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [useKb, setUseKb] = useState(false);
    const [useThinking, setUseThinking] = useState(false);
    const [usePhotographyMcp, setUsePhotographyMcp] = useState(false);
    const [anthologies, setAnthologies] = useState<Anthology[]>([]);
    const [imageAnthologies, setImageAnthologies] = useState<Anthology[]>([]);
    const [selectedCollId, setSelectedCollId] = useState('');
    const [selectedImageCollId, setSelectedImageCollId] = useState('');

    // 弹窗状态
    const [isClearModalOpen, setIsClearModalOpen] = useState(false);

    const getAnthologyCollId = (item: Anthology) => item.collId || (item as any).coll_id || '';
    const anthologyOptions = useMemo<SelectOption<string>[]>(() => [
        {value: '', label: '全部文集'},
        ...anthologies
            .map(item => ({
                value: getAnthologyCollId(item),
                label: item.title,
                description: `${item.count || 0} 篇内容`
            }))
            .filter(option => option.value)
    ], [anthologies]);
    const imageAnthologyOptions = useMemo<SelectOption<string>[]>(() => [
        {value: '', label: '全部图片文集'},
        ...imageAnthologies
            .map(item => ({
                value: getAnthologyCollId(item),
                label: item.title,
                description: `${item.count || 0} 张图片`
            }))
            .filter(option => option.value)
    ], [imageAnthologies]);

    // --- 平滑输出相关的 Refs ---
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const tokenQueueRef = useRef<string[]>([]); // 回答字符缓冲队列
    const thinkingQueueRef = useRef<string[]>([]); // 思考字符缓冲队列
    const isThinkingRef = useRef(false); // 标记是否正在输出中
    const streamFinishedRef = useRef(true);

    // --- Markdown 组件配置 (使用 useMemo 避免重复创建导致重渲染) ---
    const markdownComponents = useMemo(() => ({
        // 1. 处理代码块和 Mermaid 图表
        code(props: any) {
            const {inline, className, children, ...rest} = props;
            const match = /language-(\w+)/.exec(className || '');
            const lang = match ? match[1] : '';
            const codeStr = String(children).replace(/\n$/, '');

            // Mermaid 流程图渲染
            if (!inline && lang === 'mermaid') {
                return <MermaidChart chart={codeStr}/>;
            }

            // 代码高亮块
            if (!inline && match) {
                return <CodeBlock language={lang} code={codeStr} {...rest} />;
            }

            // 行内代码
            return (
                <code
                    className="bg-slate-100 text-orange-600 px-1.5 py-0.5 rounded-md font-mono text-[0.9em] mx-1 break-words border border-slate-200"
                    {...props}
                >
                    {children}
                </code>
            );
        },
        // 2. 增强的链接渲染：处理路由跳转、最小化窗口、修复缺失的 collId
        a: ({node, href, children, ...props}: any) => {
            const isInternal = href?.startsWith('/');
            return (
                <a
                    href={href}
                    onClick={async (e) => {
                        if (isInternal && href) {
                            e.preventDefault();

                            // 交互优化：点击链接时先最小化窗口，防止遮挡
                            setIsMinimized(true);

                            // 检查链接格式：如果是 /article/xxxx 且只有两段（缺少 collId），尝试修复
                            const articlePathMatch = href.match(/^\/article\/([^/]+)$/);

                            if (articlePathMatch) {
                                const articleId = articlePathMatch[1];
                                try {
                                    // 调用 API 获取文章详情以拿到 collId
                                    const article = await getArticleDetail(articleId);
                                    if (article && article.collId) {
                                        navigate(`/article/${article.collId}/${article.articleId}`);
                                        return;
                                    }
                                } catch (err) {
                                    console.warn("Auto-fix link failed, fallback to original:", err);
                                }
                            }

                            // 默认跳转
                            navigate(href);
                        }
                    }}
                    target={isInternal ? undefined : "_blank"}
                    rel={isInternal ? undefined : "noopener noreferrer"}
                    className="text-orange-600 hover:text-orange-700 font-medium hover:underline decoration-orange-300 underline-offset-2 cursor-pointer transition-colors"
                    {...props}
                >
                    {children}
                </a>
            );
        },
        // 3. 优化表格样式
        table: ({children}: any) => (
            <div className="overflow-x-auto my-4 border border-slate-200 rounded-lg bg-white/50">
                <table className="w-full text-sm text-left">{children}</table>
            </div>
        ),
        thead: ({children}: any) => (
            <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
            {children}
            </thead>
        ),
        th: ({children}: any) => (
            <th className="px-4 py-3 whitespace-nowrap">
                {children}
            </th>
        ),
        td: ({children}: any) => (
            <td className="px-4 py-3 border-b border-slate-100 text-slate-600 last:border-0">
                {children}
            </td>
        ),
        // 4. 数学公式支持
        p: ({children}: any) => {
            // 简单的检查是否包含块级公式
            const childrenArray = Array.isArray(children) ? children : [children];
            const hasMathBlock = childrenArray.some((child: any) =>
                child?.props?.className?.includes('katex-display')
            );

            if (hasMathBlock) {
                return <div className="my-4 overflow-x-auto">{children}</div>;
            }
            return <p className="mb-2 leading-relaxed last:mb-0">{children}</p>;
        },
        // 5. 列表样式
        ul: ({children}: any) => <ul className="list-disc pl-5 space-y-1 my-2 marker:text-slate-400">{children}</ul>,
        ol: ({children}: any) => <ol className="list-decimal pl-5 space-y-1 my-2 marker:text-slate-400">{children}</ol>,
        blockquote: ({children}: any) => (
            <blockquote
                className="border-l-4 border-orange-200 pl-4 py-1 my-3 bg-orange-50/50 text-slate-600 italic rounded-r">
                {children}
            </blockquote>
        ),
    }), [navigate]);

    // --- ESC 键监听：最小化窗口 ---
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen && !isMinimized) {
                // 如果当前正在输入框中，可能需要权衡是否拦截，这里默认直接最小化
                setIsMinimized(true);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, isMinimized]);

    useEffect(() => {
        if (!isOpen) return;

        const loadAnthologies = async () => {
            try {
                const [articleData, imageData] = await Promise.all([
                    getAnthologyList('article'),
                    getAnthologyList('image'),
                ]);
                setAnthologies(articleData);
                setImageAnthologies(imageData);
            } catch (error) {
                console.warn('加载文集列表失败:', error);
            }
        };

        loadAnthologies();
    }, [isOpen]);

    // --- 核心逻辑 1: 平滑输出定时器 ---
    useEffect(() => {
        const takeSmoothChars = (queue: string[]) => {
            const length = queue.length;
            if (length === 0) return '';

            const count = length > 240 ? 6 : length > 120 ? 4 : length > 48 ? 2 : 1;
            return queue.splice(0, count).join('');
        };

        const interval = setInterval(() => {
            const nextAnswerChars = takeSmoothChars(tokenQueueRef.current);
            const nextThinkingChars = takeSmoothChars(thinkingQueueRef.current);

            if (nextAnswerChars || nextThinkingChars) {
                setMessages(prev => {
                    const newMsgs = [...prev];
                    const lastMsg = newMsgs[newMsgs.length - 1];
                    if (lastMsg && lastMsg.role === 'assistant') {
                        newMsgs[newMsgs.length - 1] = {
                            ...lastMsg,
                            content: `${lastMsg.content}${nextAnswerChars}`,
                            thinking: `${lastMsg.thinking || ''}${nextThinkingChars}`
                        };
                    }
                    return newMsgs;
                });
            }

            if (
                streamFinishedRef.current &&
                isThinkingRef.current &&
                tokenQueueRef.current.length === 0 &&
                thinkingQueueRef.current.length === 0
            ) {
                isThinkingRef.current = false;
                setIsLoading(false);
            }
        }, 24);

        return () => clearInterval(interval);
    }, []);

    // 自动滚动到底部
    useEffect(() => {
        if (!isMinimized && isOpen) {
            messagesEndRef.current?.scrollIntoView({behavior: "smooth"});
        }
    }, [messages, isMinimized, isOpen]);

    // 打开清空确认弹窗
    const handleClearMessages = () => {
        if (messages.length > 0) {
            setIsClearModalOpen(true);
        }
    };

    // 执行清空操作
    const confirmClear = () => {
        tokenQueueRef.current = [];
        thinkingQueueRef.current = [];
        streamFinishedRef.current = true;
        isThinkingRef.current = false;
        setMessages([]);
        setIsLoading(false);
        setIsClearModalOpen(false);
    };

    // 发送消息处理
    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const userMsg = input;
        setInput('');

        tokenQueueRef.current = [];
        thinkingQueueRef.current = [];
        streamFinishedRef.current = false;
        setMessages(prev => [...prev, {role: 'user', content: userMsg}]);
        setIsLoading(true);
        isThinkingRef.current = true;

        // 预先添加一个空的 assistant 消息用于接收流
        setMessages(prev => [...prev, {role: 'assistant', content: '', thinking: ''}]);

        try {
            let messageForAI = userMsg;

            if (usePhotographyMcp) {
                const targetAnthologies = selectedImageCollId
                    ? imageAnthologies.filter(item => getAnthologyCollId(item) === selectedImageCollId)
                    : imageAnthologies;

                if (targetAnthologies.length === 0) {
                    throw new Error('暂无可分析的图片文集，请先创建图片文集并填写焦段数据。');
                }

                const imageGroups = await Promise.all(targetAnthologies.map(async (anthology) => {
                    const id = getAnthologyCollId(anthology);
                    const images = id ? await getImagesByAnthology(id) : [];
                    return {anthology, images};
                }));

                const allImages = imageGroups.flatMap(group => group.images);
                const anthologyTitle = selectedImageCollId
                    ? targetAnthologies[0]?.title || '图片文集'
                    : `全部图片文集（${targetAnthologies.length} 个）`;

                messageForAI = buildPhotographyAnalysisPrompt(userMsg, allImages, anthologyTitle);
            }

            const response = await fetch('/api/ai/chat/', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    message: messageForAI,
                    history: messages.map(m => ({role: m.role, content: m.content})),
                    use_knowledge_base: useKb && !usePhotographyMcp,
                    coll_id: useKb && !usePhotographyMcp && selectedCollId ? selectedCollId : undefined,
                    include_thinking: useThinking
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
                        throw new Error(errorMsg || 'AI 配置错误');
                    } catch (e) {
                        if (e instanceof AIConfigError) throw e;
                        throw new AIConfigError('未配置大模型，请先在系统设置中配置 AI 模型');
                    }
                }
                throw new Error('AI 请求失败');
            }

            if (!response.body) throw new Error("No response body");

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullText = '';
            let buffer = '';

            const appendAnswer = (content: string) => {
                for (const char of content) {
                    tokenQueueRef.current.push(char);
                }
            };

            const appendThinking = (content: string) => {
                for (const char of content) {
                    thinkingQueueRef.current.push(char);
                }
            };

            const handleStreamLine = (line: string) => {
                if (!line.trim()) return;

                try {
                    const event = JSON.parse(line);
                    const content = event.content || '';

                    if (event.type === 'error') {
                        throw new Error(content || 'AI 服务异常，请检查配置');
                    }

                    if (event.type === 'thinking') {
                        appendThinking(content);
                        return;
                    }

                    appendAnswer(content);
                } catch (error) {
                    if (error instanceof SyntaxError) {
                        appendAnswer(line);
                        return;
                    }
                    throw error;
                }
            };

            while (true) {
                const {done, value} = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, {stream: true});
                fullText += chunk;

                if (/\[System Error\]/.test(fullText)) {
                    if (fullText.includes('No default model configured')) {
                        throw new AIConfigError('未配置大模型，请先在系统设置中配置 AI 模型');
                    }
                    throw new AIConfigError('AI 服务异常，请检查配置');
                }

                buffer += chunk;
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    handleStreamLine(line);
                }
            }

            if (buffer.trim()) {
                handleStreamLine(buffer);
            }
        } catch (error) {
            console.error(error);
            tokenQueueRef.current = [];
            thinkingQueueRef.current = [];
            streamFinishedRef.current = true;
            isThinkingRef.current = false;
            setIsLoading(false);
            setMessages(prev => {
                const newMsgs = [...prev];
                if (error instanceof AIConfigError) {
                    newMsgs[newMsgs.length - 1].content = `⚠️ ${error.message}`;
                } else {
                    newMsgs[newMsgs.length - 1].content = error instanceof Error ? error.message : '网络连接异常，请检查后端服务。';
                }
                return newMsgs;
            });
        } finally {
            streamFinishedRef.current = true;
        }
    };

    if (!isOpen) return null;

    // --- 最小化状态 (侧边停靠) ---
    if (isMinimized) {
        return (
            <div
                className="fixed right-0 top-1/2 -translate-y-1/2 z-[100] bg-gradient-to-r from-orange-500 to-orange-600 text-white p-3 rounded-l-xl shadow-lg cursor-pointer hover:w-16 transition-all w-12 flex flex-col items-center gap-3 group border-y border-l border-white/20"
                onClick={() => setIsMinimized(false)}
                title="展开 AI 对话"
            >
                <Bot className="w-6 h-6 animate-pulse"/>
                <div className="flex flex-col items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                    <span className="text-[10px] font-bold writing-vertical-rl tracking-widest">AI</span>
                    <Maximize2 className="w-3 h-3 mt-1"/>
                </div>
            </div>
        );
    }

    // --- 正常窗口状态 (居中大屏) ---
    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/20 backdrop-blur-[2px] animate-in fade-in duration-200">

            {/* 确认弹窗 */}
            <ConfirmationModal
                isOpen={isClearModalOpen}
                onClose={() => setIsClearModalOpen(false)}
                onConfirm={confirmClear}
                title="清空对话"
                description="确定要清空当前所有对话记录吗？此操作无法撤销。"
                confirmText="清空"
                type="warning"
            />

            {/* 主对话框容器 */}
            <div
                className="relative w-[900px] max-w-[95vw] h-[80vh] max-h-[820px] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 ring-1 ring-slate-900/5 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >

                {/* Header */}
                <div
                    className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80 backdrop-blur-sm">
                    <div className="flex items-center gap-3 text-slate-800 font-bold text-lg">
                        <div className="p-2 bg-orange-100 text-orange-600 rounded-xl shadow-sm">
                            <Bot className="w-5 h-5"/>
                        </div>
                        <span>小橘 AI助手</span>
                        <span
                            className="text-xs font-normal text-slate-400 px-2 py-0.5 bg-slate-100 rounded-full border border-slate-200">Pro</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={handleClearMessages}
                            disabled={messages.length === 0}
                            className={`p-2 rounded-lg transition-colors mr-1 ${
                                messages.length === 0
                                    ? 'text-slate-200 cursor-not-allowed'
                                    : 'text-slate-400 hover:bg-slate-200 hover:text-orange-600'
                            }`}
                            title={messages.length === 0 ? "暂无对话" : "清空会话"}
                        >
                            <Trash2 className="w-5 h-5"/>
                        </button>
                        <button
                            onClick={() => setIsMinimized(true)}
                            className="p-2 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
                            title="最小化"
                        >
                            <Minimize2 className="w-5 h-5"/>
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-red-50 hover:text-red-500 rounded-lg text-slate-400 transition-colors"
                            title="关闭"
                        >
                            <X className="w-5 h-5"/>
                        </button>
                    </div>
                </div>

                {/* Chat Body */}
                <div className="flex-1 min-h-0 overflow-y-auto p-6 pb-10 space-y-6 bg-slate-50/30 scroll-smooth">
                    {messages.length === 0 && (
                        <div
                            className="h-full flex flex-col items-center justify-center text-slate-400 space-y-6 -mt-10">
                            <div
                                className="w-20 h-20 bg-white rounded-3xl shadow-sm border border-slate-100 flex items-center justify-center">
                                <Bot className="w-10 h-10 text-orange-500"/>
                            </div>
                            <div className="text-center space-y-2">
                                <p className="text-lg font-medium text-slate-600">有什么可以帮你的吗？</p>
                                <div className="flex gap-2 justify-center text-xs text-slate-400">
                                    <span
                                        className="px-2 py-1 bg-white border border-slate-200 rounded-md">文档检索</span>
                                    <span
                                        className="px-2 py-1 bg-white border border-slate-200 rounded-md">代码生成</span>
                                    <span
                                        className="px-2 py-1 bg-white border border-slate-200 rounded-md">创意写作</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {messages.map((msg, idx) => (
                        <div key={idx}
                             className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                            {/* 头像 */}
                            <div
                                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border shadow-sm ${
                                    msg.role === 'user'
                                        ? 'bg-white text-slate-600 border-slate-200'
                                        : 'bg-orange-100 text-orange-600 border-orange-200'
                                }`}>
                                {msg.role === 'user' ? <User className="w-5 h-5"/> : <Bot className="w-5 h-5"/>}
                            </div>

                            {/* 消息气泡 */}
                            <div
                                className={`max-w-[85%] px-5 py-3.5 text-[15px] leading-relaxed shadow-sm break-words overflow-hidden ${
                                    msg.role === 'user'
                                        ? 'bg-slate-800 text-white rounded-2xl rounded-tr-none'
                                        : 'bg-white border border-slate-100 text-slate-700 rounded-2xl rounded-tl-none'
                                }`}>

                                {msg.role === 'assistant' ? (
                                    /* AI 回复使用 ReactMarkdown 渲染，支持引用链接点击跳转 */
                                    <>
                                        {msg.thinking && (
                                            <details
                                                open={isLoading && idx === messages.length - 1}
                                                className="mb-3 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-amber-900 group"
                                            >
                                                <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold">
                                                    <BrainCircuit className="w-3.5 h-3.5"/>
                                                    <span>思考过程</span>
                                                    <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-medium text-amber-700 border border-amber-200/70">
                                                        {isLoading && idx === messages.length - 1 ? '生成中' : `${msg.thinking.length} 字`}
                                                    </span>
                                                    <ChevronDown className="ml-auto w-3.5 h-3.5 transition-transform group-open:rotate-180"/>
                                                </summary>
                                                <div className="mt-2 max-h-52 overflow-y-auto whitespace-pre-wrap border-t border-amber-200/70 pt-2 text-xs leading-5 text-amber-800/90">
                                                    {msg.thinking}
                                                </div>
                                            </details>
                                        )}
                                        <ReactMarkdown
                                            remarkPlugins={[remarkGfm, remarkMath]}
                                            rehypePlugins={[rehypeKatex]}
                                            components={markdownComponents as any}
                                        >
                                            {msg.content}
                                        </ReactMarkdown>
                                    </>
                                ) : (
                                    /* 用户消息保持纯文本渲染 */
                                    <div className="whitespace-pre-wrap">{msg.content}</div>
                                )}

                                {/* Loading 动画 */}
                                {msg.role === 'assistant' && isLoading && msg.content.length === 0 && (
                                    <span className="flex gap-1 items-center h-6">
                                        <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></span>
                                        <span
                                            className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-75"></span>
                                        <span
                                            className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-150"></span>
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                    <div ref={messagesEndRef} className="h-6"/>
                </div>

                {/* Footer */}
                <div className="p-5 bg-white border-t border-slate-100">
                    <div className="flex items-center justify-between mb-3 px-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                onClick={() => {
                                    setUseKb(prev => !prev);
                                    setUsePhotographyMcp(false);
                                }}
                                className={`text-xs font-medium flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${
                                    useKb
                                        ? 'bg-blue-50 text-blue-600 border-blue-200 shadow-sm ring-1 ring-blue-100'
                                        : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                                }`}
                            >
                                <BookOpen className="w-3.5 h-3.5"/>
                                {useKb ? '知识库模式：已开启' : '知识库模式：未开启'}
                            </button>
                            {useKb && (
                                <Select
                                    value={selectedCollId}
                                    options={anthologyOptions}
                                    onChange={setSelectedCollId}
                                    placeholder="全部文集"
                                    emptyMessage="暂无文章文集"
                                    accentClassName="bg-blue-50 text-blue-700"
                                    showSelectedDescription={false}
                                    buttonClassName="!h-[31px] !min-h-[31px] w-[156px] border-blue-200 px-2.5 !py-1 text-xs font-medium shadow-none hover:border-blue-300 focus:border-blue-400 focus:ring-blue-100"
                                    menuClassName="bottom-full right-0 !mt-0 mb-2 w-64 max-h-[min(320px,45vh)] overflow-y-auto z-[120]"
                                />
                            )}
                            <button
                                onClick={() => {
                                    setUsePhotographyMcp(prev => !prev);
                                    setUseKb(false);
                                }}
                                className={`text-xs font-medium flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${
                                    usePhotographyMcp
                                        ? 'bg-orange-50 text-orange-700 border-orange-200 shadow-sm ring-1 ring-orange-100'
                                        : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                                }`}
                            >
                                <Camera className="w-3.5 h-3.5"/>
                                {usePhotographyMcp ? '摄影分析助手 MCP：已开启' : '摄影分析助手 MCP'}
                            </button>
                            {usePhotographyMcp && (
                                <Select
                                    value={selectedImageCollId}
                                    options={imageAnthologyOptions}
                                    onChange={setSelectedImageCollId}
                                    placeholder="全部图片文集"
                                    emptyMessage="暂无图片文集"
                                    accentClassName="bg-orange-50 text-orange-700"
                                    showSelectedDescription={false}
                                    buttonClassName="!h-[31px] !min-h-[31px] w-[168px] border-orange-200 px-2.5 !py-1 text-xs font-medium shadow-none hover:border-orange-300 focus:border-orange-400 focus:ring-orange-100"
                                    menuClassName="bottom-full right-0 !mt-0 mb-2 w-64 max-h-[min(320px,45vh)] overflow-y-auto z-[120]"
                                />
                            )}
                            <button
                                onClick={() => setUseThinking(!useThinking)}
                                className={`text-xs font-medium flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${
                                    useThinking
                                        ? 'bg-amber-50 text-amber-700 border-amber-200 shadow-sm ring-1 ring-amber-100'
                                        : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                                }`}
                            >
                                <BrainCircuit className="w-3.5 h-3.5"/>
                                {useThinking ? '思考模式：已开启' : '思考模式：未开启'}
                            </button>
                        </div>
                        <span className="text-[11px] text-slate-300 font-mono flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                            Model: Auto
                        </span>
                    </div>

                    <div className="relative group">
                        <div
                            className="absolute inset-0 bg-orange-500/5 rounded-2xl blur opacity-0 group-focus-within:opacity-100 transition-opacity"></div>
                        <div
                            className="relative flex items-end gap-2 p-2 bg-slate-50 border border-slate-200 rounded-2xl focus-within:ring-2 focus-within:ring-orange-500/10 focus-within:border-orange-400 focus-within:bg-white transition-all shadow-sm">
                            <textarea
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSend();
                                    }
                                }}
                                placeholder="输入您的问题..."
                                className="flex-1 bg-transparent border-none focus:ring-0 text-base px-3 py-2 resize-none h-[52px] max-h-[200px] overflow-y-auto scrollbar-hide outline-none leading-relaxed placeholder:text-slate-400"
                            />
                            <button
                                onClick={handleSend}
                                disabled={isLoading || !input.trim()}
                                className="shrink-0 mb-0.5 p-2.5 bg-orange-500 text-white rounded-xl hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shadow-orange-500/20 active:scale-95 flex items-center justify-center group/btn"
                            >
                                <Send className="w-5 h-5 group-hover/btn:translate-x-0.5 transition-transform"/>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
