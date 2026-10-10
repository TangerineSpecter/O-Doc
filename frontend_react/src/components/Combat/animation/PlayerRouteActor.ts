import {Container, Graphics, Sprite} from 'pixi.js';
import type {Texture} from 'pixi.js';
import {createDemoWeapon, createPlayerParts, demoWeaponAnchors, playerForearmContours} from './playerRouteArt';
import type {PlayerJob, PreviewWeapon} from './playerRouteArt';
import type {PlayerPose} from './playerRouteMotion';

/** Feet origin, replaceable appearance and a weapon mounted behind the hand pixels. */
export class PlayerRouteActor extends Container {
    readonly actorId = 'preview.adventurer';
    private readonly art = new Container();
    private readonly upper = new Container();
    private readonly rightArm = new Container();
    private readonly leftArm = new Container();
    private readonly weapon = new Sprite();
    private readonly head = new Sprite();
    private readonly body = new Sprite();
    private readonly leftArmSprite = new Sprite();
    private readonly rightArmSprite = new Sprite();
    private readonly leftFoot = new Sprite();
    private readonly rightFoot = new Sprite();
    private readonly joint = new Graphics();
    private readonly bodyMask = new Graphics();
    private readonly leftMask = new Graphics();
    private readonly rightMask = new Graphics();
    private readonly sleeveJoint = new Graphics();
    private parts?: ReturnType<typeof createPlayerParts>;
    private readonly weaponTexture: Texture;

    constructor(private readonly sheet: Texture, job: PlayerJob) {
        super();
        this.art.scale.set(.375);
        this.head.pivot.set(187, 324);
        this.head.position.set(0, -204);
        this.body.position.set(-187, -208);
        this.bodyMask.position.copyFrom(this.body.position);
        this.bodyMask.rect(0, 0, 374, 180).fill(0xffffff);
        for (const points of Object.values(playerForearmContours)) {
            this.bodyMask.poly(points.map((n, i) => i % 2 ? n - 415 : n)).cut();
        }
        this.body.mask = this.bodyMask;
        this.leftArm.position.set(-77, -143);
        this.leftArmSprite.position.set(-38, -3);
        this.rightArm.position.set(108, -143);
        this.rightArmSprite.position.set(-25, -3);
        this.leftMask.poly(playerForearmContours.left.map((n, i) => i % 2 ? n - 480 : n - 110)).fill(0xffffff);
        this.rightMask.poly(playerForearmContours.right.map((n, i) => i % 2 ? n - 480 : n - 295)).fill(0xffffff);
        this.leftArmSprite.mask = this.leftMask;
        this.rightArmSprite.mask = this.rightMask;
        this.weaponTexture = createDemoWeapon(sheet);
        this.weapon.texture = this.weaponTexture;
        this.weapon.pivot.copyFrom(demoWeaponAnchors.grip);
        this.weapon.position.set(12, 23);
        this.weapon.scale.set(1.3);
        this.weapon.rotation = -.28;
        this.leftFoot.pivot.set(43, 28);
        this.leftFoot.position.set(-40, 0);
        this.rightFoot.pivot.set(54, 28);
        this.rightFoot.position.set(62, 0);
        this.joint.rect(-60, -44, 48, 35).rect(25, -44, 55, 35).fill(0x49343c);
        this.rightArm.addChild(this.weapon, this.rightArmSprite, this.rightMask);
        this.leftArm.addChild(this.leftArmSprite, this.leftMask);
        this.upper.addChild(this.sleeveJoint, this.body, this.bodyMask, this.leftArm, this.rightArm, this.head);
        this.art.addChild(this.joint, this.leftFoot, this.rightFoot, this.upper);
        this.addChild(this.art);
        this.setJob(job);
        this.setWeapon('demo.crystal_staff');
    }

    setJob(job: PlayerJob) {
        const previous = this.parts;
        this.parts = createPlayerParts(this.sheet, job);
        this.head.texture = this.parts.head;
        this.body.texture = this.parts.body;
        this.leftArmSprite.texture = this.parts.leftArm;
        this.rightArmSprite.texture = this.parts.rightArm;
        this.leftFoot.texture = this.parts.leftFoot;
        this.rightFoot.texture = this.parts.rightFoot;
        const sleeveColors: Record<PlayerJob, number> = {
            'job.novice': 0xf5e8c7, 'job.mage': 0x75afd0,
            'job.elementalist': 0x356f72, 'job.pyromancer': 0xb63e31,
        };
        // Overlapping elbow pixels sit behind the sleeve, never through the robe hem.
        this.sleeveJoint.clear().rect(-100, -151, 44, 29).rect(90, -151, 43, 29).fill(sleeveColors[job]);
        if (previous) Object.values(previous).forEach(texture => texture.destroy(false));
    }

    setWeapon(weapon: PreviewWeapon) { this.weapon.visible = weapon !== 'none'; }

    update(pose: PlayerPose, facing: -1 | 1) {
        this.art.scale.x = .375 * facing;
        this.art.y = -pose.lift;
        this.art.rotation = pose.fall * 1.35 * facing;
        this.art.alpha = 1 - pose.fall * .4;
        this.upper.y = Math.round(pose.bob / .375);
        this.upper.rotation = pose.lean;
        this.rightArm.rotation = pose.arm * .65;
        // Keep the crystal outside the face as the wrist lifts to cast.
        this.weapon.rotation = -.28 - pose.arm * .65;
        this.leftArm.rotation = -pose.arm * .45;
        this.leftFoot.y = -Math.round(Math.max(0, pose.step) * 12);
        this.rightFoot.y = -Math.round(Math.max(0, -pose.step) * 12);
        this.upper.tint = pose.flash > .3 ? 0xffc9c9 : 0xffffff;
    }

    /** Equipped staff emits at its crystal; empty-hand casting uses the grip instead. */
    getCastAnchor() {
        if (this.weapon.visible) return this.toLocal(this.weapon.toGlobal(demoWeaponAnchors.emitter));
        return this.toLocal(this.rightArm.toGlobal({x: 12, y: 23}));
    }

    override destroy() {
        super.destroy({children: true});
        if (this.parts) Object.values(this.parts).forEach(texture => texture.destroy(false));
        this.weaponTexture.destroy(false);
    }
}
