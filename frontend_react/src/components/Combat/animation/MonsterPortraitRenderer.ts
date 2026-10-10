import {Application, Graphics} from 'pixi.js';
import {SlimeActor} from './SlimeActor';
import {sampleSlimePose} from './slimeMotion';
import {CaveBatActor} from './CaveBatActor';
import {sampleCaveBatPose} from './caveBatMotion';

export type AnimatedMonsterId = 'monster.slime' | 'monster.cave_bat';

/** Transparent actor; habitat framing shares the preview's camera and scale. */
export class MonsterPortraitRenderer {
    private readonly app = new Application();
    private actor: SlimeActor | CaveBatActor | null = null;
    private shadow: Graphics | null = null;
    private readonly resizeObserver = new ResizeObserver(() => this.resize());
    private readonly visibilityObserver = new IntersectionObserver(entries => {
        this.visible = entries.some(entry => entry.isIntersecting);
        this.syncPlayback();
    });
    private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    private visible = false;
    private initialized = false;
    private disposed = false;
    private time = 0;

    constructor(private readonly host: HTMLElement, private readonly inHabitat: boolean,
                private readonly monsterId: AnimatedMonsterId) {}

    async init() {
        await this.app.init({
            width: Math.max(1, this.host.clientWidth), height: Math.max(1, this.host.clientHeight),
            antialias: true, backgroundAlpha: 0, autoDensity: true,
            resolution: Math.min(devicePixelRatio || 1, 2), preference: 'webgl', autoStart: false,
        });
        this.initialized = true;
        if (this.disposed) { this.app.destroy(true, {children: true}); return; }
        const bat = this.monsterId === 'monster.cave_bat';
        this.actor = bat ? new CaveBatActor() : new SlimeActor();
        this.shadow = new Graphics().ellipse(0, 8, bat ? 88 : 107, bat ? 12 : 19).fill({color: 0x356663, alpha: .16});
        this.app.stage.addChild(this.shadow, this.actor);
        this.app.canvas.setAttribute('aria-hidden', 'true');
        this.app.canvas.style.cssText = 'display:block;width:100%;height:100%;pointer-events:none';
        this.host.appendChild(this.app.canvas);
        this.app.ticker.add(ticker => {
            this.time += Math.min(ticker.deltaMS / 1000, .05);
            this.drawIdle();
        });
        this.resizeObserver.observe(this.host);
        this.visibilityObserver.observe(this.host);
        document.addEventListener('visibilitychange', this.syncPlayback);
        this.reducedMotion.addEventListener('change', this.onMotionChange);
        this.resize();
    }

    private resize() {
        if (!this.actor || this.disposed) return;
        const width = this.host.clientWidth, height = this.host.clientHeight;
        if (!width || !height) return;
        this.app.renderer.resize(width, height);
        const bat = this.monsterId === 'monster.cave_bat';
        this.actor.position.set(width / 2, height * (this.inHabitat ? .74 : bat ? 250 / 280 : .86));
        this.actor.scale.set(this.inHabitat
            ? Math.min(width / 640, height / 420) * (bat ? 1.05 : 1.15)
            : bat ? Math.min(width / 380, height / 280) : Math.min(width / 256, height / 224) * .94);
        this.shadow?.position.copyFrom(this.actor.position);
        this.shadow?.scale.copyFrom(this.actor.scale);
        this.drawIdle();
        this.app.render();
    }

    private drawIdle() {
        if (this.actor instanceof CaveBatActor) {
            const pose = sampleCaveBatPose('idle', this.time, 1);
            this.actor.update(pose, this.time, 1);
            this.shadow?.scale.set(this.actor.scale.x * (1 - pose.lift / 260), this.actor.scale.y);
            if (this.shadow) this.shadow.alpha = 1 - pose.lift / 180;
        } else this.actor?.update(sampleSlimePose('idle', this.time, 1), this.time, 1);
    }

    private syncPlayback = () => {
        if (!this.initialized || this.disposed) return;
        if (document.hidden || !this.visible || this.reducedMotion.matches) this.app.stop();
        else this.app.start();
    };

    private onMotionChange = () => {
        if (this.reducedMotion.matches) { this.time = 0; this.resize(); }
        this.syncPlayback();
    };

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.resizeObserver.disconnect();
        this.visibilityObserver.disconnect();
        document.removeEventListener('visibilitychange', this.syncPlayback);
        this.reducedMotion.removeEventListener('change', this.onMotionChange);
        if (this.initialized) {
            this.app.destroy(true, {children: true});
            this.actor = null;
        }
    }
}
