import {BATTLE_CHARACTER_MIN_SCALE, BATTLE_CHARACTER_MAX_SCALE} from './imageProcessing';
import type {AgentBattleAppearance, BattleAppearanceOverlays} from '@/types/api/setting';

export interface AppearancePackageDraft {
    source: File;
    cutout: Blob;
    character: Blob;
    transform: AgentBattleAppearance['transform'];
    overlays: BattleAppearanceOverlays;
    preview: {jobId: string; weaponId: string};
}
interface PackedImage {name: string; type: string; data: string}
interface AppearancePackage {
    format: 'agent-battle-appearance';
    version: 1;
    appearanceVersion: 3;
    rendererVersion: 1;
    source: PackedImage;
    cutout: PackedImage;
    character: PackedImage;
    transform: AppearancePackageDraft['transform'];
    overlays: BattleAppearanceOverlays;
    preview: AppearancePackageDraft['preview'];
}
const MAX_BYTES = 64 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const invalid = () => new Error('战斗形象包损坏或格式不支持，请重新导出');
const numberIn = (value: unknown, min: number, max: number) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

async function packImage(blob: Blob, name: string): Promise<PackedImage> {
    const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(new Error('读取形象素材失败'));
        reader.readAsDataURL(blob);
    });
    return {name, type: blob.type, data};
}
function unpackImage(value: PackedImage): File {
    if (!value || !IMAGE_TYPES.has(value.type) || typeof value.name !== 'string' || typeof value.data !== 'string' ||
        value.data.length > MAX_BYTES || !/^[A-Za-z0-9+/]*={0,2}$/.test(value.data)) throw invalid();
    const binary = atob(value.data);
    if (!binary.length) throw invalid();
    return new File([Uint8Array.from(binary, char => char.charCodeAt(0))], value.name.slice(0, 255), {type: value.type});
}
export async function encodeAppearancePackage(draft: AppearancePackageDraft): Promise<Blob> {
    const [source, cutout, character] = await Promise.all([
        packImage(draft.source, draft.source.name), packImage(draft.cutout, 'cutout.png'), packImage(draft.character, 'character.png'),
    ]);
    const value: AppearancePackage = {format: 'agent-battle-appearance', version: 1, appearanceVersion: 3, rendererVersion: 1,
        source, cutout, character, transform: draft.transform, overlays: draft.overlays, preview: draft.preview};
    const blob = new Blob([JSON.stringify(value)], {type: 'application/json'});
    if (blob.size > MAX_BYTES) throw new Error('形象包超过 64 MB，请缩小原图后重试');
    return blob;
}
export async function decodeAppearancePackage(file: File): Promise<AppearancePackageDraft> {
    if (file.size > MAX_BYTES) throw new Error('形象包不能超过 64 MB');
    let value: AppearancePackage;
    try {value = JSON.parse(await file.text());} catch {throw invalid();}
    if (!value || value.format !== 'agent-battle-appearance' || value.version !== 1 || value.appearanceVersion !== 3 || value.rendererVersion !== 1) throw invalid();
    const transform = value.transform;
    const crop = transform?.crop;
    if (!transform || !numberIn(transform.x, -374, 374) || !numberIn(transform.y, -528, 528) || !numberIn(transform.scale, BATTLE_CHARACTER_MIN_SCALE, BATTLE_CHARACTER_MAX_SCALE) ||
        !crop || !Number.isInteger(crop.x) || !Number.isInteger(crop.y) || !Number.isInteger(crop.width) || !Number.isInteger(crop.height) ||
        crop.x < 0 || crop.y < 0 || crop.width < 1 || crop.height < 1) throw invalid();
    for (const key of ['leftHand', 'rightHand', 'weapon'] as const) {
        const layer = value.overlays?.[key];
        if (!layer || !numberIn(layer.x, -374, 374) || !numberIn(layer.y, -528, 528) || !numberIn(layer.scale, .3, 3) || !numberIn(layer.rotation, -Math.PI, Math.PI)) throw invalid();
    }
    if (typeof value.preview?.jobId !== 'string' || typeof value.preview?.weaponId !== 'string') throw invalid();
    const source = unpackImage(value.source), cutout = unpackImage(value.cutout), character = unpackImage(value.character);
    if (cutout.type !== 'image/png' || character.type !== 'image/png') throw invalid();
    // Read dimensions before the editor changes any existing draft state.
    const bitmaps = await Promise.allSettled([source, cutout, character].map(image => createImageBitmap(image)));
    try {
        if (bitmaps.some(result => result.status === 'rejected')) throw invalid();
        const images = bitmaps.map(result => (result as PromiseFulfilledResult<ImageBitmap>).value);
        const [original, matte, final] = images;
        if (original.width * original.height > 12_000_000 || original.width !== matte.width || original.height !== matte.height ||
            final.width !== 374 || final.height !== 528 || crop.x + crop.width > original.width || crop.y + crop.height > original.height) throw invalid();
    } finally {
        for (const result of bitmaps) if (result.status === 'fulfilled') result.value.close();
    }
    return {source, cutout, character, transform: {x: transform.x, y: transform.y, scale: transform.scale, crop},
        overlays: Object.fromEntries(['leftHand', 'rightHand', 'weapon'].map(key => {
            const layer = value.overlays[key as keyof BattleAppearanceOverlays];
            return [key, {x: layer.x, y: layer.y, scale: layer.scale, rotation: layer.rotation}];
        })) as unknown as BattleAppearanceOverlays,
        preview: value.preview};
}
