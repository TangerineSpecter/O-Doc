/* Art-directed FK arms; foot-constrained two-bone legs. Coordinates are character-local. */
window.AnyaMotion = (() => {
    const actions = {
        idle: { name: '待机', detail: '自然站立与呼吸', duration: 3.2, description: '双脚支撑，肩膀放松，剑低位携带。呼吸只轻微带动胸口、头和手臂。' },
        move: { name: '移动', detail: '接触 → 支撑 → 摆腿', duration: 1.25, description: '侧向原地行走：脚跟接触、脚掌支撑、脚尖离地，再抬脚前摆。肩膀与腿反向运动。' },
        attack: { name: '攻击', detail: '预备 → 突刺 → 收势', duration: 1.6, description: '前后脚支撑，屈肘把剑收至腰侧，肩膀和重心向前送出，伸臂突刺后收势；手掌与剑柄保持同一握点。' },
        cast: { name: '施法', detail: '抬臂 → 展掌 → 释放', duration: 2.6, description: '持剑手维持低位，另一只手向前展开，掌心聚能后释放。' },
        hit: { name: '受击', detail: '后仰 → 屈膝 → 恢复', duration: 1.15, description: '脚底保持接触，髋部后退下沉，屈膝缓冲，躯干后仰，再恢复站姿。' }
    };
    const radians = d => d * Math.PI / 180;
    const ease = t => t * t * (3 - 2 * t);
    const mix = (a, b, t) => a + (b - a) * t;
    function curve(t, keys) { for (let i = 1; i < keys.length; i++)
        if (t <= keys[i][0]) {
            const a = keys[i - 1], b = keys[i];
            return mix(a[1], b[1], ease((t - a[0]) / (b[0] - a[0])));
        } return keys.at(-1)[1]; }
    // Contact follows the visible boot sole, not the transparent sprite rectangle.
    const sole = [[-15, 10], [-6, 12], [0, 15], [14, 17], [30, 14], [34, 10]];
    function foot(x, angle = 0, lift = 0, contact = true) {
        const a = radians(angle);
        const height = Math.max(...sole.map(([sx, sy]) => sx * Math.sin(a) + sy * Math.cos(a)));
        return { x, y: -height - lift, angle, contact };
    }
    function step(phase, offset) {
        phase = (phase + 1) % 1;
        if (phase < .6) {
            const angle = curve(phase, [[0, -10], [.08, 0], [.46, 0], [.6, 16]]);
            return foot(offset + mix(36, -36, phase / .6), angle);
        }
        const p = (phase - .6) / .4;
        return foot(offset + mix(-36, 36, ease(p)), mix(16, -10, p), 28 * Math.sin(Math.PI * p), false);
    }
    function solve(a, b, l1, l2, branch = -1) { const dx = b.x - a.x, dy = b.y - a.y, raw = Math.hypot(dx, dy), d = Math.min(l1 + l2 - .001, Math.max(.001, raw)), ux = dx / (raw || 1), uy = dy / (raw || 1), along = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - along * along)); return { joint: { x: a.x + along * ux - branch * h * uy, y: a.y + along * uy + branch * h * ux }, end: { x: a.x + d * ux, y: a.y + d * uy }, clamped: raw > d + .01 }; }
    function pose(action, time) {
        const p = Math.min(1, time / actions[action].duration), s = Math.sin(p * Math.PI * 2);
        const q = { pelvisX: 0, pelvisY: -147, lean: 0, head: s * .5, breath: s * 1, upperN: 18, lowerN: 24, upperF: -12, lowerF: -6, sword: 120, nearFoot: foot(-20), farFoot: foot(25), cast: 0, impact: 0, walk: 0 };
        if (action === 'idle') {
            q.upperN += s * .8;
            q.lowerN += s;
            q.upperF -= s * .8;
        }
        if (action === 'move') {
            q.walk = p;
            q.pelvisY = -142 + 3 * Math.cos(p * Math.PI * 4);
            q.nearFoot = step(p, -5);
            q.farFoot = step(p + .5, 5);
            q.upperN = 12 - 21 * Math.cos(p * Math.PI * 2);
            q.lowerN = q.upperN + 9;
            q.upperF = -5 + 22 * Math.cos(p * Math.PI * 2);
            q.lowerF = q.upperF - 10;
            q.sword = 115 + 8 * Math.cos(p * Math.PI * 2);
            q.lean = 4;
            q.head = -2;
        }
        if (action === 'attack') {
            const ready = curve(p, [[0, 0], [.18, 1], [.72, 1], [1, 0]]), strike = curve(p, [[0, 0], [.28, 0], [.4, 1], [.48, 1], [.7, 0], [1, 0]]);
            q.nearFoot = foot(45);
            q.farFoot = foot(-25);
            q.pelvisX = -4 * ready + 19 * strike;
            q.pelvisY = -137 + 2 * ready + 5 * strike;
            q.lean = -4 * ready + 15 * strike;
            q.upperN = 18 + 12 * ready - 82 * strike;
            q.lowerN = 24 - 124 * ready + 12 * strike;
            q.sword = 120 - 120 * ready - 5 * strike;
            q.upperF = -12 + 28 * strike;
            q.lowerF = -6 + 20 * strike;
            q.head = -q.lean * .4;
        }
        if (action === 'cast') {
            q.cast = curve(p, [[0, 0], [.28, 1], [.68, 1], [1, 0]]);
            q.upperF = mix(-12, -70, q.cast);
            q.lowerF = mix(-6, -100, q.cast);
            q.lean = -2 * q.cast;
            q.head = 3 * q.cast;
            q.upperN = 20;
            q.lowerN = 20;
            q.sword = 118;
        }
        if (action === 'hit') {
            q.impact = curve(p, [[0, 0], [.12, 1], [.3, .75], [1, 0]]);
            q.pelvisX = -11 * q.impact;
            q.pelvisY += 12 * q.impact;
            q.lean = -10 * q.impact;
            q.head = -5 * q.impact;
            q.upperN += 18 * q.impact;
            q.lowerN -= 12 * q.impact;
            q.upperF -= 24 * q.impact;
            q.lowerF -= 12 * q.impact;
            q.sword += 10 * q.impact;
        }
        return q;
    }
    function arm(shoulder, upper, lower) { const u = radians(upper), l = radians(lower), elbow = { x: shoulder.x - 48 * Math.sin(u), y: shoulder.y + 48 * Math.cos(u) }; return { elbow, hand: { x: elbow.x - 44 * Math.sin(l), y: elbow.y + 44 * Math.cos(l) } }; }
    return { actions, pose, solve, arm, foot, radians };
})();
