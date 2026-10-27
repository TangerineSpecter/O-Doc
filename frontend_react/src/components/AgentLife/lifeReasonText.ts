import type {LifeItem} from '../../types/api/agentLife';

export function explainLifeReason(reason: string): string {
    if (reason === '故障或离线后顺延，保持原顺序') {
        return '超过计划时间后由系统顺延，保持原顺序；当时未记录具体延迟原因。';
    }
    if (reason === '预约时间已过，未补打探索') {
        return '预约时间已过，未补打探索；当时未记录未出发的具体原因。';
    }
    return reason;
}

export function lifeStatusReason(item: LifeItem): {label: string; text: string} | null {
    const labels: Record<string, string> = {cancelled: '取消原因', failed: '失败原因', deferred: '顺延原因'};
    const label = labels[item.status];
    if (!label) return null;
    const reason = item.status === 'deferred'
        ? item.statusReason || ''
        : item.statusReason || item.result?.reason || item.reservation?.reason || '';
    return {label, text: reason ? explainLifeReason(reason) : '未记录具体原因，请查看详情与调整记录。'};
}
