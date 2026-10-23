import {fishArtIdForName} from '../Fishing/fishVisuals';

export interface ParsedFishingCatch {
    name: string;
    quantity: number;
    artId?: string;
}

export interface ParsedFishingSettlement {
    catches: ParsedFishingCatch[];
    totalCatches: number;
    casts: number;
    reason: string;
    error?: string;
    isPaused: boolean;
    raw: string;
}

/** 整理出钓结束/休整原因文案 */
export function formatFishingReason(reason?: string, isPaused?: boolean, totalCatches?: number) {
    if (isPaused) {
        return reason || '出钓已暂停 · 请到钓鱼面板检查生活运行开关';
    }
    if (!reason) {
        return totalCatches && totalCatches > 0 ? '垂钓结束 · 满载归来' : '本次垂钓结束 · 适时收竿';
    }
    let text = reason.replace(/^[，,；;。.\s]+/, '').replace(/[，,；;。.\s]+$/, '').trim();
    return text || (totalCatches && totalCatches > 0 ? '垂钓结束 · 满载归来' : '本次垂钓结束 · 适时收竿');
}

/**
 * 解析并聚合垂钓记录文本
 * 兼容旧格式（重复名称平铺，如 "乌鳢、乌鳢、乌鳢"）、新格式（如 "乌鳢 ×10"）及各种状态
 */
export function parseFishingSettlement(detail: string, status?: string): ParsedFishingSettlement {
    const raw = detail || '';
    if (!raw.trim()) {
        return {
            catches: [],
            totalCatches: 0,
            casts: 0,
            reason: '',
            isPaused: status === 'paused',
            raw,
        };
    }

    const parts = raw.split(/\s*·\s*/);
    let casts = 0;
    const reasonParts: string[] = [];
    const catchCandidates: string[] = [];
    let isPaused = status === 'paused' || raw.includes('出钓已暂停');

    for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;

        // 匹配抛竿次数，如 "抛竿20次" 或 "抛竿 7 次"
        const castsMatch = trimmed.match(/^抛竿\s*(\d+)\s*次$/);
        if (castsMatch) {
            casts = parseInt(castsMatch[1], 10);
            continue;
        }

        // 匹配系统说明、结束原因、错误提示
        if (
            trimmed.startsWith('系统说明:') ||
            trimmed.startsWith('系统说明：') ||
            trimmed.includes('鱼饵用尽') ||
            trimmed.includes('保留体力') ||
            trimmed.includes('检查本机运行开关') ||
            trimmed.includes('继续出钓') ||
            trimmed.includes('出钓等待重试') ||
            trimmed.includes('出钓已暂停')
        ) {
            const cleanReason = trimmed
                .replace(/^系统说明[:：]\s*/, '')
                .replace(/^出钓已暂停\s*[:：·]?\s*/, '')
                .trim();
            if (cleanReason) {
                reasonParts.push(cleanReason);
            }
            if (trimmed.includes('出钓已暂停') || trimmed.includes('检查本机运行开关')) {
                isPaused = true;
            }
            continue;
        }

        // 无收获标语过滤
        if (trimmed === '尚无收获' || trimmed === '本次没有收获' || trimmed === '等待第一次收获') {
            continue;
        }

        // 候选作为鱼获条目
        catchCandidates.push(trimmed);
    }

    // 解析鱼获列表并聚合数量
    const countMap = new Map<string, number>();

    for (const candidate of catchCandidates) {
        // 顿号、逗号隔开，例如 "乌鳢、鲫鱼、鲫鱼、乌鳢" 或 "乌鳢 ×10、鲫鱼 ×2"
        const items = candidate.split(/[、,，]/);
        for (const item of items) {
            const clean = item.trim();
            if (!clean || clean === '尚无收获') continue;

            // 匹配 "乌鳢 ×10" 或 "乌鳢 x 10" 或 "乌鳢*10"
            const qtyMatch = clean.match(/^(.+?)\s*[×x*X]\s*(\d+)$/);
            if (qtyMatch) {
                const fishName = qtyMatch[1].trim();
                const qty = parseInt(qtyMatch[2], 10);
                if (fishName && !isNaN(qty) && qty > 0) {
                    countMap.set(fishName, (countMap.get(fishName) || 0) + qty);
                    continue;
                }
            }

            // 单个鱼名，如 "乌鳢"
            countMap.set(clean, (countMap.get(clean) || 0) + 1);
        }
    }

    const catches: ParsedFishingCatch[] = Array.from(countMap.entries()).map(([name, quantity]) => ({
        name,
        quantity,
        artId: fishArtIdForName(name),
    }));

    const totalCatches = catches.reduce((acc, curr) => acc + curr.quantity, 0);

    return {
        catches,
        totalCatches,
        casts,
        reason: reasonParts.join(' · '),
        isPaused,
        raw,
    };
}
