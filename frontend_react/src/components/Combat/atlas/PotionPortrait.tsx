import {useEffect, useState} from 'react';
import {FlaskConical} from 'lucide-react';
import {getPotionArtProfile} from '../art/potionVisuals';
import {drawPotionArt} from '../art/potionArtDrawing';

const sprites = new Map<string, string>();

function spriteFor(id: string) {
    const profile = getPotionArtProfile(id);
    if (!profile) return;
    if (sprites.has(id)) return sprites.get(id);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    drawPotionArt(canvas.getContext('2d')!, profile);
    const url = canvas.toDataURL();
    sprites.set(id, url);
    return url;
}

export function PotionPortrait({potionId, name, decorative = false, className = ''}: {
    potionId: string;
    name?: string;
    decorative?: boolean;
    className?: string;
}) {
    const [image, setImage] = useState<{id: string; url?: string}>({id: ''});
    useEffect(() => {
        let alive = true;
        void Promise.resolve().then(() => spriteFor(potionId)).then(url => {
            if (alive) setImage({id: potionId, url});
        });
        return () => {alive = false;};
    }, [potionId]);

    const sprite = image.id === potionId ? image.url : undefined;
    return <div className={`flex items-center justify-center ${className}`} data-potion-art-id={potionId}
        role={decorative ? undefined : 'img'} aria-hidden={decorative || undefined} aria-label={decorative ? undefined : `${name || potionId}形象`}>
        {sprite
            ? <img src={sprite} alt="" draggable={false} className="h-[88%] w-[88%] object-contain" style={{imageRendering: 'pixelated'}}/>
            : <FlaskConical className="h-10 w-10 text-rose-500"/>}
    </div>;
}
