import {Application, Assets, Container, Graphics} from 'pixi.js';
import type {Texture} from 'pixi.js';
import mossCaveImage from '../../../assets/combat/moss-cave.svg';
import {SlimeActor} from './SlimeActor';
import {sampleSlimePose, slimeDurations} from './slimeMotion';
import type {SlimeAction, SlimeFacing} from './slimeMotion';
import {createSlimeStage} from './slimeStage';
import type {SlimeBackdrop} from './slimeStage';

export class SlimePreviewScene {
    private readonly app = new Application();
    private readonly world = new Container();
    private readonly actor = new SlimeActor();
    private readonly shadow = new Graphics().ellipse(0, 0, 107, 19).fill({color: 0x356663, alpha: .16});
    private readonly effect = new Graphics();
    private readonly motes = new Graphics();
    private stage = createSlimeStage('cave');
    private caveTexture: Texture | undefined;
    private readonly observer: ResizeObserver;
    private initialized = false;
    private disposed = false;
    private action: SlimeAction = 'idle';
    private facing: SlimeFacing = 1;
    private time = 0;
    private ambientTime = 0;
    private actorScale = 1.15;
    private paused = matchMedia('(prefers-reduced-motion: reduce)').matches;

    constructor(private readonly host: HTMLElement, private readonly onComplete: (action: SlimeAction) => void) {
        this.observer = new ResizeObserver(this.resize);
    }

    async init() {
        await this.app.init({
            width: this.host.clientWidth, height: this.host.clientHeight,
            antialias: true, backgroundAlpha: 0, resolution: Math.min(devicePixelRatio || 1, 2),
            autoDensity: true, preference: 'webgl',
        });
        this.initialized = true;
        if (this.disposed) { this.app.destroy(true, {children: true}); return; }
        this.world.addChild(this.stage, this.motes, this.shadow, this.effect, this.actor);
        this.app.stage.addChild(this.world);
        this.caveTexture = await Assets.load<Texture>({src: mossCaveImage, data: {resolution: 2}});
        if (this.disposed) return;
        this.stage.destroy({children: true});
        this.stage = createSlimeStage('cave', this.caveTexture);
        this.world.addChildAt(this.stage, 0);
        this.app.canvas.setAttribute('aria-label', '软泥怪动画预览，使用下方按钮切换动作');
        this.host.appendChild(this.app.canvas);
        this.observer.observe(this.host);
        this.resize();
        this.app.ticker.add(ticker => {
            const delta = Math.min(ticker.deltaMS / 1000, .05);
            this.time += delta;
            this.ambientTime += delta;
            if (this.action !== 'defeat' && this.time >= slimeDurations[this.action]) {
                this.action = 'idle';
                this.time = 0;
                this.onComplete(this.action);
            }
            this.draw();
        });
        document.addEventListener('visibilitychange', this.syncPlayback);
        this.syncPlayback();
    }

    get isPaused() { return this.paused; }

    play(action: SlimeAction) {
        this.action = action;
        this.time = 0;
        this.draw();
        this.app.render();
    }

    setFacing(facing: SlimeFacing) { this.facing = facing; this.draw(); this.app.render(); }

    setSmall(small: boolean) {
        this.actorScale = small ? .56 : 1.15;
        this.draw();
        this.app.render();
    }

    setBackdrop(backdrop: SlimeBackdrop) {
        this.stage.destroy({children: true});
        this.stage = createSlimeStage(backdrop, this.caveTexture);
        this.world.addChildAt(this.stage, 0);
        this.app.render();
    }

    togglePaused() {
        this.paused = !this.paused;
        this.syncPlayback();
        return this.paused;
    }

    private syncPlayback = () => {
        if (!this.initialized || this.disposed) return;
        if (this.paused || document.hidden) this.app.stop();
        else this.app.start();
    };

    private resize = () => {
        if (!this.initialized || this.disposed) return;
        const width = this.host.clientWidth, height = this.host.clientHeight;
        if (!width || !height) return;
        this.app.renderer.resize(width, height);
        this.world.position.set(width / 2, height * .74);
        this.world.scale.set(Math.min(width / 640, height / 420));
        this.draw();
        this.app.render();
    };

    private draw() {
        const pose = sampleSlimePose(this.action, this.time, this.facing);
        this.actor.position.set(pose.x * this.actorScale, 0);
        this.actor.scale.set(this.actorScale);
        this.actor.update(pose, this.time, this.facing);
        this.shadow.x = this.actor.x;
        this.shadow.y = 8;
        this.shadow.scale.set(this.actorScale * pose.scaleX * (1 - pose.lift / 330), this.actorScale);
        this.shadow.alpha = 1 - pose.lift / 180;
        this.drawEffects(pose.impact, pose.x);
        this.motes.clear();
        for (let i = 0; i < 7; i++) {
            const t = this.ambientTime * .35 + i * 1.8;
            this.motes.circle(Math.sin(t) * 255, -120 - ((this.ambientTime * 13 + i * 47) % 205), 1.5 + i % 2)
                .fill({color: 0xffffff, alpha: .35 + Math.sin(t * 2) * .2});
        }
    }

    private drawEffects(impact: number, x: number) {
        this.effect.clear();
        if (impact <= 0) return;
        const spread = 1 - impact;
        const size = this.actorScale;
        this.effect.ellipse(x * size, 8, (110 + spread * 80) * size, (18 + spread * 12) * size)
            .stroke({color: 0x8dbeb5, width: 3, alpha: impact * .55});
        for (let i = 0; i < 6; i++) {
            const side = i < 3 ? -1 : 1;
            const px = (x + side * (100 + spread * (50 + i % 3 * 22))) * size;
            const py = (-15 - Math.sin(spread * Math.PI) * (25 + i % 3 * 22)) * size;
            this.effect.ellipse(px, py, 4 * size, 7 * size).fill({color: 0x82d1d3, alpha: impact * .8});
        }
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.observer.disconnect();
        document.removeEventListener('visibilitychange', this.syncPlayback);
        if (this.initialized) {
            this.app.destroy(true, {children: true});
        }
        else {
            // init may still be awaiting the renderer; its completion releases app.
            this.actor.destroy();
            this.stage.destroy({children: true});
            this.shadow.destroy();
            this.effect.destroy();
            this.motes.destroy();
            this.world.destroy();
        }
    }
}
