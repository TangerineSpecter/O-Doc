import {Application, Graphics} from 'pixi.js';
import {SlimeActor} from './SlimeActor';
import {sampleSlimePose} from './slimeMotion';

/** Transparent actor; habitat framing shares the preview's camera and scale. */
export class SlimePortraitRenderer {
    private readonly app = new Application();
    private actor: SlimeActor | null = null;
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

    constructor(private readonly host: HTMLElement, private readonly inHabitat = false) {}

    async init() {
        await this.app.init({
            width: Math.max(1, this.host.clientWidth), height: Math.max(1, this.host.clientHeight),
            antialias: true, backgroundAlpha: 0, autoDensity: true,
            resolution: Math.min(devicePixelRatio || 1, 2), preference: 'webgl', autoStart: false,
        });
        this.initialized = true;
        if (this.disposed) { this.app.destroy(true, {children: true}); return; }
        this.actor = new SlimeActor();
        this.shadow = new Graphics().ellipse(0, 8, 107, 19).fill({color: 0x356663, alpha: .16});
        this.app.stage.addChild(this.shadow, this.actor);
        this.app.canvas.setAttribute('aria-hidden', 'true');
        this.app.canvas.style.cssText = 'display:block;width:100%;height:100%;pointer-events:none';
        this.host.appendChild(this.app.canvas);
        this.app.ticker.add(ticker => {
            this.time += Math.min(ticker.deltaMS / 1000, .05);
            this.actor?.update(sampleSlimePose('idle', this.time, 1), this.time, 1);
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
        this.actor.position.set(width / 2, height * (this.inHabitat ? .74 : .86));
        this.actor.scale.set(this.inHabitat
            ? Math.min(width / 640, height / 420) * 1.15
            : Math.min(width / 256, height / 224) * .94);
        this.shadow?.position.copyFrom(this.actor.position);
        this.shadow?.scale.copyFrom(this.actor.scale);
        this.actor.update(sampleSlimePose('idle', this.time, 1), this.time, 1);
        this.app.render();
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
