import {getEquipmentVisual} from './atlasIcons';
import {PixelArtSlice} from './PixelArtSlice';
import {weaponConcepts} from '../art/professionConcepts';
import {getEquipmentIcon} from '../art/equipmentIcons';
import {EquipmentPixelArt} from '../art/equipmentPixelArt';

export function EquipmentPortrait({equipmentId, name, slot, equipmentType, bossOnly, decorative = false,
    className = '', fallbackClassName = 'h-12 w-12'}: {
    equipmentId: string; name?: string; slot?: string; equipmentType?: string; bossOnly?: boolean;
    decorative?: boolean; className?: string; fallbackClassName?: string;
}) {
    const visual = getEquipmentVisual(slot || '', name, bossOnly, equipmentType);
    const Icon = visual.icon;
    const art = weaponConcepts.find(item => item.id === equipmentId)?.art;
    const equipmentIcon = getEquipmentIcon(equipmentId);
    const canDrawPixelArt = ['weapon', 'offhand', 'head', 'body', 'hands', 'feet', 'accessory'].includes(slot || '');
    const needsPixelArt = canDrawPixelArt && !art && !equipmentIcon;
    return <div className={`flex items-center justify-center ${className}`} data-equipment-art-id={equipmentId}
        role={decorative ? undefined : 'img'} aria-hidden={decorative || undefined}
        aria-label={decorative ? undefined : `${name || equipmentId}形象`}>
        {needsPixelArt
            ? <EquipmentPixelArt equipmentId={equipmentId} slot={slot || ''} equipmentType={equipmentType || ''} className="h-[90%] w-[90%]" />
            : art
            ? <div className="flex h-[90%] w-full items-center justify-center"><PixelArtSlice region={art.region} source={art.url} size={art.size} /></div>
            : equipmentIcon
                ? <img src={equipmentIcon} alt="" draggable={false} className="h-[90%] w-[90%] object-contain"
                    style={{imageRendering: 'pixelated'}} />
                : <Icon className={`${fallbackClassName} ${visual.color}`} />}
    </div>;
}
