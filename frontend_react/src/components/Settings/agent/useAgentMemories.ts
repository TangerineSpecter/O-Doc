import {useRef, useState} from 'react';

import {archiveAgentMemory, getAgentMemories, getAgentMemorySummary, saveAgentMemory} from '@/api/setting';
import type {
    AgentConfig,
    AgentLongTermMemoryConfig,
    AgentMemoryStatus,
    AgentMemoryType,
} from '@/api/setting';
import {useToast} from '../../common/ToastProvider';

export type AgentMemoryForm = {
    id?: string;
    scope: string;
    chatId: string;
    senderId: string;
    isPinned: boolean;
    memoryType: AgentMemoryType;
    title: string;
    content: string;
    status: AgentMemoryStatus;
    confidence: string;
};

const emptyMemoryForm = (): AgentMemoryForm => ({
    scope: 'agent', chatId: '', senderId: '', isPinned: false,
    memoryType: 'preference',
    title: '',
    content: '',
    status: 'active',
    confidence: '0.8',
});

export const useAgentMemories = () => {
    const toast = useToast();
    const requestIdRef = useRef(0);
    const [memoryModalAgent, setMemoryModalAgent] = useState<AgentConfig | null>(null);
    const [memories, setMemories] = useState<AgentLongTermMemoryConfig[]>([]);
    const [memorySummary, setMemorySummary] = useState<import('@/types/api/setting').AgentMemorySummary | null>(null);
    const [memorySourceFilter, setMemorySourceFilter] = useState('all');
    const [memoryLoading, setMemoryLoading] = useState(false);
    const [memorySaving, setMemorySaving] = useState(false);
    const [memoryError, setMemoryError] = useState('');
    const [memoryStatusFilter, setMemoryStatusFilter] = useState<'all' | AgentMemoryStatus>('active');
    const [memoryForm, setMemoryForm] = useState<AgentMemoryForm>(emptyMemoryForm);

    const resetMemoryForm = () => setMemoryForm(emptyMemoryForm());

    const loadAgentMemories = async (agent: AgentConfig) => {
        const requestId = ++requestIdRef.current;
        setMemoryLoading(true);
        setMemoryError('');
        try {
            const [data, summary] = await Promise.all([getAgentMemories(agent.id), getAgentMemorySummary(agent.id)]);
            if (requestId === requestIdRef.current) { setMemories(data || []); setMemorySummary(summary); }
        } catch (error) {
            if (requestId !== requestIdRef.current) return;
            console.error('加载 Agent 记忆失败:', error);
            setMemoryError('加载失败，请重试');
            toast.error('加载 Agent 记忆失败');
        } finally {
            if (requestId === requestIdRef.current) setMemoryLoading(false);
        }
    };

    const openMemoryModal = async (agent: AgentConfig) => {
        setMemoryModalAgent(agent);
        setMemoryStatusFilter('active');
        setMemorySourceFilter('all');
        setMemories([]); setMemorySummary(null);
        resetMemoryForm();
        await loadAgentMemories(agent);
    };

    const closeMemoryModal = () => {
        requestIdRef.current += 1;
        setMemoryModalAgent(null);
        setMemoryLoading(false);
    };

    const editMemory = (memory: AgentLongTermMemoryConfig) => {
        setMemoryForm({
            id: memory.id,
            scope: memory.scope, chatId: memory.chatId, senderId: memory.senderId, isPinned: memory.isPinned,
            memoryType: memory.memoryType || 'other',
            title: memory.title || '',
            content: memory.content || '',
            status: memory.status || 'active',
            confidence: String(memory.confidence ?? 0.8),
        });
    };

    const handleMemorySubmit = async () => {
        if (!memoryModalAgent) return;
        if (!memoryForm.content.trim()) {
            toast.warning('请填写记忆内容');
            return;
        }

        setMemorySaving(true);
        try {
            const parsedConfidence = parseFloat(memoryForm.confidence);
            const confidence = Number.isFinite(parsedConfidence)
                ? Math.min(1, Math.max(0, parsedConfidence))
                : 0.8;
            await saveAgentMemory(memoryModalAgent.id, {
                id: memoryForm.id,
                scope: memoryForm.scope, chatId: memoryForm.chatId, senderId: memoryForm.senderId, isPinned: memoryForm.isPinned,
                memoryType: memoryForm.memoryType,
                title: memoryForm.title.trim(),
                content: memoryForm.content.trim(),
                status: memoryForm.status,
                confidence,
            });
            toast.success(memoryForm.id ? '记忆已更新' : '记忆已添加');
            resetMemoryForm();
            await loadAgentMemories(memoryModalAgent);
        } catch (error) {
            console.error('保存 Agent 记忆失败:', error);
            toast.error('保存 Agent 记忆失败');
        } finally {
            setMemorySaving(false);
        }
    };

    const archiveMemory = async (memory: AgentLongTermMemoryConfig) => {
        if (!memoryModalAgent) return;
        setMemorySaving(true);
        try {
            await archiveAgentMemory(memoryModalAgent.id, memory.id);
            toast.success('记忆已归档');
            if (memoryForm.id === memory.id) resetMemoryForm();
            await loadAgentMemories(memoryModalAgent);
        } catch (error) {
            console.error('归档 Agent 记忆失败:', error);
            toast.error('归档 Agent 记忆失败');
        } finally {
            setMemorySaving(false);
        }
    };

    return {
        memorySummary, memorySourceFilter, setMemorySourceFilter,
        memoryModalAgent,
        memories,
        memoryLoading,
        memorySaving,
        memoryError,
        memoryStatusFilter,
        memoryForm,
        setMemoryStatusFilter,
        setMemoryForm,
        resetMemoryForm,
        loadAgentMemories,
        openMemoryModal,
        closeMemoryModal,
        editMemory,
        handleMemorySubmit,
        archiveMemory,
    };
};
