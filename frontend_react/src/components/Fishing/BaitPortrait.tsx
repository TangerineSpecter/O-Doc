import {useEffect, useState} from 'react';
import {baitArtKey, drawBaitArt} from './baitArtDrawing';

const sprites = new Map<string, string>();
function spriteFor(id: string) {
    const key = baitArtKey(id);
    if (sprites.has(key)) return sprites.get(key);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (!ctx || !drawBaitArt(ctx, key)) return undefined;
    const url = canvas.toDataURL('image/png');
    sprites.set(key, url);
    return url;
}

export function BaitPortrait({baitId, className = ''}: {baitId: string; className?: string}) {
    const [image, setImage] = useState<{id: string; url?: string}>({id: ''});
    useEffect(() => {
        let alive = true;
        void Promise.resolve().then(() => spriteFor(baitId)).then(url => {
            if (alive) setImage({id: baitId, url});
        });
        return () => {alive = false;};
    }, [baitId]);
    const url = image.id === baitId ? image.url : undefined;
    return <span className={`inline-flex items-center justify-center ${className}`} aria-hidden="true" data-bait-art-id={baitId}>
        {url && <img src={url} alt="" draggable={false} className="h-full w-full object-contain" style={{imageRendering: 'pixelated'}}/>}
    </span>;
}
