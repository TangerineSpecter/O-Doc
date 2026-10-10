import {Container, Sprite, Texture} from 'pixi.js';
import {drawPlayerGuard} from './playerGuardVisual';
import {drawPlayerBurn} from './playerBurnVisual';
import {drawPlayerBurst} from './playerBurstVisual';
import type {PlayerDemoSkill, PlayerSkillAnchors} from './playerRouteEffects';

const pixel = 3;
const origin = {x: -450, y: -300};

/** Each surface is genuinely low resolution; curves become moving pixel silhouettes. */
class PixelEffectSurface extends Container {
    private readonly canvas = document.createElement('canvas');
    readonly context: CanvasRenderingContext2D;
    private readonly texture: Texture;

    constructor() {
        super();
        this.canvas.width = 300; this.canvas.height = 140;
        this.context = this.canvas.getContext('2d')!;
        this.context.imageSmoothingEnabled = false;
        this.texture = Texture.from(this.canvas);
        this.texture.source.scaleMode = 'nearest';
        const sprite = new Sprite(this.texture);
        sprite.position.set(origin.x, origin.y);
        sprite.scale.set(pixel);
        this.addChild(sprite);
        this.visible = false;
    }

    reset() {
        this.context.setTransform(1, 0, 0, 1, 0, 0);
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.context.setTransform(1 / pixel, 0, 0, 1 / pixel, -origin.x / pixel, -origin.y / pixel);
    }

    upload() { this.texture.source.update(); this.visible = true; }

    override destroy() {
        if (this.destroyed) return;
        super.destroy({children: true});
        this.texture.destroy(true);
        this.canvas.width = 0; this.canvas.height = 0;
    }
}

/** Scene inserts each owned layer on the correct side of the actors. No extra renderer. */
export class PlayerSkillRenderer {
    readonly ground = new PixelEffectSurface();
    readonly rear = new PixelEffectSurface();
    readonly front = new PixelEffectSurface();
    private lastFrame = '';

    draw(skill: PlayerDemoSkill, time: number, anchors: PlayerSkillAnchors, scale: number) {
        if (skill === 'skill.player.004') { this.clear(); return; }
        // Quantize VFX time; live emitter transforms still invalidate the cached surface.
        const frame = Math.floor(time * 30);
        const key = [skill, frame, scale, anchors.sourceX, anchors.targetX,
            anchors.emitterX.toFixed(1), anchors.emitterY.toFixed(1)].join(':');
        if (key === this.lastFrame) return;
        this.lastFrame = key;
        const surfaces = [this.ground, this.rear, this.front];
        surfaces.forEach(surface => { surface.scale.set(scale); surface.reset(); });
        const args = [this.ground.context, this.rear.context, this.front.context, frame / 30, anchors] as const;
        if (skill === 'skill.player.005') drawPlayerGuard(...args);
        else if (skill === 'skill.player.017') drawPlayerBurn(...args);
        else drawPlayerBurst(...args);
        surfaces.forEach(surface => surface.upload());
    }

    clear() {
        this.ground.visible = false; this.rear.visible = false; this.front.visible = false;
        this.lastFrame = '';
    }

    dispose() { this.ground.destroy(); this.rear.destroy(); this.front.destroy(); }
}
