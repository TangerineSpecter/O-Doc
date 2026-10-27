/** The catalog variant keeps its identity; only its underlying silhouette is shared. */
export function elementEquipmentArt(id: string): {baseId: string; element?: 'water'|'earth'|'wind'|'fire'} {
    const match = id.match(/^(equip\.(?:sword|axe|bow|dagger|mage_staff)(?:\.30)?|equip\.(?:staff|holy_staff)|equip\.instrument(?:\.(?:30|element_low))?)(?:\.element\.(water|earth|wind|fire))?$/);
    if (!match) return {baseId: id};
    let baseId = match[1];
    if (/^equip\.(sword|axe|bow|dagger|mage_staff)\.30$/.test(baseId)) baseId = baseId.slice(0, -3);
    if (baseId === 'equip.instrument.element_low') baseId = 'equip.instrument';
    return {baseId, element: match[2] as 'water'|'earth'|'wind'|'fire'|undefined};
}
