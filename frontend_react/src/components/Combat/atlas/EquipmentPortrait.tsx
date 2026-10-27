import {getEquipmentVisual} from './atlasIcons';
import {PixelArtSlice} from './PixelArtSlice';
import {weaponConcepts} from '../art/professionConcepts';
import {getEquipmentIcon} from '../art/equipmentIcons';
import {EquipmentPixelArt} from '../art/equipmentPixelArt';
import {equipmentArtProfile} from '../art/equipmentArtProfile';
import {EquipmentRedesignArt} from '../art/EquipmentRedesignArt';
import {elementEquipmentArt} from '../art/elementEquipmentArt';
import {ELEMENT_CONFIGS} from '../ElementBadge';

export function EquipmentPortrait({equipmentId, name, slot, equipmentType, bossOnly, decorative = false,
    className = '', fallbackClassName = 'h-12 w-12'}: {
    equipmentId: string; name?: string; slot?: string; equipmentType?: string; bossOnly?: boolean;
    decorative?: boolean; className?: string; fallbackClassName?: string;
}) {
    const visual = getEquipmentVisual(slot || '', name, bossOnly, equipmentType);
    const Icon = visual.icon;
    const {baseId, element} = elementEquipmentArt(equipmentId);
    const art = weaponConcepts.find(item => item.id === baseId)?.art;
    const equipmentIcon = getEquipmentIcon(baseId);
    const canDrawPixelArt = ['weapon', 'offhand', 'head', 'body', 'hands', 'feet', 'accessory'].includes(slot || '');
    const needsPixelArt = canDrawPixelArt && !art && !equipmentIcon;
    const redesigned = equipmentArtProfile(baseId);
    const elementConfig = element ? ELEMENT_CONFIGS[element] : undefined;
    const ElementIcon = elementConfig?.Icon;
    return <div className={`relative flex items-center justify-center ${className}`} data-equipment-art-id={equipmentId}
        role={decorative ? undefined : 'img'} aria-hidden={decorative || undefined}
        aria-label={decorative ? undefined : `${name || equipmentId}形象`}>
        {redesigned
            ? <EquipmentRedesignArt equipmentId={baseId} className="h-[90%] w-[90%]" />
            : needsPixelArt
            ? <EquipmentPixelArt equipmentId={equipmentId} slot={slot || ''} equipmentType={equipmentType || ''} className="h-[90%] w-[90%]" />
            : art
            ? <div className="flex h-[90%] w-full items-center justify-center"><PixelArtSlice region={art.region} source={art.url} size={art.size} /></div>
            : equipmentIcon
                ? <img src={equipmentIcon} alt="" draggable={false} className="h-[90%] w-[90%] object-contain"
                    style={{imageRendering: 'pixelated'}} />
                : <Icon className={`${fallbackClassName} ${visual.color}`} />}
        {elementConfig && ElementIcon && <span title={elementConfig.fullName}
            className={`absolute bottom-0 right-0 flex h-4 w-4 items-center justify-center rounded-full border border-white shadow-sm ${elementConfig.iconBg} ${elementConfig.iconColor}`}>
            <ElementIcon className="h-3 w-3" />
        </span>}
    </div>;
}
