import {getEquipmentVisual} from './atlasIcons';
import {PixelArtSlice} from './PixelArtSlice';
import {weaponConcepts} from '../art/professionConcepts';

export function EquipmentPortrait({equipmentId, name, slot, bossOnly, decorative = false,
    className = '', fallbackClassName = 'h-12 w-12'}: {
    equipmentId: string; name?: string; slot?: string; bossOnly?: boolean;
    decorative?: boolean; className?: string; fallbackClassName?: string;
}) {
    const visual = getEquipmentVisual(slot || '', name, bossOnly);
    const Icon = visual.icon;
    const art = weaponConcepts.find(item => item.id === equipmentId)?.art;
    return <div className={`flex items-center justify-center ${className}`} data-equipment-art-id={equipmentId}
        role={decorative ? undefined : 'img'} aria-hidden={decorative || undefined}
        aria-label={decorative ? undefined : `${name || equipmentId}形象`}>
        {art
            ? <div className="flex h-[90%] w-full items-center justify-center"><PixelArtSlice region={art.region} source={art.url} size={art.size} /></div>
            : <Icon className={`${fallbackClassName} ${visual.color}`} />}
    </div>;
}
