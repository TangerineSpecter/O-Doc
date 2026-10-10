import {Container, FillGradient, Graphics} from 'pixi.js';
import type {CaveBatFacing, CaveBatPose} from './caveBatMotion';

const ink = 0x575578;
const wingInk = 0x645c85;

/** Wing pivots and face are independent; the scene owns flight path and shadow. */
export class CaveBatActor extends Container {
    readonly monsterId = 'monster.cave_bat';
    private static fur: FillGradient | null = null;
    private static membrane: FillGradient | null = null;
    private readonly body = new Container();
    private readonly wings: Container[] = [];
    private readonly face = new Container();
    private readonly eyes = new Graphics();
    private readonly mouth = new Graphics();
    private readonly flash = new Graphics();
    private expression: CaveBatPose['expression'] | null = null;

    constructor() {
        super();
        // Shared immutable gradients survive individual actors; renderer disposal owns GPU copies.
        CaveBatActor.fur ??= new FillGradient({textureSpace: 'global', start: {x: 0, y: -166}, end: {x: 0, y: -28},
            colorStops: [{offset: 0, color: 0xdcdff5}, {offset: .48, color: 0xaeb3db}, {offset: 1, color: 0x858dbb}]});
        CaveBatActor.membrane ??= new FillGradient({textureSpace: 'global', start: {x: 0, y: -80}, end: {x: 0, y: 18},
            colorStops: [{offset: 0, color: 0xd9cbea}, {offset: .5, color: 0xb6a6d4}, {offset: 1, color: 0x9b8cbe}]});
        for (const side of [-1, 1]) {
            const wing = new Container();
            const web = new Graphics().moveTo(0, 3).quadraticCurveTo(28, -39, 83, -65)
                .quadraticCurveTo(107, -78, 135, -79).quadraticCurveTo(125, -49, 136, -19)
                .quadraticCurveTo(109, -36, 94, -20).quadraticCurveTo(77, -28, 63, -3)
                .quadraticCurveTo(44, -13, 28, 14).quadraticCurveTo(12, 17, 0, 3).closePath()
                .fill(CaveBatActor.membrane).stroke({color: wingInk, width: 3.5, join: 'round'});
            const ribs = new Graphics().moveTo(4, 1).quadraticCurveTo(47, -29, 94, -20)
                .moveTo(4, 1).quadraticCurveTo(31, -18, 63, -3)
                .moveTo(4, 1).quadraticCurveTo(11, -4, 28, 14)
                .stroke({color: wingInk, width: 1.8, alpha: .42, cap: 'round'});
            wing.addChild(web, ribs);
            if (side === -1) wing.addChild(new Graphics().moveTo(43, -43).quadraticCurveTo(84, -70, 115, -70)
                .stroke({color: 0xffffff, alpha: .48, width: 4, cap: 'round'}));
            wing.position.set(side * 28, -104);
            this.wings.push(wing);
            this.body.addChild(wing);
        }
        const feet = new Graphics().moveTo(-16, -34).quadraticCurveTo(-22, -18, -29, -25)
            .moveTo(-11, -33).quadraticCurveTo(-14, -18, -20, -23)
            .moveTo(16, -34).quadraticCurveTo(22, -18, 29, -25)
            .moveTo(11, -33).quadraticCurveTo(14, -18, 20, -23)
            .stroke({color: ink, width: 4, cap: 'round'});
        const ears = new Graphics().moveTo(-37, -143).quadraticCurveTo(-61, -202, -42, -196)
            .quadraticCurveTo(-21, -189, -17, -149).closePath()
            .moveTo(37, -143).quadraticCurveTo(61, -202, 42, -196)
            .quadraticCurveTo(21, -189, 17, -149).closePath()
            .fill(CaveBatActor.fur).stroke({color: ink, width: 3.5, join: 'round'});
        const innerEars = new Graphics().moveTo(-35, -155).quadraticCurveTo(-48, -186, -41, -183)
            .quadraticCurveTo(-30, -177, -27, -153).closePath()
            .moveTo(35, -155).quadraticCurveTo(48, -186, 41, -183)
            .quadraticCurveTo(30, -177, 27, -153).closePath().fill(0xd3aac7);
        const torso = new Graphics().ellipse(0, -73, 33, 45)
            .fill(CaveBatActor.fur).stroke({color: ink, width: 3.5});
        const head = new Graphics().ellipse(0, -121, 49, 43)
            .fill(CaveBatActor.fur).stroke({color: ink, width: 3.5});
        const belly = new Graphics().ellipse(0, -66, 20, 26).fill({color: 0xe5e4f4, alpha: .64});
        const gloss = new Graphics().moveTo(-33, -128).quadraticCurveTo(-33, -145, -20, -149)
            .stroke({color: 0xffffff, width: 6, alpha: .64, cap: 'round'})
            .ellipse(-34, -113, 3, 5).fill({color: 0xffffff, alpha: .36});
        const cheeks = new Graphics().ellipse(-31, -112, 9, 4).ellipse(31, -112, 9, 4).fill({color: 0xecb7c0, alpha: .7});
        this.face.addChild(cheeks, this.eyes, this.mouth);
        this.flash.ellipse(0, -73, 33, 45).ellipse(0, -121, 49, 43).fill(0xffffff);
        this.flash.alpha = 0;
        this.body.addChild(feet, torso, belly, ears, innerEars, head, gloss, this.face, this.flash);
        this.addChild(this.body);
    }

    private drawFace(expression: CaveBatPose['expression']) {
        this.eyes.clear(); this.mouth.clear();
        const faceInk = 0x34384f;
        if (expression === 'hurt' || expression === 'dizzy') {
            for (const x of [-20, 20]) {
                if (expression === 'dizzy') this.eyes.moveTo(x - 4, -133).lineTo(x + 4, -123)
                    .moveTo(x + 4, -133).lineTo(x - 4, -123);
                else this.eyes.moveTo(x - 5, -130).quadraticCurveTo(x, -124, x + 5, -130);
            }
            this.eyes.stroke({color: faceInk, width: 3, cap: 'round'});
            this.mouth.ellipse(0, -110, 4, 3).fill(faceInk);
        } else {
            this.eyes.ellipse(-20, -128, 6, 9).ellipse(20, -128, 6, 9).fill(faceInk)
                .circle(-22, -131, 2).circle(18, -131, 2).fill(0xffffff);
            if (expression === 'determined') this.eyes.moveTo(-28, -143).lineTo(-16, -140)
                .moveTo(28, -143).lineTo(16, -140).stroke({color: faceInk, width: 2.5, cap: 'round'});
            this.mouth.moveTo(-9, -111).quadraticCurveTo(0, -103, 9, -111)
                .stroke({color: faceInk, width: 2.5, cap: 'round'})
                .poly([-6, -109, -2, -108, -4, -103]).poly([2, -108, 6, -109, 4, -103]).fill(0xfffbec);
        }
        this.expression = expression;
    }

    update(pose: CaveBatPose, _time: number, facing: CaveBatFacing) {
        this.body.position.set(0, -pose.lift);
        this.body.scale.set(pose.scaleX, pose.scaleY);
        this.body.rotation = pose.rotation;
        this.wings.forEach((wing, i) => {
            const side = i === 0 ? -1 : 1;
            wing.scale.set(side * pose.wingSpread, .85 + pose.wingLift);
            wing.rotation = side * pose.wingLift;
        });
        this.face.x = facing * 4;
        if (this.expression !== pose.expression) this.drawFace(pose.expression);
        this.eyes.pivot.y = -128; this.eyes.y = -128; this.eyes.scale.y = pose.blink;
        this.flash.alpha = pose.flash;
    }

    override destroy() { super.destroy({children: true}); }
}
