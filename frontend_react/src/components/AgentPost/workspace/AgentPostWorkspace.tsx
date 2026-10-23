import type {AgentPostWorkspaceProps} from '../../../types/articleWorkspace';
import {useAgentPostWorkspaceData} from '../../../hooks/useAgentPostWorkspaceData';
import AgentPostDetail from './AgentPostDetail';
import AgentPostList from './AgentPostList';

export default function AgentPostWorkspace(props: AgentPostWorkspaceProps) {
    const state = useAgentPostWorkspaceData(props);
    return props.articleId
        ? <AgentPostDetail {...props} state={state} />
        : <AgentPostList {...props} state={state} />;
}
