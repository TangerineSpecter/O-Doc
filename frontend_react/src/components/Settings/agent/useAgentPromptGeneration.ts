import {useEffect, useRef, useState} from 'react';
import {describeAgentAvatar, generateAgentPrompt} from '@/api/agentPrompt';
import type {AgentPromptInput} from '@/types/api/agentPrompt';

interface GenerationState {
    signature: string;
    phase: 'idle' | 'avatar' | 'generation';
    preview: string;
    hasPreview: boolean;
    warning: string;
    error: string;
    question: string;
}
const emptyState: GenerationState = {signature: '', phase: 'idle', preview: '', hasPreview: false, warning: '', error: '', question: ''};

export const useAgentPromptGeneration = (input: AgentPromptInput, enabled: boolean) => {
    const [state, setState] = useState<GenerationState>(emptyState);
    const requestRef = useRef<{id: number; controller?: AbortController}>({id: 0});
    const signature = JSON.stringify([enabled, input]);
    // 输入或展开状态变化即重置归属，改回旧资料也不能恢复已取消的忙碌状态。
    if (state.signature !== signature) setState({...emptyState, signature});
    const activeState = state.signature === signature ? state : emptyState;
    const update = (changes: Partial<GenerationState>) => setState(previous => ({
        ...(previous.signature === signature ? previous : emptyState), ...changes, signature,
    }));

    useEffect(() => {
        const request = requestRef.current;
        request.id += 1;
        request.controller?.abort();
        return () => {
            request.id += 1;
            request.controller?.abort();
        };
    }, [signature]);

    const generate = async () => {
        requestRef.current.controller?.abort();
        const controller = new AbortController();
        const id = ++requestRef.current.id;
        requestRef.current.controller = controller;
        const current = () => !controller.signal.aborted && requestRef.current.id === id;
        update({...emptyState, phase: 'generation'});
        let avatarDescription = '';
        let avatarWarning = '';
        try {
            if (input.referenceAvatar && input.avatar) {
                update({phase: 'avatar'});
                try {
                    const vision = await describeAgentAvatar(input.avatar, controller.signal);
                    avatarDescription = vision.description;
                    avatarWarning = vision.warning;
                } catch {
                    if (!current()) return;
                    avatarWarning = '本次未参考头像，请根据需要检查生成的外形描述。';
                }
            }
            if (!current()) return;
            update({warning: avatarWarning, phase: 'generation'});
            const result = await generateAgentPrompt({...input, referenceAvatar: false, avatarDescription}, controller.signal);
            if (!current()) return;
            update({warning: [avatarWarning, result.warning].filter(Boolean).join(' ')});
            if (result.status === 'needs_information') {
                update({question: result.question});
            } else if (result.prompt.trim()) {
                update({preview: result.prompt, hasPreview: true});
            } else {
                update({error: '生成结果为空，请重试。'});
            }
        } catch (cause) {
            if (current()) update({error: cause instanceof Error ? cause.message : '生成失败，请稍后重试。'});
        } finally {
            if (current()) update({phase: 'idle'});
        }
    };

    return {...activeState, setPreview: (preview: string) => update({preview}), generate};
};
