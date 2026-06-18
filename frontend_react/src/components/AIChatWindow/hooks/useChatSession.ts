// frontend_react/src/components/AIChatWindow/hooks/useChatSession.ts

import { useState, useEffect, useRef } from 'react';
import { type Message, type ActivityStep, type LoadedSkill, type StreamChar } from '../types';
import { type AgentConfig } from '../../../api/setting';
import { type Anthology } from '../../../api/anthology';
import { getImagesByAnthology, type Image } from '../../../api/image';
import { AIConfigError } from '../../../api/ai';

const PHOTOGRAPHY_MCP_ID = 'system:photography';
const CHAT_STORAGE_PREFIX = 'o-doc:ai-chat:';

const getChatStorageKey = (conversationKey: string) => `${CHAT_STORAGE_PREFIX}${conversationKey}`;

const readStoredConversation = (conversationKey: string): { messages: Message[]; updatedAt?: string } => {
    try {
        const raw = localStorage.getItem(getChatStorageKey(conversationKey));
        if (!raw) return { messages: [] };
        const parsed = JSON.parse(raw) as { messages?: Message[] };
        return {
            messages: Array.isArray(parsed.messages) ? parsed.messages : [],
            updatedAt: (parsed as { updatedAt?: string }).updatedAt,
        };
    } catch (error) {
        console.warn('读取本地聊天记录失败:', error);
        return { messages: [] };
    }
};

const loadStoredMessages = (conversationKey: string): Message[] => readStoredConversation(conversationKey).messages;

const saveStoredMessages = (conversationKey: string, messages: Message[]) => {
    try {
        localStorage.setItem(getChatStorageKey(conversationKey), JSON.stringify({
            messages,
            updatedAt: new Date().toISOString(),
        }));
    } catch (error) {
        console.warn('保存本地聊天记录失败:', error);
    }
};

const clearStoredMessages = (conversationKey: string) => {
    try {
        localStorage.removeItem(getChatStorageKey(conversationKey));
    } catch (error) {
        console.warn('清空本地聊天记录失败:', error);
    }
};

const parseImageTags = (image: Image) => {
    const source = image.tagsList?.length ? image.tagsList : (image.tags || '').split(/[,，、;；\n]/);
    return source.map(tag => tag.trim()).filter(Boolean);
};

const getImageShootingDateKey = (image: Image) => {
    const source = image.shootingTime || image.shootingTimeStr || image.date || '';
    return source ? source.replace(' ', 'T').slice(0, 10) : '';
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

const hasAllScopeIntent = (message: string) => {
    const normalized = message.toLowerCase();
    return ['全部', '所有', '全量', '整体', '不限', 'all'].some(keyword => normalized.includes(keyword));
};

const resolvePhotographyAnthologies = (message: string, anthologies: Anthology[]) => {
    if (anthologies.length <= 1) {
        return { anthologies, title: anthologies[0]?.title || '图片文集' };
    }

    const matched = anthologies.filter(item => {
        const title = item.title?.trim();
        return title && message.includes(title);
    });

    if (matched.length > 0) {
        return {
            anthologies: matched,
            title: matched.length === 1 ? matched[0].title : `匹配到的图片文集（${matched.length} 个）`,
        };
    }

    if (hasAllScopeIntent(message)) {
        return { anthologies, title: `全部图片文集（${anthologies.length} 个）` };
    }

    return {
        anthologies: [],
        title: '',
        clarification: `你想分析哪个图片文集？可以回复图片文集名称，或直接说“全部”。当前可选：${anthologies.map(item => item.title).join('、')}`,
    };
};

const buildPhotographyAnalysisPrompt = (
    userMessage: string,
    images: Image[],
    anthologyTitle: string,
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
        const shootingDate = getImageShootingDateKey(image) || '未记录';
        return `${index + 1}. 标题：${image.title || '未命名'}；拍摄日期：${shootingDate}；标签：${tags.join('、') || '无'}；焦段：${normalizeFocalLengthLabel(image.focalLength || '')}；地点：${location}`;
    }).join('\n');

    return `你是“摄影分析助手 MCP”，负责分析图片文集里的摄影统计数据与拍摄风格。

请严格基于下面的数据分析。注意：统计分析只使用“已填写焦段”的图片；未填写焦段的图片只能作为缺失数据说明，不参与焦段、标签焦段、标题场景焦段结论。

你具备可选询问参数：摄影时间范围、标签、地点。这些都不是必填参数。
- 如果用户问题中明确给出时间范围、标签或地点，请先在下面的数据中按这些条件筛选，再只分析筛选后的图片，并在回答开头说明实际使用的筛选范围与命中图片数量。
- 如果用户表达了“按某个范围分析”的意图但没有给出足够范围，例如只说“帮我分析旅行照片”但标签/地点不确定，请先用一句话追问需要的参数，不要直接分析整个文集。
- 如果用户没有提出筛选条件，也没有要求限定范围，则默认分析当前文集范围。
- 不要要求用户填写表单；像 MCP 助手一样通过对话采集缺失参数。

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

const normalizeStreamContent = (value: unknown): string => {
    if (typeof value === 'string') return value;
    if (value == null) return '';
    if (Array.isArray(value)) {
        return value.map(item => normalizeStreamContent(item)).join('');
    }
    if (typeof value === 'object') {
        const record = value as Record<string, unknown>;
        return normalizeStreamContent(record.content ?? record.text ?? record.value ?? '');
    }
    return String(value);
};

const normalizeEventText = (value: unknown): string => {
    return normalizeStreamContent(value).trim();
};

const normalizeLoadedSkills = (value: unknown): LoadedSkill[] => {
    if (!Array.isArray(value)) return [];
    return value.reduce<LoadedSkill[]>((result, item) => {
        if (!item || typeof item !== 'object') return result;
        const record = item as Record<string, unknown>;
        const name = normalizeEventText(record.name);
        if (!name) return result;
        result.push({
            id: normalizeEventText(record.id),
            name,
            version: normalizeEventText(record.version),
            description: normalizeEventText(record.description),
            source: normalizeEventText(record.source),
        });
        return result;
    }, []);
};

export const getConversationSummary = (conversationKey: string, liveMessages?: Message[]) => {
    const stored = liveMessages ? { messages: liveMessages, updatedAt: new Date().toISOString() } : readStoredConversation(conversationKey);
    const lastMessage = [...stored.messages].reverse().find(message => message.content?.trim());
    return {
        content: lastMessage?.content?.trim().replace(/\s+/g, ' ') || '还没有对话，点开开始聊天',
        updatedAt: lastMessage ? stored.updatedAt || '' : '',
    };
};

interface UseChatSessionProps {
    isOpen: boolean;
    activeConversationKey: string;
    activeAgent: AgentConfig | null;
    buildActivitySteps: (
        usePhotographyAssistant: boolean,
        activeMcpServerIds: string[],
        effectiveUseKb: boolean,
        effectiveSelectedSkillIds: string[]
    ) => ActivityStep[];
}

export const useChatSession = ({
    isOpen,
    activeConversationKey,
    activeAgent,
    buildActivitySteps,
}: UseChatSessionProps) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [messagesConversationKey, setMessagesConversationKey] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [activitySteps, setActivitySteps] = useState<ActivityStep[]>([]);
    const [shouldAutoScroll, setShouldAutoScroll] = useState(true);

    const tokenQueueRef = useRef<StreamChar[]>([]);
    const thinkingQueueRef = useRef<StreamChar[]>([]);
    const isThinkingRef = useRef(false);
    const streamFinishedRef = useRef(true);
    const conversationKeyRef = useRef('');
    const generationConversationKeyRef = useRef('');

    const updateConversationMessages = (conversationKey: string, updater: (prev: Message[]) => Message[]) => {
        if (conversationKeyRef.current === conversationKey) {
            setMessagesConversationKey(conversationKey);
            setMessages(prev => {
                const next = updater(prev);
                if (next.length > 0) saveStoredMessages(conversationKey, next);
                return next;
            });
            return;
        }

        const next = updater(loadStoredMessages(conversationKey));
        if (next.length > 0) saveStoredMessages(conversationKey, next);
    };

    const updateStatusMessages = (conversationKey: string, updater: (step: ActivityStep) => ActivityStep) => {
        const activityStatusIds = new Set(['typing', 'photography', 'knowledge', 'mcp', 'skill', 'answer']);
        updateConversationMessages(conversationKey, prev => prev.map(message => {
            if (!message.statusId || !message.status) return message;
            if (!activityStatusIds.has(message.statusId)) return message;
            const next = updater({
                id: message.statusId,
                label: message.content,
                status: message.status,
            });
            return { ...message, status: next.status };
        }));
    };

    // 会话切换监听
    useEffect(() => {
        if (!isOpen) return;
        if (conversationKeyRef.current === activeConversationKey) return;

        conversationKeyRef.current = activeConversationKey;
        setMessages(loadStoredMessages(activeConversationKey));
        setMessagesConversationKey(activeConversationKey);
        setActivitySteps([]);
        setIsLoading(isThinkingRef.current && generationConversationKeyRef.current === activeConversationKey);
    }, [activeConversationKey, isOpen]);

    // 对话自动保存
    useEffect(() => {
        if (!isOpen || conversationKeyRef.current !== activeConversationKey) return;
        if (messagesConversationKey !== activeConversationKey) return;
        if (messages.length === 0) return;
        saveStoredMessages(activeConversationKey, messages);
    }, [activeConversationKey, isOpen, messages, messagesConversationKey]);

    // 平滑输出定时器
    useEffect(() => {
        const takeSmoothChars = (queue: StreamChar[]) => {
            const length = queue.length;
            if (length === 0) return { conversationKey: '', text: '' };

            // 智能根据积压长度调整消费速率，积压多时大幅提速（秒出段落），积压少时匀速输出（丝滑感）
            let count = 1;
            if (length > 180) {
                count = 8;
            } else if (length > 90) {
                count = 5;
            } else if (length > 36) {
                count = 3;
            } else if (length > 8) {
                count = 2;
            }

            const conversationKey = queue[0].conversationKey;
            const chars: string[] = [];

            while (chars.length < count && queue[0]?.conversationKey === conversationKey) {
                chars.push(queue.shift()?.value || '');
            }

            return { conversationKey, text: chars.join('') };
        };

        const interval = setInterval(() => {
            const nextAnswerChars = takeSmoothChars(tokenQueueRef.current);
            const nextThinkingChars = takeSmoothChars(thinkingQueueRef.current);

            if (nextAnswerChars.text || nextThinkingChars.text) {
                const conversationKey = nextAnswerChars.conversationKey || nextThinkingChars.conversationKey;
                updateConversationMessages(conversationKey, prev => {
                    const newMsgs = [...prev];
                    const lastMsg = newMsgs[newMsgs.length - 1];
                    if (lastMsg && lastMsg.role === 'assistant') {
                        newMsgs[newMsgs.length - 1] = {
                            ...lastMsg,
                            status: undefined,
                            statusId: undefined,
                            content: `${lastMsg.content}${nextAnswerChars.text}`,
                            thinking: `${lastMsg.thinking || ''}${nextThinkingChars.text}`
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
                completeActivitySteps(generationConversationKeyRef.current);
                generationConversationKeyRef.current = '';
            }
        }, 16);

        return () => clearInterval(interval);
    }, []);

    const buildStatusMessages = (_steps: ActivityStep[]): Message[] => [{
        role: 'assistant',
        content: '',
        statusId: 'typing',
        status: 'active',
    }];

    const updateActivityStepMessages = (conversationKey: string, mapper: (step: ActivityStep) => ActivityStep) => {
        updateStatusMessages(conversationKey, mapper);
        if (conversationKeyRef.current === conversationKey) {
            setActivitySteps(prev => prev.map(mapper));
        }
    };

    const activateWaitingSteps = (conversationKey = activeConversationKey) => {
        updateActivityStepMessages(conversationKey, step => {
            if (step.id === 'answer') return step.status === 'queued' ? { ...step, status: 'queued' } : step;
            return step.status === 'queued' ? { ...step, status: 'active' } : step;
        });
    };

    const activateAnswerStep = (conversationKey = activeConversationKey) => {
        updateActivityStepMessages(conversationKey, step => {
            if (step.id === 'answer') return { ...step, status: 'active' };
            return step.status === 'active' || step.status === 'queued' ? { ...step, status: 'done' } : step;
        });
    };

    const completeActivitySteps = (conversationKey = activeConversationKey) => {
        updateConversationMessages(conversationKey, prev => prev.filter(message => message.statusId !== 'typing'));
        if (conversationKeyRef.current === conversationKey) {
            setActivitySteps(prev => prev.map(step => ({ ...step, status: 'done' })));
        }
    };

    const completeActivityStep = (id: string, conversationKey = activeConversationKey) => {
        updateActivityStepMessages(conversationKey, step => step.id === id ? { ...step, status: 'done' } : step);
    };

    const confirmClear = () => {
        tokenQueueRef.current = [];
        thinkingQueueRef.current = [];
        streamFinishedRef.current = true;
        isThinkingRef.current = false;
        setMessages([]);
        clearStoredMessages(activeConversationKey);
        setIsLoading(false);
        setActivitySteps([]);
    };

    const addAssistantMessage = (content: string) => {
        updateConversationMessages(activeConversationKey, prev => [
            ...prev,
            { role: 'assistant', content }
        ]);
    };

    // 发送对话消息
    const handleSend = async (
        userMsg: string,
        settings: {
            assistantMode: 'disabled' | 'manual' | 'auto';
            selectedMcpIds: string[];
            chatMcpServers: { id: string; name: string }[];
            useKb: boolean;
            selectedCollId: string;
            useThinking: boolean;
            selectedSkillIds: string[];
            imageAnthologies: Anthology[];
        }
    ) => {
        if (!userMsg.trim() || isLoading) return;

        const requestConversationKey = activeConversationKey;

        tokenQueueRef.current = [];
        thinkingQueueRef.current = [];
        setActivitySteps([]);
        streamFinishedRef.current = false;
        setShouldAutoScroll(true);
        generationConversationKeyRef.current = requestConversationKey;
        setMessagesConversationKey(requestConversationKey);
        setIsLoading(true);
        isThinkingRef.current = true;

        try {
            let messageForAI = userMsg;
            const isDefaultAgent = !activeAgent;

            const usePhotographyAssistant = isDefaultAgent && (settings.assistantMode === 'manual'
                ? settings.selectedMcpIds.includes(PHOTOGRAPHY_MCP_ID)
                : settings.assistantMode === 'auto' && shouldUsePhotographyAssistant(userMsg));

            const activeMcpServerIds = isDefaultAgent
                ? (settings.assistantMode === 'disabled'
                    ? []
                    : settings.assistantMode === 'manual'
                        ? settings.selectedMcpIds.filter(id => id !== PHOTOGRAPHY_MCP_ID)
                        : settings.chatMcpServers.map(server => server.id))
                : [];

            const effectiveUseKb = isDefaultAgent && settings.useKb;
            const effectiveSelectedSkillIds = isDefaultAgent ? settings.selectedSkillIds : [];
            const effectiveUseThinking = isDefaultAgent && settings.useThinking;

            const nextActivitySteps = buildActivitySteps(
                usePhotographyAssistant,
                activeMcpServerIds,
                effectiveUseKb,
                effectiveSelectedSkillIds
            );
            setActivitySteps(nextActivitySteps);
            updateConversationMessages(requestConversationKey, prev => [
                ...prev,
                { role: 'user', content: userMsg },
                ...buildStatusMessages(nextActivitySteps),
            ]);

            if (usePhotographyAssistant) {
                const target = resolvePhotographyAnthologies(userMsg, settings.imageAnthologies);
                if (target.clarification) {
                    streamFinishedRef.current = true;
                    isThinkingRef.current = false;
                    setIsLoading(false);
                    setActivitySteps([]);
                    updateConversationMessages(requestConversationKey, prev => {
                        const newMsgs = [...prev];
                        newMsgs[newMsgs.length - 1] = {
                            role: 'assistant',
                            content: target.clarification,
                            thinking: '',
                        };
                        return newMsgs;
                    });
                    return;
                }

                const targetAnthologies = target.anthologies;

                if (targetAnthologies.length === 0) {
                    throw new Error('暂无可分析的图片文集，请先创建图片文集并填写焦段数据。');
                }

                const getAnthologyCollId = (item: Anthology) => item.collId || (item as any).coll_id || '';
                const imageGroups = await Promise.all(targetAnthologies.map(async (anthology) => {
                    const id = getAnthologyCollId(anthology);
                    const images = id ? await getImagesByAnthology(id) : [];
                    return { anthology, images };
                }));

                const allImages = imageGroups.flatMap(group => group.images);
                const anthologyTitle = target.title || `图片文集（${targetAnthologies.length} 个）`;

                messageForAI = buildPhotographyAnalysisPrompt(userMsg, allImages, anthologyTitle);
                completeActivityStep('photography', requestConversationKey);
            }

            activateWaitingSteps(requestConversationKey);

            const response = await fetch('/api/ai/chat/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: messageForAI,
                    history: messages.map(m => ({ role: m.role, content: m.content })),
                    use_knowledge_base: effectiveUseKb && !usePhotographyAssistant,
                    coll_id: effectiveUseKb && !usePhotographyAssistant && settings.selectedCollId ? settings.selectedCollId : undefined,
                    include_thinking: effectiveUseThinking,
                    agent_id: activeAgent?.id,
                    mcp_server_ids: activeMcpServerIds,
                    skills: effectiveSelectedSkillIds,
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
            let hasCreatedAnswerBubble = false;

            const ensureAnswerBubble = () => {
                if (!hasCreatedAnswerBubble) {
                    hasCreatedAnswerBubble = true;
                    updateConversationMessages(requestConversationKey, prev => {
                        const filtered = prev.filter(msg => msg.statusId !== 'typing');
                        return [
                            ...filtered,
                            {
                                role: 'assistant',
                                content: '',
                                thinking: '',
                            }
                        ];
                    });
                }
            };

            const appendAnswer = (content: string) => {
                ensureAnswerBubble();
                for (const char of content) {
                    tokenQueueRef.current.push({ conversationKey: requestConversationKey, value: char });
                }
            };

            const appendThinking = (content: string) => {
                ensureAnswerBubble();
                for (const char of content) {
                    thinkingQueueRef.current.push({ conversationKey: requestConversationKey, value: char });
                }
            };

            const handleStreamLine = (line: string) => {
                if (!line.trim()) return;

                try {
                    const event = JSON.parse(line);
                    const content = normalizeStreamContent(event.content);

                    if (event.type === 'error') {
                        throw new Error(content || 'AI 服务异常，请检查配置');
                    }

                    if (event.type === 'thinking') {
                        appendThinking(content);
                        return;
                    }

                    if (event.type === 'skills_loaded') {
                        const skills = normalizeLoadedSkills(event.skills);
                        if (skills.length === 0) return;
                        updateConversationMessages(requestConversationKey, prev => {
                            const filtered = prev.filter(msg => msg.statusId !== 'typing');
                            return [
                                ...filtered,
                                {
                                    role: 'assistant',
                                    content: `已装载 ${skills.length} 个技能`,
                                    statusId: `skills-loaded-${Date.now()}`,
                                    status: 'done',
                                    meta: {
                                        kind: 'skills',
                                        skills,
                                    },
                                }
                            ];
                        });
                        return;
                    }

                    if (event.type === 'mcp_tool_call') {
                        const serverName = normalizeEventText(event.serverName) || 'MCP';
                        const toolName = normalizeEventText(event.toolName) || 'tool';
                        updateConversationMessages(requestConversationKey, prev => {
                            const filtered = prev.filter(msg => msg.statusId !== 'typing');
                            return [
                                ...filtered,
                                {
                                    role: 'assistant',
                                    content: `正在使用 ${serverName}`,
                                    statusId: `mcp-${Date.now()}`,
                                    status: 'active',
                                    meta: {
                                        kind: 'mcp',
                                        serverName,
                                        toolName,
                                        arguments: event.arguments,
                                    },
                                }
                            ];
                        });
                        return;
                    }

                    if (event.type === 'mcp_tool_result') {
                        const serverName = normalizeEventText(event.serverName) || 'MCP';
                        const toolName = normalizeEventText(event.toolName) || 'tool';
                        updateConversationMessages(requestConversationKey, prev => {
                            const newMsgs = [...prev];
                            for (let i = newMsgs.length - 1; i >= 0; i--) {
                                const msg = newMsgs[i];
                                if (
                                    msg.role === 'assistant' &&
                                    msg.status === 'active' &&
                                    msg.statusId?.startsWith('mcp-')
                                ) {
                                    const previousArguments = msg.meta?.kind === 'mcp' ? msg.meta.arguments : undefined;
                                    newMsgs[i] = {
                                        ...msg,
                                        content: `${serverName} 处理完毕`,
                                        status: 'done',
                                        statusId: `mcp-done-${Date.now()}`,
                                        meta: {
                                            kind: 'mcp',
                                            serverName,
                                            toolName,
                                            arguments: event.arguments ?? previousArguments,
                                        },
                                    };
                                    break;
                                }
                            }
                            return newMsgs;
                        });
                        return;
                    }

                    if (content) {
                        activateAnswerStep(requestConversationKey);
                    }
                    appendAnswer(content);
                } catch (error) {
                    if (error instanceof SyntaxError) {
                        activateAnswerStep();
                        appendAnswer(line);
                        return;
                    }
                    throw error;
                }
            };

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
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
            setActivitySteps([]);
            updateConversationMessages(requestConversationKey, prev => {
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

    return {
        messages,
        setMessages,
        messagesConversationKey,
        isLoading,
        setIsLoading,
        activitySteps,
        setActivitySteps,
        shouldAutoScroll,
        setShouldAutoScroll,
        confirmClear,
        addAssistantMessage,
        handleSend,
        updateConversationMessages,
    };
};

const shouldUsePhotographyAssistant = (message: string) => {
    const normalized = message.trim().toLowerCase();
    if (!normalized) return false;

    const keywords = [
        '摄影', '照片', '图片', '图像', '文集', '焦段', '焦距', '镜头', '拍摄',
        'exif', 'focal', 'focal length', 'photo', 'image', 'lens',
    ];

    return keywords.some(keyword => normalized.includes(keyword));
};
