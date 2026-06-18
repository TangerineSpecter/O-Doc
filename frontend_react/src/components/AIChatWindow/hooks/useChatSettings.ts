// frontend_react/src/components/AIChatWindow/hooks/useChatSettings.ts

import { useState, useEffect, useMemo } from 'react';
import { type Anthology, getAnthologyList } from '../../../api/anthology';
import { getMCPServers, getSkills, type MCPServerConfig, type SkillConfig } from '../../../api/setting';
import { type AssistantMode } from '../types';
import { type SelectOption } from '../../common/Select';

export const PHOTOGRAPHY_MCP_ID = 'system:photography';

interface UseChatSettingsProps {
    isOpen: boolean;
    messagesLength: number;
    activeConversationKey: string;
    onAddAssistantMessage?: (content: string) => void;
}

export const useChatSettings = ({ isOpen, messagesLength, activeConversationKey, onAddAssistantMessage }: UseChatSettingsProps) => {
    const [useKb, setUseKb] = useState(false);
    const [useThinking, setUseThinking] = useState(false);
    const [assistantMode, setAssistantMode] = useState<AssistantMode>('disabled');
    const [anthologies, setAnthologies] = useState<Anthology[]>([]);
    const [imageAnthologies, setImageAnthologies] = useState<Anthology[]>([]);
    const [selectedCollId, setSelectedCollId] = useState('');
    const [chatMcpServers, setChatMcpServers] = useState<MCPServerConfig[]>([]);
    const [selectedMcpIds, setSelectedMcpIds] = useState<string[]>([PHOTOGRAPHY_MCP_ID]);
    const [mcpPanelOpen, setMcpPanelOpen] = useState(false);
    const [chatSkills, setChatSkills] = useState<SkillConfig[]>([]);
    const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
    const [skillPanelOpen, setSkillPanelOpen] = useState(false);

    // 0. 当会话/智能体切换时，重置所有设置以防止状态污染
    useEffect(() => {
        setUseKb(false);
        setUseThinking(false);
        setAssistantMode('disabled');
        setSelectedCollId('');
        setSelectedMcpIds([PHOTOGRAPHY_MCP_ID]);
        setSelectedSkillIds([]);
        setMcpPanelOpen(false);
        setSkillPanelOpen(false);
    }, [activeConversationKey]);

    // 1. 加载文集列表
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

    // 2. 加载技能与 MCP 配置
    useEffect(() => {
        if (!isOpen) return;

        Promise.all([getSkills(), getMCPServers()])
            .then(([skillData, mcpData]) => {
                const data = (skillData || []) as unknown as SkillConfig[];
                const mcpServers = (mcpData || []) as unknown as MCPServerConfig[];
                const usableSkills = (data || []).filter(skill => skill.enabled && skill.availableInChat);
                setChatSkills(usableSkills);
                setSelectedSkillIds(prev => prev.filter(id => usableSkills.some(skill => skill.id === id)));
                const enabledMcpServers = mcpServers.filter(server => server.enabled && server.availableInChat);
                setChatMcpServers(enabledMcpServers);
                setSelectedMcpIds(prev => prev.filter(id => id === PHOTOGRAPHY_MCP_ID || enabledMcpServers.some(server => server.id === id)));
            })
            .catch(error => {
                console.warn('加载 AI 对话配置失败:', error);
            });
    }, [isOpen]);

    const getAnthologyCollId = (item: Anthology) => item.collId || (item as any).coll_id || '';

    const anthologyOptions = useMemo<SelectOption<string>[]>(() => [
        { value: '', label: '全部文集' },
        ...anthologies
            .map(item => ({
                value: getAnthologyCollId(item),
                label: item.title,
                description: `${item.count || 0} 篇内容`
            }))
            .filter(option => option.value)
    ], [anthologies]);

    const mcpOptions = useMemo(() => [
        {
            id: PHOTOGRAPHY_MCP_ID,
            name: '摄影分析助手',
            description: '系统内置，通过对话采集图片文集、时间、标签、地点等参数',
            source: 'system',
        },
        ...chatMcpServers.map(server => ({
            id: server.id,
            name: server.name,
            description: server.description || `${server.tools?.filter(tool => tool.enabled).length || 0} 个可用 Tool`,
            source: server.source,
        })),
    ], [chatMcpServers]);

    const getMcpName = (mcpId: string) => (
        mcpId === PHOTOGRAPHY_MCP_ID
            ? '摄影分析助手'
            : chatMcpServers.find(server => server.id === mcpId)?.name || mcpId
    );

    const getSkillName = (skillId: string) => (
        chatSkills.find(skill => skill.id === skillId)?.name || skillId
    );

    const toggleChatSkill = (skillId: string) => {
        setSelectedSkillIds(prev => prev.includes(skillId)
            ? prev.filter(id => id !== skillId)
            : [...prev, skillId]
        );
    };

    const toggleMcp = (mcpId: string) => {
        setSelectedMcpIds(prev => {
            const next = prev.includes(mcpId)
                ? prev.filter(id => id !== mcpId)
                : [...prev, mcpId];

            if (
                mcpId === PHOTOGRAPHY_MCP_ID &&
                !prev.includes(PHOTOGRAPHY_MCP_ID) &&
                assistantMode === 'manual' &&
                messagesLength === 0 &&
                onAddAssistantMessage
            ) {
                onAddAssistantMessage('摄影分析助手已装载。你可以直接说要分析哪个图片文集，或回复“全部”。时间范围、标签、地点也可以在对话里补充。');
            }

            return next;
        });
    };

    const setModeWithSideEffects = (mode: AssistantMode) => {
        setAssistantMode(mode);

        const photographyEnabled = mode === 'manual' && selectedMcpIds.includes(PHOTOGRAPHY_MCP_ID);
        if (photographyEnabled) {
            setUseKb(false);
        }

        if (photographyEnabled && messagesLength === 0 && onAddAssistantMessage) {
            onAddAssistantMessage('摄影分析助手已开启。你可以直接说分析范围，例如“分析 2024 年在上海拍的人像照片”或“只看风景标签，看看我常用哪些焦段”。时间范围、标签、地点都是可选的；不说范围时我会分析当前选择的图片文集。');
        }
    };

    return {
        useKb,
        setUseKb,
        useThinking,
        setUseThinking,
        assistantMode,
        setAssistantMode,
        selectedCollId,
        setSelectedCollId,
        selectedMcpIds,
        setSelectedMcpIds,
        selectedSkillIds,
        setSelectedSkillIds,
        anthologies,
        imageAnthologies,
        chatMcpServers,
        chatSkills,
        mcpPanelOpen,
        setMcpPanelOpen,
        skillPanelOpen,
        setSkillPanelOpen,
        anthologyOptions,
        mcpOptions,
        getMcpName,
        getSkillName,
        toggleChatSkill,
        toggleMcp,
        setModeWithSideEffects
    };
};
