export interface PlayerWeaponRegistration {
    grip: {x: number; y: number};
    height: number;
    rotation: number;
    mirrored: boolean;
}

/** Grips refer to opaque handle pixels in each item's own texture frame. */
export function getPlayerWeaponRegistration(id: string, width: number, height: number): PlayerWeaponRegistration {
    if (id === 'equip.mage_staff') {
        return {grip: {x: 11, y: 48}, height: 420, rotation: -.02, mirrored: false};
    }
    if (id === 'equip.staff') {
        return {grip: {x: 54, y: 169}, height: 420, rotation: -.02, mirrored: false};
    }
    if (id === 'equip.bow') {
        // Green wrap, at the middle of the bow. String is on the actor side.
        return {grip: {x: 42, y: 288}, height: 310, rotation: .75, mirrored: true};
    }
    return {grip: {x: width*.27, y: height*.77}, height: id === 'equip.dagger'?240:420, rotation: 0, mirrored: false};
}
