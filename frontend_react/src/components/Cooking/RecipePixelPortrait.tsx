import {useEffect, useState} from 'react';
import {ChefHat} from 'lucide-react';
import {getRecipeArtProfile} from './art/recipeVisuals';
import {drawRecipeArt} from './art/recipeArtDrawing';

const sprites = new Map<string, string>();

function spriteFor(recipeId: string) {
    const profile = getRecipeArtProfile(recipeId);
    if (!profile) return;
    const cached = sprites.get(profile.id);
    if (cached) return cached;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    const context = canvas.getContext('2d');
    if (!context) return;
    drawRecipeArt(context, profile);
    const url = canvas.toDataURL();
    sprites.set(profile.id, url);
    return url;
}

export function RecipePixelPortrait({recipeId, name, decorative = false, className = ''}: {
    recipeId: string;
    name?: string;
    decorative?: boolean;
    className?: string;
}) {
    const [image, setImage] = useState<{id: string; url?: string}>({id: ''});
    useEffect(() => {
        let alive = true;
        void Promise.resolve().then(() => spriteFor(recipeId)).then(url => {
            if (alive) setImage({id: recipeId, url});
        });
        return () => {alive = false;};
    }, [recipeId]);

    const sprite = image.id === recipeId ? image.url : undefined;
    return <div className={`flex items-center justify-center ${className}`} data-recipe-art-id={recipeId}
        role={decorative ? undefined : 'img'} aria-hidden={decorative || undefined}
        aria-label={decorative ? undefined : `${name || getRecipeArtProfile(recipeId)?.name || recipeId}形象`}>
        {sprite
            ? <img src={sprite} alt="" draggable={false} className="h-[88%] w-[88%] object-contain" style={{imageRendering: 'pixelated'}}/>
            : <ChefHat className="h-10 w-10 text-orange-300"/>}
    </div>;
}
