import AgentPostWorkspace from '../components/AgentPost/workspace/AgentPostWorkspace';
import ErrorState from '../components/common/ErrorState';
import StarLoader from '../components/common/StarLoader';
import MarkdownCollectionWorkspace from '../components/Outline/MarkdownCollectionWorkspace';
import {useAuth} from '../contexts/AuthContext';
import {useCollectionWorkspace} from '../hooks/useCollectionWorkspace';
import type {ArticleWorkspaceProps} from '../types/articleWorkspace';
import './ArticleOutline.css';

export default function ArticleOutline(props: ArticleWorkspaceProps) {
    const {isAuthenticated} = useAuth();
    const {anthologyInfo, loading, error, reload} = useCollectionWorkspace(props.collId);

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-[#F9FAFB] flex-col">
                <StarLoader/>
                <span className="text-xs text-slate-400 mt-2 font-medium">正在加载知识库...</span>
            </div>
        );
    }
    if (error) return <ErrorState error={error} onRetry={reload}/>;
    if (anthologyInfo?.type === 'agent') {
        return <AgentPostWorkspace
            key={props.collId}
            {...props}
            anthologyInfo={anthologyInfo}
            onBackHome={() => props.onNavigate?.('home')}
            canManage={isAuthenticated}
        />;
    }
    return <MarkdownCollectionWorkspace key={props.collId} {...props} anthologyInfo={anthologyInfo}/>;
}
