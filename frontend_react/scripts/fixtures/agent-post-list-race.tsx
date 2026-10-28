import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ToastProvider} from '../../src/components/common/ToastProvider';
import {localMode} from '../../src/config/development';
import {useAgentPostWorkspaceData} from '../../src/hooks/useAgentPostWorkspaceData';

function ListFixture() {
    const [articleId, setArticleId] = useState<string>();
    const state = useAgentPostWorkspaceData({collId: 'race', articleId, anthologyInfo: null, canManage: false});
    return <>
        <button onClick={() => void state.loadPosts()}>重新加载</button>
        <button onClick={() => void state.handleRefresh()}>手动刷新</button>
        <button onClick={() => setArticleId('post-1')}>打开详情</button>
        <input aria-label="评论内容" value={state.commentDraft} onChange={event => state.setCommentDraft(event.target.value)}/>
        <button onClick={() => void state.handleSubmitComment()}>发表评论</button>
        <button onClick={() => void state.handleRatePost(8)}>评分</button>
        <button onClick={() => state.setDeleteTarget(state.activePost)}>选择删除</button>
        <button onClick={() => void state.confirmDeletePost()}>确认删除</button>
        <output data-testid="title">{state.posts.map(post => post.title).join(',')}</output>
        <output data-testid="list-count">{state.posts[0]?.postCommentCount ?? ''}</output>
        <output data-testid="list-rating">{state.posts[0]?.myAgentPostRating ?? ''}</output>
        <output data-testid="comments">{state.latestComments.map(comment => comment.content).join(',')}</output>
        <output data-testid="loading">{String(state.loading)}</output>
        <output data-testid="detail">{state.activePost?.articleId || ''}</output>
        <output data-testid="post-comments">{state.comments.map(comment => comment.content).join(',')}</output>
    </>;
}

function Fixture() {
    const [mounted, setMounted] = useState(true);
    return <ToastProvider><button onClick={() => setMounted(false)}>卸载</button>{mounted && <ListFixture/>}</ToastProvider>;
}

// The browser regression installs both this flag and an interceptor for every API.
// Do not allow opening the fixture without that interceptor and reaching a backend.
if (!localMode || !(window as Window & {__odocPostRaceTest?: boolean}).__odocPostRaceTest) {
    throw new Error('帖子列表验收页只能由隔离的纯 local 浏览器测试启动');
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
