import {Rectangle, Texture} from 'pixi.js';
import {playerSheetColumns, playerJobDetails, crystalStaffRegion} from '../art/playerVisuals';
import type {PlayerJob} from '../art/playerVisuals';
export {playerSheetUrl, playerJobs, playerJobDetails} from '../art/playerVisuals';
export type {PlayerJob} from '../art/playerVisuals';
export type PreviewWeapon = 'none' | 'demo.crystal_staff';

// Exact regions in the approved 1774 × 887 sheet. The lower staff is a separate item.
export function createPlayerParts(sheet: Texture, job: PlayerJob) {
    const x = playerSheetColumns[playerJobDetails[job].index];
    const crop = (dx: number, y: number, width: number, height: number) =>
        new Texture({source: sheet.source, frame: new Rectangle(x + dx, y, width, height)});
    return {
        head: crop(0, 95, 374, 324),
        // Keep cape and robe hem intact. Only cuff / forearm / hand can pivot.
        body: crop(0, 415, 374, 180),
        leftArm: crop(72, 477, 66, 58),
        rightArm: crop(270, 477, 66, 58),
        leftFoot: crop(104, 595, 91, 28),
        rightFoot: crop(195, 595, 96, 28),
    };
}

// In sheet-column coordinates, with a stepped seam under the static upper sleeve.
export const playerForearmContours = {
    left: [72, 477, 138, 477, 138, 490, 127, 490, 127, 530, 72, 530],
    right: [270, 477, 336, 477, 336, 530, 279, 530, 279, 490, 270, 490],
};

export function createDemoWeapon(sheet: Texture) {
    return new Texture({source: sheet.source, frame: new Rectangle(crystalStaffRegion.x, crystalStaffRegion.y, crystalStaffRegion.width, crystalStaffRegion.height)});
}

/** Anchors belong to the item art, not to a profession. Coordinates are texture-local. */
export const demoWeaponAnchors = {grip: {x: 64, y: 169}, emitter: {x: 137, y: 47}};
