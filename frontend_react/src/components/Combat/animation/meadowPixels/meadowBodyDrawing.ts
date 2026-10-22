import type {MeadowKey, MeadowPose} from './meadowTypes';

/** Shared row deformation keeps atlas stills and the animated actor on identical pixels. */
export function drawMeadowBody(ctx: CanvasRenderingContext2D, image: HTMLCanvasElement,
    key: MeadowKey, pose: MeadowPose, centerX: number, feetY: number) {
    ctx.imageSmoothingEnabled = false;
    const sx = key === 'slime' ? 1 : pose.sx, sy = key === 'slime' ? 1 : pose.sy;
    const width = Math.round(128 * sx), height = Math.round(128 * sy);
    for (let row = 0; row < 128; row++) {
        const y = Math.round(feetY + pose.y - (118 - row) * height / 128);
        const tilt = Math.round((118 - row) / 128 * pose.tilt);
        ctx.drawImage(image, 0, row, 128, 1, Math.round(centerX - width / 2 + tilt + pose.x), y,
            width, Math.max(1, Math.ceil(height / 128)));
    }
}
