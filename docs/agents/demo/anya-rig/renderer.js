window.AnyaRenderer = class {
    constructor(canvas, image) { this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.image = image; this.parts = AnyaAtlas; }
    sprite(key, x, y, w, h) { const r = this.parts[key]; this.ctx.drawImage(this.image, r.x, r.y, r.w, r.h, x, y, w, h); }
    bone(name, a, b) { this.joints.push({ name, ...b, parent: a }); }
    leg(side, hip, f) { const r = AnyaMotion.solve(hip, f, 66, 66, -1); this.bone('hip' + side, null, hip); this.bone('knee' + side, hip, r.joint); this.bone('ankle' + side, r.joint, r.end); AnyaArt.leg(this.ctx, hip, r.joint, r.end, side === 'F'); this.ctx.save(); this.ctx.translate(r.end.x, r.end.y); this.ctx.rotate(AnyaMotion.radians(f.angle)); if (side === 'F')
        this.ctx.filter = 'brightness(.9)'; this.sprite('boot', -16, -18, 50, 35); this.ctx.restore(); if (r.clamped)
        this.clamped++; }
    arm(side, shoulder, q) { const near = side === 'N', upper = (near ? q.upperN : q.upperF) + q.lean, lower = (near ? q.lowerN : q.lowerF) + q.lean, r = AnyaMotion.arm(shoulder, upper, lower), c = this.ctx; this.bone('shoulder' + side, null, shoulder); this.bone('elbow' + side, shoulder, r.elbow); this.bone('hand' + side, r.elbow, r.hand); AnyaArt.limb(c, shoulder, r.elbow, r.hand, 17, !near); AnyaArt.sleeve(c, shoulder, AnyaMotion.radians(upper), !near); if (!near && q.cast > .3) {
        AnyaArt.palm(c, r.hand);
        this.palm = { x: r.hand.x + 17, y: r.hand.y - 13 };
    }
    else
        AnyaArt.fist(c, r.hand, AnyaMotion.radians(near ? q.sword + q.lean : lower), near, !near); if (near) {
        const a = AnyaMotion.radians(q.sword + q.lean);
        this.weaponTip = { x: r.hand.x + 128 * Math.cos(a), y: r.hand.y + 128 * Math.sin(a) };
    } }
    render(action, time, options = {}) {
        const c = this.ctx, W = this.canvas.width, H = this.canvas.height, q = AnyaMotion.pose(action, time), p = Math.min(1, time / AnyaMotion.actions[action].duration);
        this.joints = [];
        this.clamped = 0;
        this.palm = null;
        this.weaponTip = null;
        c.resetTransform();
        c.clearRect(0, 0, W, H);
        const scale = Math.min(W / (W < 400 ? 300 : 610), H / 515);
        c.save();
        c.translate(W * .49, H * .87);
        c.scale((options.flip ? -1 : 1) * scale, scale);
        this.stage(action, p, q);
        const spread = options.spread ? 45 : 0, hip = { x: q.pelvisX, y: q.pelvisY }, a = AnyaMotion.radians(q.lean), point = (x, y) => ({ x: hip.x + x * Math.cos(a) - y * Math.sin(a), y: hip.y + x * Math.sin(a) + y * Math.cos(a) }), n = point(-30 - spread, -90), f = point(33 + spread, -91);
        const legOffset = action === 'attack' ? 14 : action === 'move' ? -5 : -14;
        this.leg('F', { x: hip.x - legOffset + spread, y: hip.y }, { ...q.farFoot, x: q.farFoot.x + spread });
        this.arm('F', f, q);
        this.leg('N', { x: hip.x + legOffset - spread, y: hip.y }, { ...q.nearFoot, x: q.nearFoot.x - spread });
        c.save();
        c.translate(hip.x, hip.y);
        c.rotate(a);
        this.sprite('torso', -54, -119 - q.breath, 108, 136 + q.breath);
        c.restore();
        const neck = point(-5, -116 - spread);
        this.bone('spine', hip, neck);
        c.save();
        c.translate(neck.x, neck.y - q.breath);
        c.rotate(AnyaMotion.radians(q.head + q.lean * .3));
        this.sprite('head', -104, -164, 180, 166);
        c.restore();
        this.arm('N', n, q);
        if (options.effects)
            this.effects(action, p, q);
        if (options.bones) {
            c.lineWidth = 1.1;
            c.strokeStyle = '#247e77';
            c.fillStyle = '#fffef3';
            for (const j of this.joints) {
                if (j.parent) {
                    c.beginPath();
                    c.moveTo(j.parent.x, j.parent.y);
                    c.lineTo(j.x, j.y);
                    c.stroke();
                }
                c.beginPath();
                c.arc(j.x, j.y, 2.5, 0, 7);
                c.fill();
                c.stroke();
            }
            for (const foot of [q.nearFoot, q.farFoot]) {
                c.fillStyle = foot.contact ? '#247e77' : '#c5914d';
                c.fillRect(foot.x - 7, 4, 25, 2);
            }
        }
        c.restore();
    }
    stage(action, p, q) { const c = this.ctx; c.strokeStyle = '#aba89d66'; c.lineWidth = .8; c.beginPath(); c.moveTo(-190, 1); c.lineTo(230, 1); c.stroke(); if (action === 'move') {
        c.strokeStyle = '#aaa69c55';
        for (let i = -5; i < 7; i++) {
            const x = i * 42 - p * 120 % 42;
            c.beginPath();
            c.moveTo(x, 1);
            c.lineTo(x - 6, 5);
            c.stroke();
        }
    } c.fillStyle = '#63574812'; c.beginPath(); c.ellipse(q.pelvisX + 4, 4, 70, 7, 0, 0, 7); c.fill(); }
    effects(action, p, q) {
        const c = this.ctx;
        if (action === 'cast' && this.palm && p > .16 && p < .88) {
            const flight = Math.max(0, (p - .67) / .21), x = this.palm.x + flight * 130, y = this.palm.y - flight * 8;
            c.save();
            c.globalAlpha = q.cast;
            const glow = c.createRadialGradient(x, y, 1, x, y, 25);
            glow.addColorStop(0, '#fbffde');
            glow.addColorStop(.32, '#9cdd91cc');
            glow.addColorStop(1, '#81bd7900');
            c.fillStyle = glow;
            c.beginPath();
            c.arc(x, y, 25, 0, 7);
            c.fill();
            c.strokeStyle = '#8bb77a';
            c.lineWidth = .8;
            c.beginPath();
            c.ellipse(x, y, 23, 9, p * 8, 0, 7);
            c.stroke();
            c.restore();
        }
        if (action === 'attack' && this.weaponTip && p > .36 && p < .55) {
            c.save();
            c.globalAlpha = Math.sin((p - .36) / .19 * Math.PI) * .5;
            c.strokeStyle = '#c4a56c';
            c.lineWidth = 1.5;
            for (let i = -1; i <= 1; i++) {
                c.beginPath();
                c.moveTo(this.weaponTip.x + 4, this.weaponTip.y + i * 9);
                c.lineTo(this.weaponTip.x + 20, this.weaponTip.y + i * 14);
                c.stroke();
            }
            c.restore();
        }
        if (action === 'hit' && p < .3) {
            c.save();
            c.globalAlpha = q.impact * .7;
            c.strokeStyle = '#b77763';
            c.lineWidth = 1.6;
            for (let i = 0; i < 3; i++) {
                c.beginPath();
                c.moveTo(48 + i * 8, -222 + i * 9);
                c.lineTo(56 + i * 8, -229 + i * 9);
                c.stroke();
            }
            c.restore();
        }
    }
};
