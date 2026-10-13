import {identityParts, identitySheet, independentWeapons, outfitArts} from '@/components/Combat/animation/playerAppearance/layeredPlayerArt';
import {drawPlayerBase} from '@/components/Combat/animation/playerAppearance/playerBaseDrawing';
import {drawPlayerHands} from '@/components/Combat/animation/playerAppearance/playerHandDrawing';
import {getPlayerHandAnchors} from '@/components/Combat/animation/playerAppearance/playerHandRegistration';
import {getPlayerWeaponRegistration} from '@/components/Combat/animation/playerAppearance/playerWeaponRegistration';
import {createCleanBodyCanvas} from '@/components/Combat/animation/playerAppearance/bodyPixelCleanup';

class CanvasPlayerPainter {
    constructor(private readonly context: CanvasRenderingContext2D) {context.beginPath();}
    clear() {this.context.clearRect(0, -310, 374, 528); this.context.beginPath(); return this;}
    rect(x: number, y: number, width: number, height: number) {this.context.rect(x, y, width, height); return this;}
    fill(color: number) {
        this.context.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
        this.context.fill(); this.context.beginPath(); return this;
    }
}

/** Full battle template: fixed pixel proportions, open-eyed neutral face, profession pose, fists and the current weapon. */
export async function createBattlePoseReference(jobId: string, weaponId: string): Promise<File> {
    const outfit = outfitArts.find(item => item.id === jobId) || outfitArts[0];
    const weapon = independentWeapons.find(item => item.id === weaponId);
    const urls = new Set([identitySheet, outfit.body.url]);
    if (weapon) urls.add(weapon.art.url);
    const sheets = new Map<string, ImageBitmap>();
    let cleanedBody: HTMLCanvasElement | undefined;
    try {
        for (const url of urls) {
            const response = await fetch(url);
            if (!response.ok) throw new Error('战斗姿势参考图读取失败');
            sheets.set(url, await createImageBitmap(await response.blob()));
        }
        const canvas = document.createElement('canvas');
        canvas.width = 374; canvas.height = 528;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('无法生成战斗姿势参考图');
        context.imageSmoothingEnabled = false;
        const identity = sheets.get(identitySheet)!;
        const head = identityParts.head;
        context.drawImage(identity, head.x, head.y, head.width, head.height, 0, 0, 374, 310);
        context.save();
        drawPlayerBase(new CanvasPlayerPainter(context));
        const part = outfit.body.region;
        const bodySheet = sheets.get(outfit.body.url)!;
        if (outfit.original) {
            cleanedBody = createCleanBodyCanvas(bodySheet, part);
            context.drawImage(cleanedBody, 0, 0, part.width, part.height, 0, 310, 374, 190);
        } else context.drawImage(bodySheet, part.x, part.y, part.width, part.height, 0, 310, 374, 190);
        for (const key of ['leftBoot', 'rightBoot'] as const) {
            const boot = identityParts[key];
            const x = key === 'leftBoot' ? 104 : 195;
            context.drawImage(identity, boot.x, boot.y, boot.width, boot.height, x, 500, boot.width, boot.height);
        }
        context.restore();
        const anchors = getPlayerHandAnchors(outfit.id);
        if (weapon) {
            const {region} = weapon.art;
            const registration = getPlayerWeaponRegistration(weapon.id, region.width, region.height);
            const scale = registration.height / region.height;
            context.save(); context.translate(anchors.right.x, anchors.right.y); context.rotate(registration.rotation);
            context.scale(registration.mirrored ? -scale : scale, scale);
            context.translate(-registration.grip.x, -registration.grip.y);
            context.drawImage(sheets.get(weapon.art.url)!, region.x, region.y, region.width, region.height, 0, 0, region.width, region.height);
            context.restore();
        }
        const handCanvas = document.createElement('canvas'); handCanvas.width = 374; handCanvas.height = 218;
        const handContext = handCanvas.getContext('2d');
        if (!handContext) throw new Error('无法生成战斗手部参考图');
        handContext.translate(0, -310);
        drawPlayerHands(new CanvasPlayerPainter(handContext), Boolean(weapon), anchors);
        context.drawImage(handCanvas, 0, 310);
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('战斗姿势参考图导出失败')), 'image/png'));
        return new File([blob], `battle-pose-${jobId}-${weaponId}.png`, {type: 'image/png'});
    } finally {
        for (const bitmap of sheets.values()) bitmap.close();
        if (cleanedBody) {cleanedBody.width = 0; cleanedBody.height = 0;}
    }
}
