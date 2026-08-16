export const DOT_GRID_BASE = 24;
export const MIN_SCALE = 0.1;
export const MAX_SCALE = 3;

export const clampScale = (scale: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));

export const getWorldTransform = (offset: {x: number; y: number}, scale: number) =>
    `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`;

export const getDotBackgroundStyle = (
    scale: number,
    offset: {x: number; y: number},
    base = DOT_GRID_BASE
) => {
    const size = base * scale;
    return {
        backgroundColor: '#f0f2f5',
        backgroundImage: 'radial-gradient(#cbd5e1 1.5px, transparent 1.5px)',
        backgroundSize: `${size}px ${size}px`,
        backgroundPosition: `${offset.x}px ${offset.y}px`,
    };
};

export const zoomAtPoint = (
    currentScale: number,
    currentOffset: {x: number; y: number},
    nextScale: number,
    point: {x: number; y: number}
) => {
    const scale = clampScale(nextScale);
    const safeCurrent = currentScale === 0 ? 1 : currentScale;
    return {
        scale,
        viewOffset: {
            x: point.x - (point.x - currentOffset.x) * (scale / safeCurrent),
            y: point.y - (point.y - currentOffset.y) * (scale / safeCurrent),
        },
    };
};
