import {Container, Sprite, Texture} from 'pixi.js';
import {MeadowShatter} from '../meadowPixels/MeadowShatter';
import {meadowShatterAt, sampleMeadowPose} from '../meadowPixels/meadowMotion';
import {loadDefeatArtwork} from '../pixelDefeat/PixelDefeatEffect';
import {elementMonsterArt} from '../../art/elementMonsterArt';

type Motion = 'idle' | 'attack' | 'hit';
const bosses = new Set(['tide_crown', 'dragon', 'griffin', 'firebird']);
const elites = new Set(['reef_guard', 'armored', 'falcon', 'horn']);
const flying = new Set(['little_spirit', 'cloudbird', 'bell', 'falcon', 'griffin', 'firebird']);
const colors: Record<string, string> = {water: '#53b9cf', earth: '#c58e42', wind: '#91bddd', fire: '#e9793c'};

/** Uses the individually confirmed art and the shared meadow hit/defeat visual. */
export class ElementMonsterActor extends Container {
    private readonly texture: Texture;
    private readonly body: Sprite;
    private readonly fragments = new MeadowShatter();
    private readonly fragmentImage: ImageData;
    private readonly color: string;
    private shattered = false;
    private previousDefeat?: number;
    readonly airborne: boolean;

    private constructor(readonly id: string, art: Awaited<ReturnType<typeof loadDefeatArtwork>>) {
        super();
        const parts = id.split('.');
        const name = parts[parts.length - 1] || '';
        this.airborne = flying.has(name);
        this.color = colors[id.split('.')[2]] || '#ddd9cc';
        this.texture = Texture.from(art.still);
        this.texture.source.scaleMode = 'nearest';
        this.body = new Sprite(this.texture);
        this.body.anchor.set(.5, 1);
        const factor = 128 / Math.max(art.still.width, art.still.height);
        this.body.scale.set(factor);
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 128;
        const ctx = canvas.getContext('2d')!;
        ctx.imageSmoothingEnabled = false;
        const fragmentFactor = 118 / Math.max(art.still.width, art.still.height);
        ctx.drawImage(art.still, (128 - art.still.width * fragmentFactor) / 2,
            118 - art.still.height * fragmentFactor, art.still.width * fragmentFactor, art.still.height * fragmentFactor);
        this.fragmentImage = ctx.getImageData(0, 0, 128, 128);
        this.addChild(this.body, this.fragments);
        this.scale.set((bosses.has(name) ? 245 : elites.has(name) ? 210 : 185) / 128);
    }

    static async load(id: string): Promise<ElementMonsterActor | null> {
        const art = elementMonsterArt[id];
        return art ? new ElementMonsterActor(id, await loadDefeatArtwork(art.src)) : null;
    }

    sample(motion: Motion, elapsed: number, ambient: number, defeatAge?: number) {
        if (defeatAge === undefined || (this.previousDefeat !== undefined && defeatAge < this.previousDefeat)) {
            if (this.shattered) this.fragments.reset();
            this.shattered = false;
        }
        this.previousDefeat = defeatAge;
        if (defeatAge !== undefined && defeatAge >= meadowShatterAt) {
            this.body.visible = false;
            if (!this.shattered) {
                this.fragments.start(this.fragmentImage, 0, [this.color]);
                this.shattered = true;
            }
            this.fragments.sample(defeatAge - meadowShatterAt);
            return;
        }
        this.body.visible = true;
        const base = 128 / Math.max(this.texture.width, this.texture.height);
        if (motion === 'hit' || defeatAge !== undefined) {
            const pose = sampleMeadowPose('beetle', defeatAge !== undefined ? 'defeat' : 'hit',
                defeatAge ?? elapsed, ambient, -1);
            this.body.x = pose.x;
            this.body.y = pose.y + (this.airborne ? -8 : 0);
            this.body.scale.set(base * pose.sx, base * pose.sy);
            this.body.rotation = pose.tilt * Math.PI / 180;
            this.body.tint = pose.flash ? 0xffd6cb : 0xffffff;
            return;
        }
        const phase = Math.sin(ambient * 2);
        const thrust = motion === 'attack' ? Math.sin(Math.PI * Math.min(1, elapsed / 1.1)) : 0;
        this.body.scale.set(base * (1 + .025 * phase + .04 * thrust), base * (1 - .018 * phase));
        this.body.y = Math.round((this.airborne ? -8 : 0) - Math.abs(phase) * 1.5 - thrust * 3);
        this.body.x = 0;
        this.body.tint = 0xffffff;
        this.body.rotation = -thrust * .035;
    }

    get shake() { return this.shattered ? this.fragments.shake : 0; }

    override destroy() {
        if (this.destroyed) return;
        super.destroy({children: true});
        this.texture.destroy(true);
    }
}
