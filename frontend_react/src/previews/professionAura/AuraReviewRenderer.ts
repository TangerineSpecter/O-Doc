import {loadPlayerStill} from '../../components/Combat/art/playerStillArt';
import {getProfessionAura} from '../../components/Combat/art/professionAuras';
import {drawProfessionAura} from '../../components/Combat/animation/playerAppearance/professionAuraDrawing';

/** Lightweight review uses the production drawing functions without one WebGL context per card. */
export class AuraReviewRenderer {
    private rear = document.createElement('canvas');
    private ground = document.createElement('canvas');
    private rc: CanvasRenderingContext2D;
    private gc: CanvasRenderingContext2D;
    private context: CanvasRenderingContext2D;
    private image: HTMLImageElement | null = null;
    private request = 0;
    private disposed = false;
    private elapsed = 0;
    private lastTime = 0;
    private lastFrame = -1;
    visible = true;
    paused = false;
    constructor(canvas: HTMLCanvasElement, private jobId: string) {
        canvas.width = this.rear.width = this.ground.width = 168;
        canvas.height = this.rear.height = this.ground.height = 190;
        this.context = canvas.getContext('2d')!;
        this.rc = this.rear.getContext('2d')!; this.gc = this.ground.getContext('2d')!;
        this.context.imageSmoothingEnabled = false;
    }
    async start() {
        const url = await loadPlayerStill(this.jobId, false);
        const image = new Image();
        await new Promise<void>((resolve, reject) => {image.onload = () => resolve(); image.onerror = () => reject(new Error('形象加载失败')); image.src = url;});
        if (this.disposed) return;
        this.image = image; this.draw(0); this.request = requestAnimationFrame(this.tick);
    }
    private tick = (now: number) => {
        if (this.disposed) return;
        const delta = this.lastTime ? Math.min((now - this.lastTime) / 1000, .1) : 0;
        this.lastTime = now;
        if (!this.paused) this.elapsed += delta;
        const frame = Math.floor(this.elapsed * 12);
        if (this.visible && frame !== this.lastFrame) {this.draw(frame / 12); this.lastFrame = frame;}
        this.request = requestAnimationFrame(this.tick);
    };
    private draw(time: number) {
        for (const c of [this.rc, this.gc]) {
            c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, 168, 190);
            c.setTransform(.25, 0, 0, .25, 84, 171);
        }
        drawProfessionAura(this.rc, this.gc, getProfessionAura(this.jobId), time);
        this.context.clearRect(0, 0, 168, 190);
        this.context.drawImage(this.ground, 0, 0); this.context.drawImage(this.rear, 0, 0);
        if (this.image) this.context.drawImage(this.image, 0, 0, 168, 190);
    }
    dispose() {
        this.disposed = true; cancelAnimationFrame(this.request); this.image = null;
        this.rear.width = this.ground.width = 0;
    }
}
