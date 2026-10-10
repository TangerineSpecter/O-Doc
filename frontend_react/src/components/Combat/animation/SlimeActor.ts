import {Container, FillGradient, Graphics} from 'pixi.js';
import type {SlimeExpression, SlimeFacing, SlimePose} from './slimeMotion';

/** Feet are at (0, 0); scene placement and combat commands belong to the caller. */
export class SlimeActor extends Container {
    // Pixi shares/pools shader bindings across renderers. Keep one immutable
    // gradient for this character; renderer disposal releases its GPU copies.
    private static bodyGradient: FillGradient | null = null;
    readonly monsterId = 'monster.slime';
    private readonly jelly = new Container();
    private readonly face = new Container();
    private readonly eyes = new Graphics();
    private readonly mouth = new Graphics();
    private readonly flashLayer = new Graphics();
    private readonly bubbles: Graphics[] = [];
    private expression: SlimeExpression | null = null;

    constructor() {
        super();
        SlimeActor.bodyGradient ??= new FillGradient({
            // The drawing has a negative Y origin at its feet; explicit coordinates
            // keep the gradient aligned to the full body rather than clamped at zero.
            textureSpace: 'global', start: {x: 0, y: -167}, end: {x: 0, y: 2},
            colorStops: [{offset: 0, color: 0xd2f9ff}, {offset: .44, color: 0x8ddfec}, {offset: 1, color: 0x48afd1}],
        });
        const body = this.outline().fill(SlimeActor.bodyGradient).stroke({color: 0x287883, width: 4});
        const gloss = new Graphics()
            .ellipse(0, -20, 87, 15).fill({color: 0x137f9e, alpha: .16})
            .moveTo(-83, -64).bezierCurveTo(-81, -99, -58, -111, -43, -116)
            .stroke({color: 0xffffff, width: 13, alpha: .78, cap: 'round'})
            .ellipse(-88, -44, 5, 8).fill({color: 0xffffff, alpha: .6})
            .moveTo(65, -99).quadraticCurveTo(92, -79, 98, -48)
            .stroke({color: 0xd0ffff, alpha: .45, width: 4, cap: 'round'});
        const cheeks = new Graphics()
            .ellipse(-48, -51, 14, 7).ellipse(48, -51, 14, 7)
            .fill({color: 0xf6ad9e, alpha: .62});
        this.flashLayer = this.outline().fill(0xffffff);
        this.flashLayer.alpha = 0;
        this.face.addChild(cheeks, this.eyes, this.mouth);
        this.jelly.addChild(body, gloss);
        for (const [x, y, radius] of [[47, -101, 7], [-62, -28, 5], [70, -34, 4]]) {
            const bubble = new Graphics().circle(0, 0, radius)
                .fill({color: 0xe8ffff, alpha: .28}).stroke({color: 0xffffff, width: 1.5, alpha: .48});
            bubble.position.set(x, y);
            this.bubbles.push(bubble);
            this.jelly.addChild(bubble);
        }
        this.jelly.addChild(this.face, this.flashLayer);
        this.addChild(this.jelly);
    }

    private outline() {
        return new Graphics().moveTo(-112, -29)
            .bezierCurveTo(-111, -82, -75, -119, -28, -136)
            .quadraticCurveTo(-13, -142, -5, -167)
            .quadraticCurveTo(4, -144, 23, -136)
            .bezierCurveTo(77, -115, 107, -80, 113, -29)
            .bezierCurveTo(120, -4, 77, 2, 0, 2)
            .bezierCurveTo(-76, 2, -120, -3, -112, -29).closePath();
    }

    private drawExpression(expression: SlimeExpression) {
        this.eyes.clear();
        this.mouth.clear();
        const ink = 0x204c59;
        if (expression === 'hurt' || expression === 'dizzy') {
            for (const x of [-31, 31]) {
                if (expression === 'dizzy') {
                    this.eyes.moveTo(x - 6, -72).lineTo(x + 6, -60)
                        .moveTo(x + 6, -72).lineTo(x - 6, -60);
                } else {
                    const direction = x < 0 ? 1 : -1;
                    this.eyes.moveTo(x - direction * 5, -73).lineTo(x + direction * 5, -66)
                        .lineTo(x - direction * 5, -59);
                }
            }
            this.eyes.stroke({color: ink, width: 4, cap: 'round', join: 'round'});
            this.mouth.ellipse(0, -48, 5, expression === 'dizzy' ? 3 : 7).fill(ink);
        } else {
            this.eyes.ellipse(-31, -67, 7, 11).ellipse(31, -67, 7, 11).fill(ink)
                .circle(-33, -71, 2.3).circle(29, -71, 2.3).fill(0xffffff);
            if (expression === 'determined') {
                this.eyes.moveTo(-42, -86).lineTo(-25, -80).moveTo(42, -86).lineTo(25, -80)
                    .stroke({color: ink, width: 4, cap: 'round'});
            }
            this.mouth.moveTo(-10, -46).quadraticCurveTo(0, -35, 10, -46)
                .stroke({color: ink, width: 3.5, cap: 'round'});
        }
        this.expression = expression;
    }

    update(pose: SlimePose, time: number, facing: SlimeFacing) {
        this.jelly.scale.set(pose.scaleX, pose.scaleY);
        this.jelly.rotation = pose.rotation;
        this.jelly.y = -pose.lift;
        this.face.x = facing * 7;
        if (pose.expression !== this.expression) this.drawExpression(pose.expression);
        // Blink around the eyes' own centre, without displacing the face.
        this.eyes.pivot.y = -67;
        this.eyes.y = -67;
        this.eyes.scale.y = pose.blink;
        this.flashLayer.alpha = pose.flash;
        this.bubbles.forEach((bubble, i) => {
            bubble.y = [-101, -28, -34][i] + Math.sin(time * 2 + i * 2) * 4;
        });
    }

    override destroy() {
        super.destroy({children: true});
    }
}
