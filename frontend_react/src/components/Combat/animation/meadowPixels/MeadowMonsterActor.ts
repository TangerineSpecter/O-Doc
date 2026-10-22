import {Container, Sprite, Texture} from 'pixi.js';
import {createMeadowSpriteRenderer} from './meadowSprites';
import {sampleMeadowPose, meadowShatterAt, meadowDurations} from './meadowMotion';
import {MeadowShatter} from './MeadowShatter';
import {drawMeadowBody} from './meadowBodyDrawing';
import type {MeadowProfile, MeadowMotion, MeadowPose} from './meadowTypes';

/** Approved 128px artwork, per-part animation and template defeat; feet stay at (0, 0). */
export class MeadowMonsterActor extends Container {
    private readonly pixels = createMeadowSpriteRenderer();
    private readonly canvas = Object.assign(document.createElement('canvas'), {width: 192, height: 224});
    private readonly context = this.canvas.getContext('2d')!;
    private readonly texture = Texture.from(this.canvas);
    private readonly body = new Sprite(this.texture);
    private readonly shatter = new MeadowShatter();
    private shattered = false;
    private previousDefeat?: number;
    private defeatAmbient = 0;

    constructor(readonly profile: MeadowProfile) {
        super();
        this.texture.source.scaleMode = 'nearest';
        this.body.anchor.set(.5, 204 / 224);
        this.scale.set(185 / 116);
        this.addChild(this.body, this.shatter);
        this.sample('idle', 0, 0, undefined);
    }
    sample(action: MeadowMotion, elapsed: number, ambient: number, defeatAge: number | undefined) {
        if (defeatAge === undefined || (this.previousDefeat !== undefined && defeatAge < this.previousDefeat)) {
            if (this.shattered) this.shatter.reset();
            this.shattered = false;
        }
        if (defeatAge !== undefined && (this.previousDefeat === undefined || defeatAge < this.previousDefeat)) this.defeatAmbient = ambient - defeatAge;
        this.previousDefeat = defeatAge;
        const state = defeatAge !== undefined ? 'defeat' : elapsed >= meadowDurations[action] ? 'idle' : action;
        const pose = sampleMeadowPose(this.profile.key, state, defeatAge ?? elapsed, ambient, -1);
        // The scene owns approach/recoil distance; the actor owns hop, squash, ears and wings.
        if (state !== 'defeat') pose.x = 0;
        if (defeatAge !== undefined && defeatAge >= meadowShatterAt) {
            this.body.visible = false;
            if (!this.shattered) {
                const sprite = this.pixels.drawSprite(this.profile.key, {...pose, flash: false, fracture: 0}, this.defeatAmbient + meadowShatterAt, {dither: false});
                this.shatter.start(sprite.getContext('2d')!.getImageData(0, 0, 128, 128), pose.y, this.profile.colors);
                this.shattered = true;
            }
            this.shatter.sample(defeatAge - meadowShatterAt);
            return;
        }
        this.body.visible = true;
        this.drawBody(pose, ambient);
    }
    private drawBody(pose: MeadowPose, time: number) {
        const image = this.pixels.drawSprite(this.profile.key, pose, time, {dither: false});
        this.context.clearRect(0, 0, 192, 224);
        drawMeadowBody(this.context, image, this.profile.key, pose, 96, 204);
        this.texture.source.update();
    }
    get shake() { return this.shattered ? this.shatter.shake : 0; }
    override destroy() {
        if (this.destroyed) return;
        super.destroy({children: true}); this.texture.destroy(true);
    }
}
