export interface PlayerWeaponRegistration {
    grip: {x: number; y: number};
    height: number;
    rotation: number;
    mirrored: boolean;
}

/** Grips refer to opaque handle pixels in each item's own texture frame. */
export function getPlayerWeaponRegistration(id: string, width: number, height: number): PlayerWeaponRegistration {
    if (id === 'equip.instrument' || id.startsWith('equip.instrument.')) {
        return {grip: {x: 35, y: 30}, height: 240, rotation: -.08, mirrored: false};
    }
    if (id === 'equip.mage_staff') {
        return {grip: {x: 16, y: 48}, height: 420, rotation: -.02, mirrored: false};
    }
    if (id.startsWith('equip.mage_staff.')) {
        return {grip: {x: 24, y: 36}, height: 340, rotation: .38, mirrored: false};
    }
    if (id === 'equip.staff') {
        return {grip: {x: 54, y: 169}, height: 420, rotation: -.02, mirrored: false};
    }
    if (id.startsWith('equip.staff.')) {
        return {grip: {x: 13, y: 34}, height: 410, rotation: -.02, mirrored: false};
    }
    if (id.startsWith('equip.holy_staff.')) {
        return {grip: {x: 13, y: 34}, height: 390, rotation: 0, mirrored: false};
    }
    if (id === 'equip.bow') {
        // Green wrap, at the middle of the bow. String is on the actor side.
        return {grip: {x: 42, y: 288}, height: 310, rotation: .75, mirrored: true};
    }
    if (id.startsWith('equip.bow.')) {
        return {grip: {x: 14, y: 24}, height: 310, rotation: .72, mirrored: true};
    }
    if (id === 'equip.training_sword') {
        return {grip: {x: 12, y: 34}, height: 340, rotation: 0, mirrored: false};
    }
    if (id === 'equip.two_handed_sword') {
        return {grip: {x: 13, y: 35}, height: 430, rotation: 0, mirrored: false};
    }
    if (id.startsWith('equip.sword.')) {
        return {grip: {x: 12, y: 35}, height: 390, rotation: 0, mirrored: false};
    }
    if (id.startsWith('equip.axe.')) {
        return {grip: {x: 13, y: 34}, height: 380, rotation: 0, mirrored: false};
    }
    if (id.startsWith('equip.dagger.')) {
        return {grip: {x: 14, y: 33}, height: 250, rotation: 0, mirrored: false};
    }
    return {grip: {x: width*.27, y: height*.77}, height: id === 'equip.dagger'?240:420, rotation: 0, mirrored: false};
}
