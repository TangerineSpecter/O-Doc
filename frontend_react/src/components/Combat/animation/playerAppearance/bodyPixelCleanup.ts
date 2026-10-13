type PixelRegion = {x: number; y: number; width: number; height: number};

const DETACHED_HEAD_PIXEL_STRIP_HEIGHT = 12;
const MAX_DETACHED_HEAD_PIXEL_AREA = 250;

/** Remove the small, disconnected remnants of the source head above approved body sprites. */
export function removeDetachedHeadPixelsAtBodyTop(
    data: Uint8ClampedArray,
    width: number,
    height: number,
): void {
    const visited = new Uint8Array(width * height);
    const queue = new Int32Array(width * height);

    for (let start = 0; start < width * height; start++) {
        if (visited[start] || data[start * 4 + 3] === 0) continue;

        let head = 0;
        let tail = 0;
        let maxY = 0;
        queue[tail++] = start;
        visited[start] = 1;

        while (head < tail) {
            const index = queue[head++];
            const x = index % width;
            const y = Math.floor(index / width);
            maxY = Math.max(maxY, y);

            const left = index - 1;
            if (x > 0 && !visited[left] && data[left * 4 + 3] !== 0) {
                visited[left] = 1; queue[tail++] = left;
            }
            const right = index + 1;
            if (x + 1 < width && !visited[right] && data[right * 4 + 3] !== 0) {
                visited[right] = 1; queue[tail++] = right;
            }
            const above = index - width;
            if (y > 0 && !visited[above] && data[above * 4 + 3] !== 0) {
                visited[above] = 1; queue[tail++] = above;
            }
            const below = index + width;
            if (y + 1 < height && !visited[below] && data[below * 4 + 3] !== 0) {
                visited[below] = 1; queue[tail++] = below;
            }
        }

        if (tail > MAX_DETACHED_HEAD_PIXEL_AREA || maxY >= DETACHED_HEAD_PIXEL_STRIP_HEIGHT) continue;
        for (let index = 0; index < tail; index++) data[queue[index] * 4 + 3] = 0;
    }
}

/** Copy one body sprite to an editable canvas and erase disconnected source-head pixels. */
export function createCleanBodyCanvas(source: CanvasImageSource, region: PixelRegion): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = region.width;
    canvas.height = region.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法清理职业身体素材');
    context.imageSmoothingEnabled = false;
    context.drawImage(source, region.x, region.y, region.width, region.height, 0, 0, region.width, region.height);
    const pixels = context.getImageData(0, 0, region.width, region.height);
    removeDetachedHeadPixelsAtBodyTop(pixels.data, region.width, region.height);
    context.putImageData(pixels, 0, 0);
    return canvas;
}
