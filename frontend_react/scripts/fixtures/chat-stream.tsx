import {createRoot} from 'react-dom/client';
import {localMode} from '../../src/config/development';
import {useChatSession} from '../../src/components/AIChatWindow/hooks/useChatSession';

const settings = {assistantMode: 'disabled' as const, selectedMcpIds: [], chatMcpServers: [],
    useKb: false, selectedCollId: '', useThinking: true, imageAnthologies: []};
const buildActivitySteps = () => [];

function Fixture() {
    const chat = useChatSession({isOpen: true, activeConversationKey: 'isolated-chat', activeAgent: null, buildActivitySteps});
    return <>
        <button onClick={() => void chat.handleSend('测试', settings)}>发送</button>
        <output data-testid="loading">{String(chat.isLoading)}</output>
        <pre data-testid="messages">{JSON.stringify(chat.messages)}</pre>
    </>;
}

if (!localMode || !(window as Window & {__odocChatStreamTest?: boolean}).__odocChatStreamTest) {
    throw new Error('AI 对话验收页只能由隔离的纯 local 浏览器测试启动');
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
