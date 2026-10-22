import {useEffect, useState} from 'react';
import {drawFishArt} from './fishArtDrawing';
import {fishArtKey, getFishArtProfile} from './fishVisuals';

const sprites = new Map<string, string>();
function spriteFor(id: string) {
    const key = fishArtKey(id);
    if (sprites.has(key)) return sprites.get(key)!;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    drawFishArt(ctx, getFishArtProfile(id));
    const url = canvas.toDataURL('image/png');
    sprites.set(key, url);
    return url;
}

/** 与药剂图标同样的 Canvas 像素绘制和 PNG 缓存，列表、详情共用。 */
export function FishPortrait({fishId, name, decorative = false, className = ''}: {
    fishId: string; name: string; decorative?: boolean; className?: string;
}) {
    const [image, setImage] = useState<{id: string; url?: string}>({id: ''});
    useEffect(() => {
        let alive = true;
        void Promise.resolve().then(() => spriteFor(fishId)).then(url => {
            if (alive) setImage({id: fishId, url});
        });
        return () => {alive = false;};
    }, [fishId]);
    const url = image.id === fishId ? image.url : undefined;
    return <div className={`flex items-center justify-center ${className}`} data-fish-art-id={fishId}
        role={decorative ? undefined : 'img'} aria-label={decorative ? undefined : `${name}形象`} aria-hidden={decorative || undefined}>
        {url && <img src={url} alt="" draggable={false} className="h-full w-full object-contain" style={{imageRendering: 'pixelated'}}/>}
    </div>;
}
