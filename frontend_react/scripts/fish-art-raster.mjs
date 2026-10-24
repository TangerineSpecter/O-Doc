import {drawFishArt} from '../src/components/Fishing/fishArtDrawing.ts';

/** 执行实际像素绘制器；只实现其使用的Canvas整数填充操作，便于无浏览器逐像素比较。 */
export function rasterFishArt(profile) {
    const rgba = new Uint8Array(32 * 32 * 4);
    const context = {
        fillStyle: '#000000',
        clearRect() {rgba.fill(0);},
        fillRect(x, y, width, height) {
            const hex = this.fillStyle.slice(1);
            if (!/^[0-9a-f]{6}$/i.test(hex)) throw new Error(`Unsupported fish color: ${this.fillStyle}`);
            const rgb = [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16));
            for (let py = Math.max(0, Math.ceil(y)); py < Math.min(32, y + height); py++) {
                for (let px = Math.max(0, Math.ceil(x)); px < Math.min(32, x + width); px++) rgba.set([...rgb, 255], (py * 32 + px) * 4);
            }
        },
    };
    drawFishArt(context, profile);
    return rgba;
}

export const silhouette = rgba => rgba.filter((_, index) => index % 4 === 3);
