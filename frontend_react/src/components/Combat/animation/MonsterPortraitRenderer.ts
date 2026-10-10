import {Application, Graphics} from 'pixi.js';
import {SlimeActor} from './SlimeActor';
import {sampleSlimePose} from './slimeMotion';
import {CaveBatActor} from './CaveBatActor';
import {sampleCaveBatPose} from './caveBatMotion';
import {MossBeastActor} from './MossBeastActor';
import {sampleMossBeastPose} from './mossBeastMotion';

export type AnimatedMonsterId = 'monster.slime' | 'monster.cave_bat' | 'monster.moss_beast';

const frames: Record<AnimatedMonsterId, {
    width: number; height: number; ground: number; plainScale: number; habitatScale: number;
    shadowX: number; shadowY: number;
}> = {
    'monster.slime': {width: 256, height: 224, ground: .86, plainScale: .94, habitatScale: 1.15, shadowX: 107, shadowY: 19},
    'monster.cave_bat': {width: 380, height: 280, ground: 250 / 280, plainScale: 1, habitatScale: 1.05, shadowX: 88, shadowY: 12},
    'monster.moss_beast': {width: 370, height: 290, ground: 260 / 290, plainScale: 1, habitatScale: 1.06, shadowX: 144, shadowY: 18},
};

/** Transparent actor; habitat framing shares the preview's camera and scale. */
export class MonsterPortraitRenderer {
    private readonly app = new Application();
    private actor: SlimeActor | CaveBatActor | MossBeastActor | null = null;
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
        const frame = frames[this.monsterId];
        this.actor = this.monsterId === 'monster.cave_bat' ? new CaveBatActor()
            : this.monsterId === 'monster.moss_beast' ? new MossBeastActor() : new SlimeActor();
        this.shadow = new Graphics().ellipse(0, 8, frame.shadowX, frame.shadowY).fill({color: 0x356663, alpha: .16});
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
        const frame = frames[this.monsterId];
        this.actor.position.set(width / 2, height * (this.inHabitat ? .74 : frame.ground));
        this.actor.scale.set(this.inHabitat
            ? Math.min(width / 640, height / 420) * frame.habitatScale
            : Math.min(width / frame.width, height / frame.height) * frame.plainScale);
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
        } else if (this.actor instanceof MossBeastActor) {
            this.actor.update(sampleMossBeastPose('idle', this.time, 1), this.time, 1);
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
