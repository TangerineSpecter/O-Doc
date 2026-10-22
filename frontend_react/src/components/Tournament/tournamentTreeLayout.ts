import type {TournamentMatch, TournamentRound} from '../../types/api/tournament';

export interface BracketNode {
    match: TournamentMatch;
    round: number;
    side: 'left' | 'right' | 'center';
    x: number;
    y: number;
}

export const CARD_WIDTH = 168;
export const CARD_HEIGHT = 60;
export const STAGE_WIDTH = 340;
export const MARGIN_X = 36;
export const TREE_WIDTH = 2008;

export interface TournamentTreeLayoutOptions {
    targetWidth?: number;
    fitMode?: 'fit' | 'expanded';
}

/**
 * Reconstruct the actual advancement tree backwards, including rounds with byes.
 * Supports auto-fitting inside dialog container width without horizontal scrolling.
 */
export function layoutTournamentTree(
    rounds: TournamentRound[],
    options: TournamentTreeLayoutOptions = {}
) {
    const nodes: BracketNode[] = rounds.flatMap((r, round) => r.matches.filter(m => m.kind === 'main').map(match => ({
        match, round, side: 'left' as const, x: 0, y: 0,
    })));
    const final = nodes.find(n => rounds[n.round].phase === 'final');
    const branches = nodes.filter(n => n !== final);
    const parents = (node: BracketNode) => nodes.filter(n => n.round === node.round - 1 && n.match.result?.winnerId &&
        [node.match.leftId, node.match.rightId].includes(n.match.result.winnerId));
    const children = new Set(branches.flatMap(n => parents(n).map(p => p.match.id)));
    const roots = branches.filter(n => !children.has(n.match.id)).sort((a, b) => b.round - a.round || a.match.number - b.match.number);
    const leaves: Record<'left' | 'right', BracketNode[]> = {left: [], right: []};
    const assign = (node: BracketNode, side: 'left' | 'right') => {
        node.side = side;
        const sources = parents(node);
        if (!sources.length) leaves[side].push(node);
        else sources.forEach(source => assign(source, side));
    };
    roots.forEach((node, i) => assign(node, i < Math.ceil(roots.length / 2) ? 'left' : 'right'));

    const maxLeaves = Math.max(leaves.left.length, leaves.right.length, 1);
    const verticalStep = 76;
    const headerOffset = 84;
    const paddingY = 140;
    const height = Math.max(520, maxLeaves * verticalStep + paddingY);

    for (const side of ['left', 'right'] as const) {
        const sideLeaves = leaves[side];
        if (!sideLeaves.length) continue;
        const availableHeight = height - paddingY;
        sideLeaves.forEach((node, i) => {
            node.y = headerOffset + (i + 0.5) * availableHeight / sideLeaves.length - CARD_HEIGHT / 2;
        });
    }

    const columns = Math.max(1, rounds.length - (final ? 1 : 0));
    const fitWidth = options.targetWidth ?? 0;
    const fitStageWidth = Math.min(230, Math.max(160, Math.floor(fitWidth * 0.17)));
    const fitMarginX = 14;
    const minimumCardWidth = 94;
    const columnGap = 16;
    const fitSideWidth = (fitWidth - fitStageWidth) / 2 - fitMarginX;
    // Keep readable cards and room for connectors; narrow containers use the scrollable layout.
    const isFit = options.fitMode !== 'expanded' && fitWidth >= 800 &&
        fitSideWidth >= columns * minimumCardWidth + (columns - 1) * columnGap;

    let width: number;
    let cardWidth: number;
    let stageWidth: number;
    let marginX: number;
    let stepX: number;
    let finalWidth: number;

    if (isFit && options.targetWidth) {
        // 自适应整屏容器宽度，消除横向滚动条
        width = fitWidth;
        stageWidth = fitStageWidth;
        marginX = fitMarginX;
        const sideWidth = fitSideWidth;
        cardWidth = Math.min(138, Math.max(minimumCardWidth, Math.floor((sideWidth / columns) * 0.76)));
        finalWidth = Math.min(stageWidth - 20, cardWidth + 12);
        stepX = columns > 1 ? (sideWidth - cardWidth) / (columns - 1) : 0;
    } else {
        // 舒展大图模式 / 默认无 targetWidth 时保证测试兼容
        width = Math.max(TREE_WIDTH, (MARGIN_X + Math.max(1, columns - 1) * 210 + CARD_WIDTH) * 2 + STAGE_WIDTH);
        cardWidth = CARD_WIDTH;
        stageWidth = STAGE_WIDTH;
        marginX = MARGIN_X;
        finalWidth = CARD_WIDTH;
        const leftInnerRight = (width - STAGE_WIDTH) / 2;
        const leftInnerX = leftInnerRight - CARD_WIDTH;
        stepX = columns > 1 ? (leftInnerX - MARGIN_X) / (columns - 1) : 0;
    }

    branches.forEach(node => {
        const sources = parents(node);
        if (sources.length) {
            node.y = sources.reduce((sum, source) => sum + source.y, 0) / sources.length;
        }
        const offset = marginX + node.round * stepX;
        node.x = node.side === 'left' ? offset : width - offset - cardWidth;
    });

    if (final) {
        final.side = 'center';
        final.x = width / 2 - finalWidth / 2;
        final.y = height / 2 + 118;
    }

    const edges = nodes.flatMap(node => parents(node).map(source => ({
        source,
        target: node,
        actorId: source.match.result.winnerId!,
    })));

    return {
        nodes,
        edges,
        width,
        height,
        columns,
        cardWidth,
        cardHeight: CARD_HEIGHT,
        stageWidth,
        marginX,
        stepX,
        finalWidth,
        isFit,
    };
}
