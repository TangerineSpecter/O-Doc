export interface NormalizedCropRect {
    x: number;      // 0 ~ 1, left offset relative to image width
    y: number;      // 0 ~ 1, top offset relative to image height
    width: number;  // 0 ~ 1, crop width relative to image width
    height: number; // 0 ~ 1, crop height relative to image height
}

export interface PixelCropResult {
    sx: number;
    sy: number;
    sWidth: number;
    sHeight: number;
}

export type CropCornerHandle = 'nw' | 'ne' | 'sw' | 'se';

/**
 * 计算初始居中 1:1 正方形选区（归一化 0~1）
 */
export function getInitialSquareCrop(naturalWidth: number, naturalHeight: number): NormalizedCropRect {
    if (!naturalWidth || !naturalHeight) {
        return { x: 0, y: 0, width: 1, height: 1 };
    }

    if (naturalWidth >= naturalHeight) {
        // 横图或正方形：选区高度占满 100%，宽度与高度在像素上相等
        const widthRatio = naturalHeight / naturalWidth;
        const xOffset = (1 - widthRatio) / 2;
        return {
            x: xOffset,
            y: 0,
            width: widthRatio,
            height: 1,
        };
    }

    // 竖图：选区宽度占满 100%，高度与宽度在像素上相等
    const heightRatio = naturalWidth / naturalHeight;
    const yOffset = (1 - heightRatio) / 2;
    return {
        x: 0,
        y: yOffset,
        width: 1,
        height: heightRatio,
    };
}

/**
 * 将归一化选区转换为原图像素坐标，并确保为严格 1:1 的正方形
 */
export function getCropPixelCoords(
    crop: NormalizedCropRect,
    naturalWidth: number,
    naturalHeight: number,
    flipHorizontal = false,
): PixelCropResult {
    if (!naturalWidth || !naturalHeight) {
        return { sx: 0, sy: 0, sWidth: 0, sHeight: 0 };
    }

    const rawWidth = Math.round(crop.width * naturalWidth);
    const rawHeight = Math.round(crop.height * naturalHeight);
    const s = Math.max(1, Math.min(rawWidth, rawHeight, naturalWidth, naturalHeight));

    const effectiveX = flipHorizontal
        ? Math.max(0, Math.min(1 - crop.width, 1 - crop.x - crop.width))
        : crop.x;

    let sx = Math.round(effectiveX * naturalWidth);
    let sy = Math.round(crop.y * naturalHeight);

    // 约束不超出边界
    sx = Math.max(0, Math.min(naturalWidth - s, sx));
    sy = Math.max(0, Math.min(naturalHeight - s, sy));

    return {
        sx,
        sy,
        sWidth: s,
        sHeight: s,
    };
}

/**
 * 屏幕像素拖动平移计算
 */
export function moveSquareCrop(
    currentCrop: NormalizedCropRect,
    displayWidth: number,
    displayHeight: number,
    dx: number,
    dy: number,
): NormalizedCropRect {
    if (displayWidth <= 0 || displayHeight <= 0) return currentCrop;

    const s = Math.round(currentCrop.width * displayWidth);
    const origX = currentCrop.x * displayWidth;
    const origY = currentCrop.y * displayHeight;

    const newX = Math.max(0, Math.min(displayWidth - s, origX + dx));
    const newY = Math.max(0, Math.min(displayHeight - s, origY + dy));

    return {
        x: newX / displayWidth,
        y: newY / displayHeight,
        width: s / displayWidth,
        height: s / displayHeight,
    };
}

/**
 * 屏幕像素角点缩放计算（严格保持 1:1 方形）
 */
export function resizeSquareCrop(
    currentCrop: NormalizedCropRect,
    displayWidth: number,
    displayHeight: number,
    handle: CropCornerHandle,
    dx: number,
    dy: number,
    minSize = 48,
): NormalizedCropRect {
    if (displayWidth <= 0 || displayHeight <= 0) return currentCrop;

    const sOrig = Math.round(currentCrop.width * displayWidth);
    const xOrig = currentCrop.x * displayWidth;
    const yOrig = currentCrop.y * displayHeight;

    let nextX = xOrig;
    let nextY = yOrig;
    let nextS = sOrig;

    if (handle === 'se') {
        // 锚点为左上角 (xOrig, yOrig)
        const maxS = Math.min(displayWidth - xOrig, displayHeight - yOrig);
        const actualMinS = Math.min(minSize, maxS);
        const delta = (dx + dy) / 2;
        nextS = Math.max(actualMinS, Math.min(maxS, sOrig + delta));
        nextX = xOrig;
        nextY = yOrig;
    } else if (handle === 'nw') {
        // 锚点为右下角 (xOrig + sOrig, yOrig + sOrig)
        const anchorX = xOrig + sOrig;
        const anchorY = yOrig + sOrig;
        const maxS = Math.min(anchorX, anchorY);
        const actualMinS = Math.min(minSize, maxS);
        const delta = -(dx + dy) / 2;
        nextS = Math.max(actualMinS, Math.min(maxS, sOrig + delta));
        nextX = anchorX - nextS;
        nextY = anchorY - nextS;
    } else if (handle === 'ne') {
        // 锚点为左下角 (xOrig, yOrig + sOrig)
        const anchorX = xOrig;
        const anchorY = yOrig + sOrig;
        const maxS = Math.min(displayWidth - anchorX, anchorY);
        const actualMinS = Math.min(minSize, maxS);
        const delta = (dx - dy) / 2;
        nextS = Math.max(actualMinS, Math.min(maxS, sOrig + delta));
        nextX = anchorX;
        nextY = anchorY - nextS;
    } else if (handle === 'sw') {
        // 锚点为右上角 (xOrig + sOrig, yOrig)
        const anchorX = xOrig + sOrig;
        const anchorY = yOrig;
        const maxS = Math.min(anchorX, displayHeight - anchorY);
        const actualMinS = Math.min(minSize, maxS);
        const delta = (-dx + dy) / 2;
        nextS = Math.max(actualMinS, Math.min(maxS, sOrig + delta));
        nextX = anchorX - nextS;
        nextY = anchorY;
    }

    return {
        x: nextX / displayWidth,
        y: nextY / displayHeight,
        width: nextS / displayWidth,
        height: nextS / displayHeight,
    };
}

/**
 * 滚轮或按钮缩放中心缩放
 */
export function zoomSquareCrop(
    currentCrop: NormalizedCropRect,
    displayWidth: number,
    displayHeight: number,
    zoomFactor: number, // > 1 放大选区, < 1 缩小选区
    minSize = 48,
): NormalizedCropRect {
    if (displayWidth <= 0 || displayHeight <= 0) return currentCrop;

    const sOrig = Math.round(currentCrop.width * displayWidth);
    const xOrig = currentCrop.x * displayWidth;
    const yOrig = currentCrop.y * displayHeight;

    const centerX = xOrig + sOrig / 2;
    const centerY = yOrig + sOrig / 2;

    const maxS = Math.min(displayWidth, displayHeight);
    const actualMinS = Math.min(minSize, maxS);
    const nextS = Math.max(actualMinS, Math.min(maxS, Math.round(sOrig * zoomFactor)));

    let nextX = centerX - nextS / 2;
    let nextY = centerY - nextS / 2;

    nextX = Math.max(0, Math.min(displayWidth - nextS, nextX));
    nextY = Math.max(0, Math.min(displayHeight - nextS, nextY));

    return {
        x: nextX / displayWidth,
        y: nextY / displayHeight,
        width: nextS / displayWidth,
        height: nextS / displayHeight,
    };
}

/**
 * 生成裁切后的方形图片 Blob
 */
export async function createCroppedAvatarBlob(
    image: HTMLImageElement,
    crop: NormalizedCropRect,
    options?: {
        targetSize?: number;
        mimeType?: string;
        quality?: number;
        flipHorizontal?: boolean;
    },
): Promise<Blob> {
    const flipHorizontal = Boolean(options?.flipHorizontal);
    const coords = getCropPixelCoords(crop, image.naturalWidth, image.naturalHeight, flipHorizontal);
    if (!coords.sWidth || !coords.sHeight) {
        throw new Error('无效的裁切范围');
    }

    // 默认输出方形头像尺寸：在 512px 到 1024px 之间，不强行放大比原选区还大
    const defaultTarget = Math.min(1024, Math.max(256, coords.sWidth));
    const outputSize = options?.targetSize ?? Math.min(defaultTarget, coords.sWidth >= 512 ? 512 : coords.sWidth);

    const canvas = document.createElement('canvas');
    canvas.width = outputSize;
    canvas.height = outputSize;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('浏览器无法创建图片画布');
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.save();
    if (flipHorizontal) {
        ctx.translate(outputSize, 0);
        ctx.scale(-1, 1);
    }

    ctx.drawImage(
        image,
        coords.sx,
        coords.sy,
        coords.sWidth,
        coords.sHeight,
        0,
        0,
        outputSize,
        outputSize,
    );
    ctx.restore();

    const mimeType = options?.mimeType || 'image/png';
    const quality = options?.quality ?? 0.95;

    return new Promise((resolve, reject) => {
        canvas.toBlob(
            blob => {
                if (blob) resolve(blob);
                else reject(new Error('裁切图片导出失败'));
            },
            mimeType,
            quality,
        );
    });
}
