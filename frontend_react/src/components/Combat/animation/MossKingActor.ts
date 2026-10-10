import {Container, Graphics, GraphicsContext} from 'pixi.js';
import source from '../../../assets/combat/moss-king.svg?raw';
import type {MossKingFacing, MossKingPose} from './mossKingMotion';

const layers = ['tail', 'rear-left', 'front-right', 'body', 'rear-right', 'neck', 'mantle',
    'front-left', 'antler-left', 'antler-right', 'crown', 'crown-light', 'head', 'eyes', 'brows', 'mouth'] as const;
type Layer = typeof layers[number];
const contexts = new Map<boolean, Map<Layer, GraphicsContext>>();
function sharedArt(mirrored = false) {
    const cached = contexts.get(mirrored);
    if (cached) return cached;
    // Trusted built-in art: still and moving creatures share geometry and palette.
    const svg = new DOMParser().parseFromString(source, 'image/svg+xml');
    if (mirrored) {
        // Reflect gradient coordinates as well, keeping the main light at world upper-left.
        svg.querySelectorAll('linearGradient').forEach(gradient => {
            for (const key of ['x1', 'x2']) gradient.setAttribute(key, String(-Number(gradient.getAttribute(key))));
        });
        svg.querySelector('[stroke="#edf2d7"]')!.setAttribute('d', 'M101-129 118-124 133-114');
        svg.querySelector('[stroke="#f3f5df"]')!.setAttribute('d', 'M-30-214-27-202');
    }
    const defs = svg.querySelector('defs')!.outerHTML;
    const art = new Map(layers.map(id => [id, new GraphicsContext().svg(
        `<svg xmlns="http://www.w3.org/2000/svg" fill="none">${defs}${svg.getElementById(id)!.outerHTML}</svg>`
    )]));
    contexts.set(mirrored, art);
    return art;
}

/** Grounded boss actor. Skill effects and backdrop belong to the containing scene. */
export class MossKingActor extends Container {
    readonly monsterId = 'monster.moss_king';
    private readonly body = new Container();
    private readonly head = new Container();
    private readonly face = new Container();
    private readonly art = new Map<Layer, Graphics>();
    private readonly expressionEyes = new Graphics();
    private readonly expressionMouth = new Graphics();
    private readonly flash = new Graphics().ellipse(-61, -188, 42, 44).fill(0xffffff);
    private expression: MossKingPose['expression'] | undefined;
    private mirrored = false;

    constructor() {
        super();
        const shared = sharedArt();
        layers.forEach(id => this.art.set(id, new Graphics(shared.get(id)!)));
        this.body.addChild(...layers.slice(0, 8).map(id => this.art.get(id)!));
        this.face.addChild(this.art.get('eyes')!, this.expressionEyes, this.art.get('brows')!,
            this.art.get('mouth')!, this.expressionMouth);
        // Roots overlap the skull and sit behind it; all head attachments share its pose.
        this.head.addChild(this.art.get('antler-left')!, this.art.get('antler-right')!,
            this.art.get('crown')!, this.art.get('crown-light')!, this.art.get('head')!, this.face, this.flash);
        this.body.addChild(this.head);
        this.addChild(this.body);
        this.flash.alpha = 0;
    }

    private drawExpression(expression: MossKingPose['expression']) {
        const injured = expression === 'hurt' || expression === 'dizzy';
        this.art.get('eyes')!.visible = !injured;
        this.art.get('mouth')!.visible = !injured;
        this.expressionEyes.clear(); this.expressionMouth.clear();
        if (injured) {
            for (const x of [-67, -35]) {
                if (expression === 'dizzy') this.expressionEyes.moveTo(x - 5, -198).lineTo(x + 5, -188)
                    .moveTo(x + 5, -198).lineTo(x - 5, -188);
                else this.expressionEyes.moveTo(x - 7, -194).quadraticCurveTo(x, -188, x + 7, -194);
            }
            this.expressionEyes.stroke({color: 0x3d5f4c, width: 3.5, cap: 'round'});
            this.expressionMouth.moveTo(-85, -157).quadraticCurveTo(-70, -163, -59, -158)
                .stroke({color: 0x3d5f4c, width: 3.5, cap: 'round'});
        }
        this.expression = expression;
    }

    update(pose: MossKingPose, time: number, facing: MossKingFacing) {
        const mirrored = facing === 1;
        if (mirrored !== this.mirrored) {
            const shared = sharedArt(mirrored);
            layers.forEach(id => { this.art.get(id)!.context = shared.get(id)!; });
            this.mirrored = mirrored;
        }
        this.body.scale.x = mirrored ? -1 : 1;
        this.body.y = -pose.lift; this.body.rotation = pose.rotation;
        for (const id of ['body', 'neck', 'mantle'] as const) {
            this.art.get(id)!.y = -pose.breath * 150;
        }
        for (const side of ['left', 'right'] as const) {
            const step = side === 'left' ? pose.leftStep : pose.rightStep;
            const activeFoot = pose.heavy || side === 'left';
            const stomp = activeFoot ? pose.hoofLift : 0;
            this.art.get(`front-${side}`)!.y = pose.lift - step - stomp;
            this.art.get(`front-${side}`)!.scale.y = pose.legFold;
            this.art.get(`rear-${side}`)!.y = pose.lift - step * .6;
            this.art.get(`rear-${side}`)!.scale.y = pose.legFold;
        }
        this.head.position.set(-3 + pose.headRetreat, pose.headY);
        this.face.x = -2;
        if (this.expression !== pose.expression) this.drawExpression(pose.expression);
        const eyes = this.art.get('eyes')!;
        eyes.pivot.y = -192; eyes.y = -192; eyes.scale.y = pose.blink;
        this.flash.alpha = pose.flash;
        this.art.get('crown-light')!.alpha = pose.crownPower * (.75 + Math.sin(time * 4) * .12);
    }

    // Immutable shared art contexts survive individual actors; renderer disposal releases GPU copies.
    override destroy() { super.destroy({children: true}); }
}
