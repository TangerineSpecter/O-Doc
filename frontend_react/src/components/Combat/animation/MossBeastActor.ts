import {Container, Graphics, GraphicsContext} from 'pixi.js';
import mossBeastSource from '../../../assets/combat/moss-beast.svg?raw';
import type {MossBeastFacing, MossBeastPose} from './mossBeastMotion';

const layers = ['rear-left', 'rear-right', 'shell', 'crystals', 'moss', 'shoulder-left', 'shoulder-right',
    'front-left', 'front-right', 'head', 'eyes', 'brows', 'muzzle', 'mouth'] as const;
type Layer = typeof layers[number];
let contexts: Map<Layer, GraphicsContext> | undefined;

function sharedArt() {
    if (contexts) return contexts;
    // Trusted built-in SVG is the single geometry/palette source for both still and moving art.
    const svg = new DOMParser().parseFromString(mossBeastSource, 'image/svg+xml');
    const defs = svg.querySelector('defs')!.outerHTML;
    contexts = new Map(layers.map(id => [id, new GraphicsContext().svg(
        `<svg xmlns="http://www.w3.org/2000/svg" fill="none">${defs}${svg.getElementById(id)!.outerHTML}</svg>`
    )]));
    return contexts;
}

/** Broad quadruped with rigid armour; scenery and skill effects belong to the scene. */
export class MossBeastActor extends Container {
    readonly monsterId = 'monster.moss_beast';
    private readonly body = new Container();
    private readonly head = new Container();
    private readonly face = new Container();
    private readonly art = new Map<Layer, Graphics>();
    private readonly expressionEyes = new Graphics();
    private readonly expressionMouth = new Graphics();
    private readonly rune = new Graphics().poly([0, -171, 9, -163, 0, -153, -9, -163])
        .fill({color: 0xe3f4b3});
    private readonly flash = new Graphics().ellipse(0, -112, 78, 65).fill(0xffffff);
    private expression: MossBeastPose['expression'] | undefined;

    constructor() {
        super();
        const shared = sharedArt();
        layers.forEach(id => this.art.set(id, new Graphics(shared.get(id)!)));
        this.body.addChild(...layers.slice(0, 9).map(id => this.art.get(id)!));
        this.face.addChild(this.art.get('eyes')!, this.expressionEyes, this.art.get('brows')!,
            this.art.get('muzzle')!, this.art.get('mouth')!, this.expressionMouth);
        this.head.addChild(this.art.get('head')!, this.rune, this.face, this.flash);
        this.body.addChild(this.head);
        this.addChild(this.body);
        this.rune.alpha = 0; this.flash.alpha = 0;
    }

    private drawExpression(expression: MossBeastPose['expression']) {
        const injured = expression === 'hurt' || expression === 'dizzy';
        this.art.get('eyes')!.visible = !injured;
        this.art.get('mouth')!.visible = !injured;
        this.expressionEyes.clear(); this.expressionMouth.clear();
        if (injured) {
            for (const x of [-31, 31]) {
                if (expression === 'dizzy') this.expressionEyes.moveTo(x - 6, -137).lineTo(x + 6, -125)
                    .moveTo(x + 6, -137).lineTo(x - 6, -125);
                else this.expressionEyes.moveTo(x - 7, -134).quadraticCurveTo(x, -127, x + 7, -134);
            }
            this.expressionEyes.stroke({color: 0x405548, width: 4, cap: 'round'});
            this.expressionMouth.moveTo(-13, -84).quadraticCurveTo(0, -92, 13, -84)
                .stroke({color: 0x405548, width: 3.5, cap: 'round'});
        } else if (expression === 'attack') this.expressionMouth.ellipse(0, -83, 12, 5).fill(0x405548);
        this.expression = expression;
    }

    update(pose: MossBeastPose, time: number, facing: MossBeastFacing) {
        this.body.y = -pose.lift;
        this.body.rotation = pose.rotation;
        this.art.get('shell')!.scale.y = 1 + pose.breath;
        this.art.get('moss')!.y = -pose.breath * 180;
        this.art.get('crystals')!.y = -pose.breath * 180;
        for (const side of ['left', 'right'] as const) {
            const step = side === 'left' ? pose.leftStep : pose.rightStep;
            this.art.get(`front-${side}`)!.y = pose.lift - step;
            this.art.get(`front-${side}`)!.scale.y = pose.legFold;
            this.art.get(`rear-${side}`)!.y = pose.lift - (side === 'left' ? pose.rightStep : pose.leftStep) * .65;
            this.art.get(`rear-${side}`)!.scale.y = pose.legFold;
            this.art.get(`shoulder-${side}`)!.x = (side === 'left' ? 1 : -1) * pose.armorClose;
        }
        this.head.position.set(facing * 3, pose.headY);
        this.face.x = facing * 2;
        if (this.expression !== pose.expression) this.drawExpression(pose.expression);
        const eyes = this.art.get('eyes')!;
        eyes.pivot.y = -131; eyes.y = -131; eyes.scale.y = pose.blink;
        this.flash.alpha = pose.flash;
        this.rune.alpha = pose.guard * (.6 + Math.sin(time * 4) * .15);
    }

    // Shared SVG GraphicsContexts survive individual creatures, just like the existing gradients.
    override destroy() { super.destroy({children: true}); }
}
