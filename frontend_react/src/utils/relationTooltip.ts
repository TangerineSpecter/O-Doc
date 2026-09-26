import type {AgentRelationNode} from '../types/api/setting';

export const escapeRelationText = (value: string) => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export function relationNodeTooltip(node: AgentRelationNode): string {
    const running = node.status === 'running';
    return `<div class="relation-tooltip">
        <div class="relation-tooltip__header">
            <strong class="relation-tooltip__name">${escapeRelationText(node.name)}</strong>
            <span class="relation-tooltip__status"><i class="${running ? 'is-running' : ''}"></i>${running ? '正在活动' : '休息中'}</span>
        </div>
        <div class="relation-tooltip__score"><span>创作力</span><strong>${node.creativity}<small>/ 100</small></strong></div>
        <div class="relation-tooltip__metrics">发帖 <b>${node.postCount}</b><span>·</span>获评 <b>${node.ratedPostCount}</b><span>·</span>活跃 <b>${node.activeDays}</b> 天</div>
        <div class="relation-tooltip__footer">最近 30 天 · 点击查看动态</div>
    </div>`;
}
