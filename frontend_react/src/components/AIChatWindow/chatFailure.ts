import type {Message} from './types';

export function previousUserIndex(messages: Message[], before = messages.length): number {
    for (let index = before - 1; index >= 0; index--) {
        if (messages[index].role === 'user') return index;
    }
    return -1;
}

export function failChatTurn(messages: Message[], reason: string, pendingAnswer = '', pendingThinking = ''): Message[] {
    const userIndex = previousUserIndex(messages);
    const prefix = messages.slice(0, userIndex + 1);
    const turn = messages.slice(userIndex + 1);
    const answer = [...turn].reverse().find(message => !message.status && message.role === 'assistant');
    const completedTools = turn.filter(message => message.status === 'done' && message.statusId !== 'typing');
    return [...prefix, ...completedTools, {
        role: 'assistant',
        content: `${answer?.content || ''}${pendingAnswer}` || '这次没能完成回复，请稍后重试。',
        thinking: `${answer?.thinking || ''}${pendingThinking}`,
        error: reason,
    }];
}

export function recoverInterruptedChat(messages: Message[]): Message[] {
    const turn = messages.slice(previousUserIndex(messages) + 1);
    return turn.some(message => message.status === 'active' || message.status === 'queued')
        ? failChatTurn(messages, '上次生成已中断，可以重新尝试。')
        : messages;
}
